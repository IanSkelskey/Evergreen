import {Injectable} from '@angular/core';
import {lastValueFrom} from 'rxjs';
import {NetService} from '@eg/core/net.service';
import {AuthService} from '@eg/core/auth.service';
import {StoreService} from '@eg/core/store.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {IdlService} from '@eg/core/idl.service';
import {BaseBucketService} from '@eg/staff/share/buckets/base-bucket.service';
import {BucketTypeConfig, RECORD_BUCKET_CONFIG} from '@eg/staff/share/buckets/bucket-types';

@Injectable({providedIn: 'root'})
export class RecordBucketService extends BaseBucketService {

    get config(): BucketTypeConfig { return RECORD_BUCKET_CONFIG; }

    constructor(
        store: StoreService,
        net: NetService,
        auth: AuthService,
        pcrud: PcrudService,
        idl: IdlService,
    ) {
        super(store, net, auth, pcrud, idl);
    }

    // --- Record-specific convenience aliases for external callers ---

    async addBibsToRecordBucket(bucketId: number, bibIds: number[]): Promise<any> {
        return this.addItemsToBucket(bucketId, bibIds);
    }

    async removeBibsFromRecordBucket(bucketId: number, bibIds: number[]): Promise<any> {
        return this.removeItemsFromBucket(bucketId, bibIds);
    }

    logRecordBucket(bucketId: number) {
        return this.logBucket(bucketId);
    }

    recentRecordBucketIds(): number[] {
        return this.recentBucketIds();
    }

    async loadFavoriteRecordBucketFlags(userId: number) {
        return this.loadFavoriteBucketFlags(userId);
    }

    isFavoriteRecordBucket(bucketId: number): boolean {
        return this.isFavoriteBucket(bucketId);
    }

    async addFavoriteRecordBucketFlag(bucketId: number, userId: number): Promise<void> {
        return this.addFavoriteBucketFlag(bucketId, userId);
    }

    async removeFavoriteRecordBucketFlag(bucketId: number): Promise<void> {
        return this.removeFavoriteBucketFlag(bucketId);
    }

    getFavoriteRecordBucketIds(): number[] {
        return this.getFavoriteBucketIds();
    }

    getRecordBucketCountStats(bucketIds: number[]) {
        return this.getBucketCountStats(bucketIds);
    }

    async retrieveRecordBuckets(bucketIds: number[]): Promise<any[]> {
        return this.retrieveBuckets(bucketIds);
    }

    requestBibBucketsRefresh() {
        this.requestBucketsRefresh();
    }

    get bibBucketsRefreshRequested$() {
        return this.bucketsRefreshRequested$;
    }

    // --- Record-specific methods (not shared) ---

    async retrieveRecordBucketItems(bucketId: number, limit = 100): Promise<any[]> {
        const query: any = {
            bucket: bucketId
        };

        const options = {
            flesh: 2,
            flesh_fields: {
                cbrebi: ['target_biblio_record_entry'],
                bre: ['simple_record']
            },
            limit: limit,
            offset: 0
        };

        const items = await lastValueFrom(
            this.pcrud.search('cbrebi', query, options, { atomic: true })
        );

        return items.map(item => {
            const simple_record = item.target_biblio_record_entry().simple_record();
            return {
                id: item.id(),
                bucketId: this.idl.pkeyValue(item.bucket()),
                bibId: item.target_biblio_record_entry().id(),
                title: simple_record.title(),
                author: simple_record.author(),
            };
        });
    }

    async checkForBibInRecordBuckets(bibId: number, bucketIds: number[]): Promise<number[]> {
        if (!bibId || bucketIds.length === 0) {
            return [];
        }

        const query = {
            target_biblio_record_entry: bibId,
            bucket: bucketIds
        };

        try {
            const results = await lastValueFrom(this.pcrud.search('cbrebi', query, {}, { atomic: true }));
            const qualifyingBucketIds: number[] = Array.from(new Set(results.map(result => result.bucket())));
            return qualifyingBucketIds;
        } catch (error) {
            console.error('Error checking bib in buckets:', error);
            return [];
        }
    }
}
