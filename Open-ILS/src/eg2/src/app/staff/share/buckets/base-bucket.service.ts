import {Subject, Observable, of, lastValueFrom, toArray} from 'rxjs';
import {NetService} from '@eg/core/net.service';
import {AuthService} from '@eg/core/auth.service';
import {StoreService} from '@eg/core/store.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {IdlService, IdlObject} from '@eg/core/idl.service';
import {BucketTypeConfig} from './bucket-types';

export abstract class BaseBucketService {
    abstract get config(): BucketTypeConfig;

    maxRecentBuckets = 10;
    protected favoriteBucketFlags: {[bucketId: number]: IdlObject} = {};

    private bucketsRefreshRequested = new Subject<void>();
    bucketsRefreshRequested$ = this.bucketsRefreshRequested.asObservable();

    constructor(
        protected store: StoreService,
        protected net: NetService,
        protected auth: AuthService,
        protected pcrud: PcrudService,
        protected idl: IdlService,
    ) {}

    requestBucketsRefresh() {
        this.bucketsRefreshRequested.next();
    }

    async retrieveBucketsSharedWithUser(): Promise<number[]> {
        if (!this.config.sharedWithUserApi) {
            return [];
        }

        const response = await lastValueFrom(
            this.net.request(
                'open-ils.actor',
                this.config.sharedWithUserApi,
                this.auth.token()
            )
        );

        if (!Array.isArray(response)) {
            return [];
        }

        return response
            .map(id => Number(id))
            .filter(id => Number.isInteger(id));
    }

    async countBucketsSharedWithUser(): Promise<number> {
        if (!this.config.sharedWithUserApi) {
            return 0;
        }

        const response = await lastValueFrom(
            this.net.request(
                'open-ils.actor',
                `${this.config.sharedWithUserApi}.count`,
                this.auth.token()
            )
        );

        return Number(response) || 0;
    }

    async addItemsToBucket(bucketId: number, targetIds: number[]): Promise<any> {
        this.logBucket(bucketId);
        if (targetIds.length === 0) {
            return [];
        }
        const items = targetIds.map(targetId => {
            const item = this.idl.create(this.config.bucketItemIdlClass);
            item.bucket(bucketId);
            item[this.config.targetField](targetId);
            return item;
        });
        return lastValueFrom(
            this.pcrud.create(items).pipe(toArray())
        ).then(createdItems => createdItems.map(item => item.id()));
    }

    async removeItemsFromBucket(bucketId: number, targetIds: number[]): Promise<any> {
        return this.pcrud.search(
            this.config.bucketItemIdlClass,
            { bucket: bucketId, [this.config.targetField]: targetIds },
            {}, {atomic: true}
        ).toPromise().then(entries => this.pcrud.remove(entries).toPromise());
    }

    async retrieveBuckets(bucketIds: number[]): Promise<any[]> {
        if (bucketIds.length === 0) {
            return [];
        }

        const [buckets, countStats] = await Promise.all([
            this.loadBuckets(bucketIds),
            lastValueFrom(this.getBucketCountStats(bucketIds))
        ]);

        interface CountStat {
            item_count: number;
            org_share_count: number;
            usr_view_share_count: number;
            usr_update_share_count: number;
        }

        const convertedCountStats: { [key: string]: CountStat } = Object.fromEntries(
            Object.entries(countStats).map(([key, value]) => [String(key), value as CountStat])
        );

        return buckets.map(bucket => ({
            bucket: this.idl.toHash(bucket),
            item_count: convertedCountStats[bucket.id().toString()]?.item_count || 0,
            org_share_count: convertedCountStats[bucket.id().toString()]?.org_share_count || 0,
            usr_view_share_count: convertedCountStats[bucket.id().toString()]?.usr_view_share_count || 0,
            usr_update_share_count: convertedCountStats[bucket.id().toString()]?.usr_update_share_count || 0,
            favorite: this.isFavoriteBucket(bucket.id())
        }));
    }

