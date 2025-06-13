import {Injectable} from '@angular/core';
import {Subject, Observable, of, lastValueFrom} from 'rxjs';
import {NetService} from '@eg/core/net.service';
import {AuthService} from '@eg/core/auth.service';
import {StoreService} from '@eg/core/store.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {IdlService,IdlObject} from '@eg/core/idl.service';
import { BucketService } from '@eg/staff/share/buckets/bucket.service';

@Injectable()
export class RecordBucketService {
    private readonly BUCKET_TYPE = 'biblio';
    private bibBucketsRefreshRequested = new Subject<void>();
    bibBucketsRefreshRequested$ = this.bibBucketsRefreshRequested.asObservable();

    constructor(
        private store: StoreService,
        private net: NetService,
        private auth: AuthService,
        private pcrud: PcrudService,
        private idl: IdlService,
        private bucketService: BucketService
    ) {}

    // Bucket Management - Direct delegation to shared service
    requestBibBucketsRefresh(): void {
        this.bibBucketsRefreshRequested.next();
        this.bucketService.requestBucketsRefresh(this.BUCKET_TYPE);
    }

    logRecordBucket(bucketId: number): void {
        this.bucketService.logBucket(this.BUCKET_TYPE, bucketId);
    }

    recentRecordBucketIds(): number[] {
        return this.bucketService.getRecentBuckets(this.BUCKET_TYPE);
    }

    async checkBucketAccess(bucket: IdlObject | number, requiresWrite: boolean = false): Promise<IdlObject> {
        return this.bucketService.checkBucketAccess(this.BUCKET_TYPE, bucket, requiresWrite);
    }

    async createBucket(name: string, description: string = '', bucketType: string = 'staff_client', isPublic: boolean = false): Promise<{id: number, name: string}> {
        const id = await lastValueFrom(
            this.bucketService.createBucket(this.BUCKET_TYPE, name, description, bucketType, isPublic)
        );
        return { id, name };
    }

    async retrieveBucketById(bucketId: number): Promise<IdlObject> {
        return lastValueFrom(this.bucketService.retrieveBucketById(this.BUCKET_TYPE, bucketId));
    }

    async updateBucket(bucket: IdlObject): Promise<any> {
        await lastValueFrom(this.bucketService.updateBucket(this.BUCKET_TYPE, bucket));
        return { success: true, id: bucket.id() };
    }

    async deleteBucket(bucketId: number): Promise<{success: boolean, message?: string}> {
        try {
            await lastValueFrom(this.bucketService.deleteBucket(this.BUCKET_TYPE, bucketId));
            return { success: true };
        } catch (error: any) {
            return { success: false, message: error.message || 'Unknown error' };
        }
    }

    getRecordBucketCountStats(bucketIds: number[]): Observable<any> {
        return this.bucketService.getBucketStats(this.BUCKET_TYPE, bucketIds);
    }

    transformBucketsForGrid(buckets: IdlObject[] | IdlObject): any[] {
        return this.bucketService.transformBucketsForGrid(this.BUCKET_TYPE, buckets);
    }

    // Record-specific functionality
    async retrieveRecordBucketItems(bucketId: number, limit = 100): Promise<any[]> {
        await this.checkBucketAccess(bucketId);
        
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

    async addBibsToRecordBucket(bucketId: number, bibIds: number[]): Promise<any> {
        return this.bucketService.addItemsToBucket(this.BUCKET_TYPE, bucketId, bibIds, true);
    }

    async removeBibsFromRecordBucket(bucketId: number, bibIds: number[]): Promise<any> {
        const requestObs = this.net.request(
            'open-ils.actor',
            'open-ils.actor.container.item.delete.batch',
            this.auth.token(),
            'biblio_record_entry',
            bucketId,
            bibIds
        );

        return lastValueFrom(requestObs);
    }

    async retrieveRecordBuckets(bucketIds: number[]): Promise<any[]> {
        if (bucketIds.length === 0) {
            return [];
        }

        const [buckets, countStats] = await Promise.all([
            this.loadRecordBuckets(bucketIds),
            lastValueFrom(this.bucketService.getBucketStats(this.BUCKET_TYPE, bucketIds))
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

        const bundle = buckets.map(bucket => ({
            bucket: this.idl.toHash(bucket),
            item_count: convertedCountStats[bucket.id().toString()]?.item_count || 0,
            org_share_count: convertedCountStats[bucket.id().toString()]?.org_share_count || 0,
            usr_view_share_count: convertedCountStats[bucket.id().toString()]?.usr_view_share_count || 0,
            usr_update_share_count: convertedCountStats[bucket.id().toString()]?.usr_update_share_count || 0,
            favorite: this.isFavoriteRecordBucket(bucket.id())
        }));
        return bundle;
    }

    private async loadRecordBuckets(bucketIds: number[]): Promise<any[]> {
        return lastValueFrom(
            this.pcrud.search('cbreb',
                {id: bucketIds},
                {flesh: 1, flesh_fields: { cbreb: ['owner','owning_lib'] }},
                {atomic: true}
            )
        );
    }

    // Favorite functionality - delegate to shared service
    async loadFavoriteRecordBucketFlags(userId: number): Promise<void> {
        await this.bucketService.loadFavoriteBucketFlags(this.BUCKET_TYPE);
    }

    isFavoriteRecordBucket(bucketId: number): boolean {
        return this.bucketService.isFavoriteBucket(this.BUCKET_TYPE, bucketId);
    }

    async addFavoriteRecordBucketFlag(bucketId: number, userId: number): Promise<void> {
        await this.bucketService.addFavoriteBucket(this.BUCKET_TYPE, bucketId);
        this.requestBibBucketsRefresh();
    }

    async removeFavoriteRecordBucketFlag(bucketId: number): Promise<void> {
        await this.bucketService.removeFavoriteBucket(this.BUCKET_TYPE, bucketId);
        this.requestBibBucketsRefresh();
    }

    getFavoriteRecordBucketIds(): number[] {
        return this.bucketService.getFavoriteBucketIds(this.BUCKET_TYPE);
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
            const results = await lastValueFrom( this.pcrud.search('cbrebi', query, {}, { atomic: true }) );
            const qualifyingBucketIds: number[] = Array.from( new Set( results.map(result => result.bucket()) ) );
            return qualifyingBucketIds;
        } catch (error) {
            console.error('Error checking bib in buckets:', error);
            return [];
        }
    }
}