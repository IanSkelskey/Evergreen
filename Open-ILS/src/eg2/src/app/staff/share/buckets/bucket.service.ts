import {Injectable} from '@angular/core';
import {Subject, Observable, of, lastValueFrom} from 'rxjs';
import {toArray} from 'rxjs/operators';
import {NetService} from '@eg/core/net.service';
import {AuthService} from '@eg/core/auth.service';
// import {ServerStoreService} from '@eg/core/server-store.service';
import {StoreService} from '@eg/core/store.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {IdlService,IdlObject} from '@eg/core/idl.service';
import {EventService} from '@eg/core/event.service';

export type BucketType = 'biblio_record_entry' | 'user';

interface BucketTypeConfig {
    bucketClass: string;
    bucketItemClass: string;
    bucketFlagClass: string;
    targetField: string;
    targetClass: string;
    apiName: string;
    logKey: string;
}

@Injectable()
export class BucketService {
    maxRecentBuckets = 10;
    private favoriteBucketFlags: {[bucketType: string]: {[bucketId: number]: IdlObject}} = {
        biblio_record_entry: {},
        user: {}
    };

    private bibBucketsRefreshRequested = new Subject<void>();
    bibBucketsRefreshRequested$ = this.bibBucketsRefreshRequested.asObservable();

    private userBucketsRefreshRequested = new Subject<void>();
    userBucketsRefreshRequested$ = this.userBucketsRefreshRequested.asObservable();

    private bucketConfigs: {[key in BucketType]: BucketTypeConfig} = {
        biblio_record_entry: {
            bucketClass: 'cbreb',
            bucketItemClass: 'cbrebi',
            bucketFlagClass: 'cbrebuf',
            targetField: 'target_biblio_record_entry',
            targetClass: 'bre',
            apiName: 'biblio_record_entry',
            logKey: 'eg.record_bucket_log'
        },
        user: {
            bucketClass: 'cub',
            bucketItemClass: 'cubi',
            bucketFlagClass: 'cubuf',
            targetField: 'target_user',
            targetClass: 'au',
            apiName: 'user',
            logKey: 'eg.user_bucket_log'
        }
    };

    constructor(
        private store: StoreService,
        private net: NetService,
        private auth: AuthService,
        private pcrud: PcrudService,
        private idl: IdlService,
        private evt: EventService,
    ) {}

    private getConfig(bucketType: BucketType): BucketTypeConfig {
        return this.bucketConfigs[bucketType];
    }

    requestBibBucketsRefresh() {
        this.bibBucketsRefreshRequested.next();
    }

    requestUserBucketsRefresh() {
        this.userBucketsRefreshRequested.next();
    }

    requestBucketsRefresh(bucketType: BucketType) {
        if (bucketType === 'biblio_record_entry') {
            this.bibBucketsRefreshRequested.next();
        } else if (bucketType === 'user') {
            this.userBucketsRefreshRequested.next();
        }
    }

    async retrieveBucketItems(bucketType: BucketType, bucketId: number, limit = 100): Promise<any[]> {
        const config = this.getConfig(bucketType);
        const query: any = {
            bucket: bucketId
        };

        const options: any = {
            flesh: 2,
            flesh_fields: {},
            limit: limit,
            offset: 0
        };

        if (bucketType === 'biblio_record_entry') {
            options.flesh_fields = {
                cbrebi: ['target_biblio_record_entry'],
                bre: ['simple_record']
            };
        } else if (bucketType === 'user') {
            options.flesh_fields = {
                cubi: ['target_user']
            };
        }

        const items = await lastValueFrom(
            this.pcrud.search(config.bucketItemClass, query, options, { atomic: true })
        );

        return items.map(item => {
            if (bucketType === 'biblio_record_entry') {
                const simple_record = item.target_biblio_record_entry().simple_record();
                return {
                    id: item.id(),
                    bucketId: this.idl.pkeyValue(item.bucket()),
                    bibId: item.target_biblio_record_entry().id(),
                    title: simple_record.title(),
                    author: simple_record.author(),
                };
            } else if (bucketType === 'user') {
                const user = item.target_user();
                return {
                    id: item.id(),
                    bucketId: this.idl.pkeyValue(item.bucket()),
                    userId: user.id(),
                    usrname: user.usrname(),
                    family_name: user.family_name(),
                    first_given_name: user.first_given_name(),
                };
            }
        });
    }

