import {Injectable} from '@angular/core';
import {Subject, Observable, lastValueFrom} from 'rxjs';
import {NetService} from '@eg/core/net.service';
import {AuthService} from '@eg/core/auth.service';
import {StoreService} from '@eg/core/store.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {IdlService, IdlObject} from '@eg/core/idl.service';

@Injectable()
export class PatronBucketService {
    maxRecentPatronBuckets = 10;
    
    private patronBucketsRefreshRequested = new Subject<void>();
    patronBucketsRefreshRequested$ = this.patronBucketsRefreshRequested.asObservable();

    constructor(
        private store: StoreService,
        private net: NetService,
        private auth: AuthService,
        private pcrud: PcrudService,
        private idl: IdlService
    ) {}

    requestPatronBucketsRefresh() {
        this.patronBucketsRefreshRequested.next();
    }

    // Record recently accessed buckets
    logPatronBucket(bucketId: number) {
        console.debug('logPatronBucket', bucketId);
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

    // Retrieve items (patrons) in a bucket
    async retrievePatronBucketItems(bucketId: number): Promise<any[]> {
        try {
            const query: any = { bucket: bucketId };
            const options = {
                flesh: 2,
                flesh_fields: {
                    cubi: ['target_user'],
                    au: ['card']
                }
            };
            let items = await lastValueFrom(
                this.pcrud.search('cubi', query, options)
            );
            // Normalize to array
            if (!items) items = [];
            if (!Array.isArray(items)) items = [items];
            
            // Debug the raw items
            console.debug('Raw bucket items before mapping:', items);
            
            return items.map(item => {
                const user = item.target_user();
                
                // Debug card access
                console.debug('User:', user ? user.id() : 'null');
                console.debug('Card:', user && user.card ? user.card() : 'null');
                
                // Fix barcode access with more robust error handling
                let barcode = '';
                try {
                    // Try direct access first
                    if (user && user.card && user.card() && typeof user.card().barcode === 'function') {
                        barcode = user.card().barcode();
                    }
                } catch (e) {
                    console.warn('Error accessing barcode:', e);
                }
                
                // Fix patron name with error handling
                let firstName = '';
                let lastName = '';
                try {
                    firstName = user && typeof user.first_given_name === 'function' ? user.first_given_name() : '';
                    lastName = user && typeof user.family_name === 'function' ? user.family_name() : '';
                } catch (e) {
                    console.warn('Error accessing patron name:', e);
                }
                
                return {
                    id: item.id(),
                    bucketId: item.bucket(),
                    userId: user ? user.id() : 0,
                    patron_name: lastName ? (lastName + ', ' + firstName) : 'Unknown Patron',
                    barcode: barcode || 'No Barcode',
                    patron: user
                };
            });
        } catch (error) {
            console.error('Error retrieving patron bucket items:', error);
            throw new Error($localize`Error retrieving patron bucket items: ${error.message || error}`);
        }
    }

    // Add patrons to a bucket
    async addPatronsToPatronBucket(bucketId: number, patronIds: number[]): Promise<any> {
        this.logPatronBucket(bucketId);
        try {
            const items = [];
            patronIds.forEach(patronId => {
                const item = this.idl.create('cubi');
                item.bucket(bucketId);
                item.target_user(patronId);
                items.push(item);
            });
            return await lastValueFrom(
                this.net.request(
                    'open-ils.actor',
                    'open-ils.actor.container.item.create',
                    this.auth.token(),
                    'user',
                    items
                )
            );
        } catch (error) {
            console.error('Error adding patrons to bucket:', error);
            throw new Error($localize`Error adding patrons to bucket: ${error.message || error}`);
        }
    }

    // Remove patrons from a bucket
    async removePatronsFromPatronBucket(bucketId: number, patronIds: number[]): Promise<any> {
        try {
            return await lastValueFrom(
                this.net.request(
                    'open-ils.actor',
                    'open-ils.actor.container.item.delete.batch',
                    this.auth.token(),
                    'user',
                    bucketId,
                    patronIds
                )
            );
        } catch (error) {
            console.error('Error removing patrons from bucket:', error);
            throw new Error($localize`Error removing patrons from bucket: ${error.message || error}`);
        }
    }
}
