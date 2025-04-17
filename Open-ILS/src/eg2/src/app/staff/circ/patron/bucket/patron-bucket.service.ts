import { Injectable } from '@angular/core';
import { Subject, Observable, lastValueFrom } from 'rxjs';
import { NetService } from '@eg/core/net.service';
import { AuthService } from '@eg/core/auth.service';
import { StoreService } from '@eg/core/store.service';
import { PcrudService } from '@eg/core/pcrud.service';
import { IdlService, IdlObject } from '@eg/core/idl.service';

@Injectable()
export class PatronBucketService {
    maxRecentPatronBuckets = 10;
    private favoritePatronBucketFlags: {[bucketId: number]: IdlObject} = {};

    private patronBucketsRefreshRequested = new Subject<void>();
    patronBucketsRefreshRequested$ = this.patronBucketsRefreshRequested.asObservable();

    constructor(
        private store: StoreService,
        private net: NetService,
        private auth: AuthService,
        private pcrud: PcrudService,
        private idl: IdlService,
    ) {}

    requestPatronBucketsRefresh() {
        this.patronBucketsRefreshRequested.next();
    }

    async retrievePatronBucketItems(bucketId: number, limit = 100): Promise<any[]> {
        const query: any = {
            bucket: bucketId
        };

        const options = {
            flesh: 2,
            flesh_fields: {
                cubi: ['target_user'],
            },
            limit: limit,
            offset: 0
        };

        const items = await lastValueFrom(
            this.pcrud.search('cubi', query, options, { atomic: true })
        );

        return items.map(item => {
            return {
                id: item.id(),
                bucketId: this.idl.pkeyValue(item.bucket()),
                patronId: item.target_user().id(),
                barcode: item.target_user().card()?.barcode(),
                familyName: item.target_user().family_name(),
                firstName: item.target_user().first_given_name(),
            };
        });
    }

    async retrievePatronBuckets(bucketIds: number[]): Promise<any[]> {
        if (bucketIds.length === 0) {
            return [];
        }

        const buckets = await this.loadPatronBuckets(bucketIds);
        return buckets.map(bucket => ({
            bucket: this.idl.toHash(bucket),
            favorite: this.isFavoritePatronBucket(bucket.id())
        }));
    }

    private async loadPatronBuckets(bucketIds: number[]): Promise<any[]> {
        return lastValueFrom(
            this.pcrud.search('cub',
                {id: bucketIds},
                {flesh: 1, flesh_fields: { cub: ['owner'] }},
                {atomic: true}
            )
        );
    }

    async logPatronBucket(bucketId: number) {
        const patronBucketLog: number[] =
            this.store.getLocalItem('eg.patron_bucket_log') || [];

        if (!patronBucketLog.includes(bucketId)) {
            patronBucketLog.unshift(bucketId);

            if (patronBucketLog.length > this.maxRecentPatronBuckets) {
                patronBucketLog.pop();
            }

            this.store.setLocalItem('eg.patron_bucket_log', patronBucketLog);
        }
    }

    recentPatronBucketIds(): number[] {
        return this.store.getLocalItem('eg.patron_bucket_log') || [];
    }

    async loadFavoritePatronBucketFlags(userId: number) {
        const flags = await lastValueFrom(
            this.pcrud.search('cubuf', { flag: 'favorite', usr: userId }, {}, { idlist: false, atomic: true })
        );
        this.favoritePatronBucketFlags = {};
        if (flags && flags.length) {
            flags.forEach(flag => {
                this.favoritePatronBucketFlags[flag.bucket()] = flag;
            });
        }
    }

    isFavoritePatronBucket(bucketId: number): boolean {
        return !!this.favoritePatronBucketFlags[bucketId];
    }

    async addFavoritePatronBucketFlag(bucketId: number, userId: number): Promise<void> {
        if (!this.favoritePatronBucketFlags[bucketId]) {
            const flag = this.idl.create('cubuf');
            flag.isnew(true);
            flag.bucket(bucketId);
            flag.usr(userId);
            flag.flag('favorite');

            try {
                const createdFlag = await lastValueFrom(this.pcrud.create(flag));
                this.favoritePatronBucketFlags[bucketId] = createdFlag;
            } catch (error) {
                console.error(`Error adding favorite for bucket ${bucketId}:`, error);
                throw error;
            }
        }
    }

    async removeFavoritePatronBucketFlag(bucketId: number): Promise<void> {
        if (this.favoritePatronBucketFlags[bucketId]) {
            try {
                await lastValueFrom(this.pcrud.remove(this.favoritePatronBucketFlags[bucketId]));
                delete this.favoritePatronBucketFlags[bucketId];
            } catch (error) {
                console.error(`Error removing favorite for bucket ${bucketId}:`, error);
                throw error;
            }
        }
    }

    getFavoritePatronBucketIds(): number[] {
        return Object.keys(this.favoritePatronBucketFlags).map(Number);
    }

    async fetchBucket(bucketId: number): Promise<IdlObject> {
        const bucket = await lastValueFrom(this.pcrud.retrieve('cub', bucketId));
        return bucket;
    }

    async detachUser(bucketItemId: number): Promise<void> {
        try {
            const item = await lastValueFrom(this.pcrud.retrieve('cubi', bucketItemId));
            if (item) {
                await lastValueFrom(this.pcrud.remove(item));
            }
        } catch (error) {
            console.error(`Error detaching user from bucket item ${bucketItemId}:`, error);
            throw error;
        }
    }
}