    async addItemsToBucket(bucketType: BucketType, bucketId: number, itemIds: number[]): Promise<any> {
        this.logBucket(bucketType, bucketId);
        const config = this.getConfig(bucketType);
        const items: any[] = [];
        itemIds.forEach(itemId => {
            const item = this.idl.create(config.bucketItemClass);
            item.bucket(bucketId);
            item[config.targetField](itemId);
            items.push(item);
        });

        // user bucket items may lack pcrud create support; use actor API instead
        if (bucketType === 'user') {
            const resp = await lastValueFrom(this.net.request(
                'open-ils.actor',
                'open-ils.actor.container.item.create',
                this.auth.token(), 'user', items
            ));
            const evt = this.evt.parse(resp);
            if (evt) { throw new Error(evt.toString()); }
            return itemIds; // return list of IDs added
        }

        const createdItems = await lastValueFrom(this.pcrud.create(items).pipe(toArray()));
        return createdItems.map(i => i.id());
    }

    async removeItemsFromBucket(bucketType: BucketType, bucketId: number, itemIds: number[]): Promise<any> {
        const config = this.getConfig(bucketType);
        if (bucketType === 'user') {
            const resp = await lastValueFrom(this.net.request(
                'open-ils.actor',
                'open-ils.actor.container.item.delete.batch',
                this.auth.token(), 'user', bucketId, itemIds
            ));
            const evt = this.evt.parse(resp);
            if (evt) { throw new Error(evt.toString()); }
            return true;
        }

        const query: any = { bucket: bucketId };
        query[config.targetField] = itemIds;
        return this.pcrud.search(
            config.bucketItemClass, query, {}, {atomic: true}
        ).toPromise().then(entries => this.pcrud.remove(entries).toPromise());
    }

