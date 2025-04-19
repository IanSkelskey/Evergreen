import {Injectable} from '@angular/core';
import {Observable, Subject, lastValueFrom} from 'rxjs';
import {AuthService} from '@eg/core/auth.service';
import {NetService} from '@eg/core/net.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {EventService} from '@eg/core/event.service';
import {IdlService, IdlObject} from '@eg/core/idl.service';
import {StoreService} from '@eg/core/store.service';

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
        private idl: IdlService,
        private evt: EventService
    ) {}
    
    requestPatronBucketsRefresh() {
        this.patronBucketsRefreshRequested.next();
    }
    
    // Record recently accessed buckets
    logPatronBucket(bucketId: number) {
        console.debug('logPatronBucket', bucketId);
        const patronBucketLog = this.store.getLocalItem('eg.patron_bucket_log') || [];
        if (!patronBucketLog.includes(bucketId)) {
            patronBucketLog.unshift(bucketId);
            if (patronBucketLog.length > this.maxRecentPatronBuckets) {
                patronBucketLog.pop();
            }
            this.store.setLocalItem('eg.patron_bucket_log', patronBucketLog);
        }
    }
    
    recentPatronBucketIds() {
        return this.store.getLocalItem('eg.patron_bucket_log') || [];
    }
    
    // Create a new bucket
    async createBucket(name: string, description: string = '', bucketType: string = 'staff_client'): Promise<any> {
        try {
            const bucket = this.idl.create('cub');
            bucket.owner(this.auth.user().id());
            bucket.name(name);
            bucket.description(description || '');
            bucket.btype(bucketType);
            
            const result = await lastValueFrom(
                this.net.request(
                    'open-ils.actor',
                    'open-ils.actor.container.create',
                    this.auth.token(), 'user', bucket
                )
            );
            
            const evt = this.evt.parse(result);
            if (evt) {
                throw new Error(evt.toString());
            }
            
            // Log the newly created bucket
            this.logPatronBucket(result);
            this.requestPatronBucketsRefresh();
            
            return {
                id: result,
                name: name
            };
        } catch (error) {
            console.error('Error creating bucket:', error);
            throw new Error(`Error creating bucket: ${error.message || error}`);
        }
    }
    
    // Delete a bucket
    async deleteBucket(bucketId: number): Promise<{success: boolean, message?: string}> {
        try {
            const response = await lastValueFrom(
                this.net.request(
                    'open-ils.actor',
                    'open-ils.actor.container.full_delete',
                    this.auth.token(), 'user', bucketId
                )
            );
            
            const evt = this.evt.parse(response);
            if (evt) {
                console.error('Delete bucket error:', evt);
                return {success: false, message: evt.toString()};
            }
            
            this.requestPatronBucketsRefresh();
            return {success: true};
        } catch (error) {
            console.error('Error deleting bucket:', error);
            return {success: false, message: 'Unknown error'};
        }
    }
    
    // Retrieve bucket by ID
    async retrieveBucketById(bucketId: number): Promise<IdlObject> {
        try {
            const bucket = await lastValueFrom(this.pcrud.retrieve('cub', bucketId));
            const evt = this.evt.parse(bucket);
            if (evt) {
                throw new Error(evt.toString());
            }
            return bucket;
        } catch (error) {
            console.error('Error retrieving bucket:', error);
            throw new Error(`Error retrieving bucket: ${error.message || error}`);
        }
    }
    
    // Transform bucket objects for grid display
    transformBucketsForGrid(buckets: IdlObject[] | IdlObject): any[] {
        if (!buckets) return [];
        
        // Ensure we have an array
        const bucketArray = Array.isArray(buckets) ? buckets : [buckets];
        
        console.debug('transformBucketsForGrid input:', bucketArray);
        
        const result = bucketArray.map((bucket, index) => {
            if (!bucket) {
                console.warn(`Bucket at index ${index} is null or undefined`);
                return {
                    id: `unknown_${index}`, // Ensure there's always an ID
                    name: 'Unknown Bucket',
                    description: '',
                    btype: '',
                    'owner.usrname': '',
                    create_time: null,
                    bucket: null
                };
            }
            
            // Get ID safely
            let bucketId;
            try {
                bucketId = typeof bucket.id === 'function' ? bucket.id() : 
                           (bucket.id || `bucket_${index}`);
            } catch (e) {
                console.warn('Error accessing bucket ID:', e);
                bucketId = `error_${index}`;
            }
            
            let ownerUsername = '';
            try {
                ownerUsername = bucket.owner() && typeof bucket.owner().usrname === 'function' ? 
                    bucket.owner().usrname() : '';
            } catch (e) {
                console.warn('Error accessing owner username:', e);
            }
            
            const item = {
                id: bucketId, // Always provide a valid ID
                name: bucket.name(),
                description: bucket.description(),
                btype: bucket.btype(),
                'owner.usrname': ownerUsername,
                create_time: bucket.create_time() ? new Date(bucket.create_time()) : null,
                bucket: bucket
            };
            
            console.debug('Transformed bucket item:', item);
            return item;
        });
        
        console.debug('transformBucketsForGrid output:', result);
        return result;
    }
    
    // Retrieve items (patrons) in a bucket
    async retrievePatronBucketItems(bucketId: number): Promise<any[]> {
        try {
            const query = { 
                bucket: bucketId 
            };
            const options = {
                flesh: 2,
                flesh_fields: {
                    cubi: ['target_user'],
                    au: ['card']
                }
            };
            
            let items = await lastValueFrom(this.pcrud.search('cubi', query, options));
            
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
                    patron_name: lastName ? lastName + ', ' + firstName : 'Unknown Patron',
                    barcode: barcode || 'No Barcode',
                    patron: user
                };
            });
        } catch (error) {
            console.error('Error retrieving patron bucket items:', error);
            throw new Error(`Error retrieving patron bucket items: ${error.message || error}`);
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
                    this.auth.token(), 'user', items
                )
            );
        } catch (error) {
            console.error('Error adding patrons to bucket:', error);
            throw new Error(`Error adding patrons to bucket: ${error.message || error}`);
        }
    }
    
    // Remove patrons from a bucket
    async removePatronsFromPatronBucket(bucketId: number, patronIds: number[]): Promise<any> {
        try {
            return await lastValueFrom(
                this.net.request(
                    'open-ils.actor',
                    'open-ils.actor.container.item.delete.batch',
                    this.auth.token(), 'user', bucketId, patronIds
                )
            );
        } catch (error) {
            console.error('Error removing patrons from bucket:', error);
            throw new Error(`Error removing patrons from bucket: ${error.message || error}`);
        }
    }
}