    protected async loadBuckets(bucketIds: number[]): Promise<any[]> {
        return lastValueFrom(
            this.pcrud.search(this.config.bucketIdlClass,
                {id: bucketIds},
                {flesh: 1, flesh_fields: { [this.config.bucketIdlClass]: this.config.bucketFleshFields }},
                {atomic: true}
            )
        );
    }

    getBucketCountStats(bucketIds: number[]): Observable<any> {
        const validBucketIds = bucketIds.filter(id => id !== -1);

        if (validBucketIds.length === 0) {
            return of({});
        }

        return this.net.request(
            'open-ils.actor',
            this.config.countStatsApi,
            this.auth.token(),
            validBucketIds
        );
    }

    private recentStorageKey(): string {
        return `${this.config.storageKey}.${this.auth.user().id()}`;
    }

    async logBucket(bucketId: number) {
        const log: number[] =
            this.store.getLocalItem(this.recentStorageKey()) || [];

        if (!log.includes(bucketId)) {
            log.unshift(bucketId);

            if (log.length > this.maxRecentBuckets) {
                log.pop();
            }

            this.store.setLocalItem(this.recentStorageKey(), log);
        }
    }

    recentBucketIds(): number[] {
        return this.store.getLocalItem(this.recentStorageKey()) || [];
    }

    async loadFavoriteBucketFlags(userId: number) {
        if (!this.config.flagIdlClass) { return; }
        const flags = (await lastValueFrom(
            this.pcrud.search(this.config.flagIdlClass, { flag: 'favorite', usr: userId }, {}, { idlist: false, atomic: true })
        ));
        this.favoriteBucketFlags = flags.reduce((acc, flag) => {
            acc[flag.bucket()] = flag;
            return acc;
        }, {});
    }

    isFavoriteBucket(bucketId: number): boolean {
        return !!this.favoriteBucketFlags[bucketId];
    }

    async addFavoriteBucketFlag(bucketId: number, userId: number): Promise<void> {
        if (!this.config.flagIdlClass || this.favoriteBucketFlags[bucketId]) { return; }
        const flag = this.idl.create(this.config.flagIdlClass);
        flag.isnew(true);
        flag.bucket(bucketId);
        flag.usr(userId);
        flag.flag('favorite');

        try {
            const createdFlag = await lastValueFrom(this.pcrud.create(flag));
            this.favoriteBucketFlags[bucketId] = createdFlag;
        } catch (error) {
            console.error(`Error adding favorite for bucket ${bucketId}:`, error);
            throw error;
        }
    }

    async removeFavoriteBucketFlag(bucketId: number): Promise<void> {
        if (!this.favoriteBucketFlags[bucketId]) { return; }
        try {
            await lastValueFrom(this.pcrud.remove(this.favoriteBucketFlags[bucketId]));
            delete this.favoriteBucketFlags[bucketId];
        } catch (error) {
            console.error(`Error removing favorite for bucket ${bucketId}:`, error);
            throw error;
        }
    }

    getFavoriteBucketIds(): number[] {
        return Object.keys(this.favoriteBucketFlags).map(Number);
    }

    async filterAccessibleIds(bucketIds: number[]): Promise<number[]> {
        if (bucketIds.length === 0) { return []; }
        const response = await lastValueFrom(
            this.net.request(
                'open-ils.actor',
                'open-ils.actor.container.filter_accessible',
                this.auth.token(),
                this.config.containerType,
                bucketIds
            )
        );
        if (!Array.isArray(response)) { return []; }
        return response.map(id => Number(id)).filter(id => Number.isInteger(id));
    }

    async checkBucketAccess(bucketId: number): Promise<IdlObject | null> {
        try {
            const response = await lastValueFrom(
                this.net.request(
                    'open-ils.actor',
                    'open-ils.actor.container.flesh',
                    this.auth.token(),
                    this.config.containerType,
                    bucketId
                )
            );

            if (!response || (typeof response === 'object' && 'textcode' in response)) {
                return null;
            }

            return response as IdlObject;
        } catch {
            return null;
        }
    }
}