    async retrieveBuckets(bucketType: BucketType, bucketIds: number[]): Promise<any[]> {
        if (bucketIds.length === 0) {
            return [];
        }

        const [buckets, countStats] = await Promise.all([
            this.loadBuckets(bucketType, bucketIds),
            lastValueFrom(this.getBucketCountStats(bucketType, bucketIds))
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

        console.debug(`retrieve${bucketType}Buckets, buckets`, buckets);
        console.debug(`retrieve${bucketType}Buckets, countStats`, countStats);
        const bundle = buckets.map(bucket => ({
            bucket: this.idl.toHash(bucket),
            item_count: convertedCountStats[bucket.id().toString()]?.item_count || 0,
            org_share_count: convertedCountStats[bucket.id().toString()]?.org_share_count || 0,
            usr_view_share_count: convertedCountStats[bucket.id().toString()]?.usr_view_share_count || 0,
            usr_update_share_count: convertedCountStats[bucket.id().toString()]?.usr_update_share_count || 0,
            favorite: this.isFavoriteBucket(bucketType, bucket.id())
        }));
        console.debug(`retrieve${bucketType}Buckets, bundle`, bundle);
        return bundle;
    }

    private async loadBuckets(bucketType: BucketType, bucketIds: number[]): Promise<any[]> {
        const config = this.getConfig(bucketType);
        const fleshFields: any = {};
        fleshFields[config.bucketClass] = ['owner', 'owning_lib'];

        return lastValueFrom(
            this.pcrud.search(config.bucketClass,
                {id: bucketIds},
                {flesh: 1, flesh_fields: fleshFields},
                {atomic: true}
            )
        );
    }

    getBucketCountStats(bucketType: BucketType, bucketIds: number[]): Observable<any> {
        const validBucketIds = bucketIds.filter(id => id !== -1);

        if (validBucketIds.length === 0) {
            return of({});
        }

        const config = this.getConfig(bucketType);
        return this.net.request(
            'open-ils.actor',
            `open-ils.actor.container.${config.apiName}.count_stats.authoritative`,
            this.auth.token(),
            validBucketIds
        );
    }

    async logBucket(bucketType: BucketType, bucketId: number) {
        const config = this.getConfig(bucketType);
        console.debug('logBucket', bucketType, bucketId);
        const bucketLog: number[] =
            this.store.getLocalItem(config.logKey) || [];

        // Check if the bucketId is already in the array
        if (!bucketLog.includes(bucketId)) {
            // Add the new bucketId to the beginning of the array
            bucketLog.unshift(bucketId);

            // Trim the array if it exceeds the maximum size
            if (bucketLog.length > this.maxRecentBuckets) {
                bucketLog.pop();
            }

            this.store.setLocalItem(config.logKey, bucketLog);
        }
    }

    recentBucketIds(bucketType: BucketType): number[] {
        const config = this.getConfig(bucketType);
        return this.store.getLocalItem(config.logKey) || [];
    }

    async loadFavoriteBucketFlags(bucketType: BucketType, userId: number) {
        const config = this.getConfig(bucketType);
        const flags = (await lastValueFrom(
            this.pcrud.search(config.bucketFlagClass, { flag: 'favorite', usr: userId }, {}, { idlist: false, atomic: true })
        ));
        this.favoriteBucketFlags[bucketType] = flags.reduce((acc, flag) => {
            acc[flag.bucket()] = flag;
            return acc;
        }, {});
        console.debug(`Favorites for ${bucketType}, flags`, flags);
    }

    isFavoriteBucket(bucketType: BucketType, bucketId: number): boolean {
        return !!this.favoriteBucketFlags[bucketType]?.[bucketId];
    }

    async addFavoriteBucketFlag(bucketType: BucketType, bucketId: number, userId: number): Promise<void> {
        const config = this.getConfig(bucketType);
        console.debug(`addFavoriteBucketFlag (${bucketType}): bucketId, userId, existing flag`, 
            bucketId, userId, this.favoriteBucketFlags[bucketType]?.[bucketId]);
        
        if (!this.favoriteBucketFlags[bucketType]?.[bucketId]) {
            const flag = this.idl.create(config.bucketFlagClass);
            flag.isnew(true);
            flag.bucket(bucketId);
            flag.usr(userId);
            flag.flag('favorite');

            try {
                const createdFlag = await lastValueFrom(this.pcrud.create(flag));
                if (!this.favoriteBucketFlags[bucketType]) {
                    this.favoriteBucketFlags[bucketType] = {};
                }
                this.favoriteBucketFlags[bucketType][bucketId] = createdFlag;
            } catch (error) {
                console.error(`Error adding favorite for ${bucketType} bucket ${bucketId}:`, error);
                throw error;
            }
        } else {
            console.debug('addFavoriteBucketFlag: already exists');
        }
    }

    async removeFavoriteBucketFlag(bucketType: BucketType, bucketId: number): Promise<void> {
        console.debug(`removeFavoriteBucketFlag (${bucketType}): bucketId, existing flag`, 
            bucketId, this.favoriteBucketFlags[bucketType]?.[bucketId]);
        
        if (this.favoriteBucketFlags[bucketType]?.[bucketId]) {
            try {
                await lastValueFrom(this.pcrud.remove(this.favoriteBucketFlags[bucketType][bucketId]));
                delete this.favoriteBucketFlags[bucketType][bucketId];
            } catch (error) {
                console.error(`Error removing favorite for ${bucketType} bucket ${bucketId}:`, error);
                throw error;
            }
        } else {
            console.debug('removeFavoriteBucketFlag: does not exist');
        }
    }

    getFavoriteBucketIds(bucketType: BucketType): number[] {
        return Object.keys(this.favoriteBucketFlags[bucketType] || {}).map(Number);
    }

    async checkForItemInBuckets(bucketType: BucketType, itemId: number, bucketIds: number[]): Promise<number[]> {
        if (!itemId || bucketIds.length === 0) {
            return [];
        }

        const config = this.getConfig(bucketType);
        const query: any = {
            bucket: bucketIds
        };
        query[config.targetField] = itemId;

        try {
            const results = await lastValueFrom( this.pcrud.search(config.bucketItemClass, query, {}, { atomic: true }) );
            console.debug(`checkForItemInBuckets (${bucketType}), raw results`, results);
            const qualifyingBucketIds: number[] = Array.from( new Set( results.map(result => result.bucket()) ) ); // deduped
            return qualifyingBucketIds;
        } catch (error) {
            console.error(`Error checking ${bucketType} item in buckets:`, error);
            return [];
        }
    }

}
