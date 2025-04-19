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
    async createBucket(name: string, description: string = '', bucketType: string = 'staff_client', isPublic: boolean = false): Promise<any> {
        try {
            const bucket = this.idl.create('cub');
            bucket.owner(this.auth.user().id());
            bucket.name(name);
            bucket.description(description || '');
            bucket.btype(bucketType);
            bucket.pub(isPublic ? 't' : 'f'); // Add public flag
            
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
    
    // Update an existing bucket
    async updateBucket(bucket: IdlObject): Promise<any> {
        try {
            console.debug('Updating bucket with data:', bucket);
            
            // Make sure pub is properly formatted - API requires 't' or 'f' character values
            if (typeof bucket.pub === 'function') {
                const pubValue = bucket.pub();
                if (pubValue === true || pubValue === false) {
                    bucket.pub(pubValue ? 't' : 'f');
                }
            }
            
            // For debugging - show what we're sending to the server
            console.log('Sending bucket update:', {
                id: bucket.id(),
                name: bucket.name(),
                description: bucket.description(),
                owner: bucket.owner(),
                btype: bucket.btype(),
                pub: bucket.pub()
            });
            
            // Try using the containers.update method with specific parameters
            const response = await lastValueFrom(
                this.net.request(
                    'open-ils.actor',
                    'open-ils.actor.containers.update',  // Use the batch version that's more reliable
                    this.auth.token(), 
                    'user', 
                    [bucket]  // Send as an array for batch API
                )
            );
            
            // Log the response for debugging
            console.debug('Bucket update response:', response);
            
            if (!response || !response[bucket.id()]) {
                throw new Error('No response from server for bucket update');
            }
            
            const result = response[bucket.id()];
            const evt = this.evt.parse(result);
            if (evt) {
                console.error('Bucket update event error:', evt);
                throw new Error(evt.toString());
            }
            
            this.requestPatronBucketsRefresh();
            return {
                success: true,
                id: bucket.id()
            };
        } catch (error) {
            console.error('Error updating bucket:', error);
            throw new Error(`Error updating bucket: ${error.message || error}`);
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
                    id: `unknown_${index}`,
                    name: 'Unknown Bucket',
                    description: '',
                    btype: '',
                    owner_usrname: '',
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
                // Check if owner is available and has usrname function
                if (bucket.owner && typeof bucket.owner === 'function') {
                    const owner = bucket.owner();
                    if (owner && typeof owner.usrname === 'function') {
                        ownerUsername = owner.usrname();
                    }
                }
            } catch (e) {
                console.warn('Error accessing owner username:', e);
            }
            
            const item = {
                id: bucketId,
                name: typeof bucket.name === 'function' ? bucket.name() : '',
                description: typeof bucket.description === 'function' ? bucket.description() : '',
                btype: typeof bucket.btype === 'function' ? bucket.btype() : '',
                owner_usrname: ownerUsername,
                create_time: typeof bucket.create_time === 'function' && bucket.create_time() ? 
                           new Date(bucket.create_time()) : null,
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
    async removePatronsFromPatronBucket(bucketId: number, itemIds: number[]): Promise<any> {
        try {
            console.debug('In service: removing items', itemIds, 'from bucket', bucketId);
            
            if (!itemIds || itemIds.length === 0) {
                throw new Error('No item IDs provided for removal');
            }
            
            // Process each item ID individually
            const results = [];
            const errors = [];
            
            for (const itemId of itemIds) {
                try {
                    console.debug(`Removing item ${itemId} from bucket ${bucketId}`);
                    
                    // Use the standard item.delete method - as defined in container.pm
                    const response = await lastValueFrom(
                        this.net.request(
                            'open-ils.actor',
                            'open-ils.actor.container.item.delete',  // This is the correct method
                            this.auth.token(), 'user', itemId
                        ),
                        { defaultValue: { success: true, id: itemId } }
                    );
                    
                    // Check for errors
                    const evt = this.evt.parse(response);
                    if (evt) {
                        console.warn(`Error removing item ${itemId}:`, evt);
                        errors.push({ id: itemId, error: evt });
                    } else {
                        results.push({ id: itemId, success: true });
                    }
                } catch (itemError) {
                    console.warn(`Exception removing item ${itemId}:`, itemError);
                    errors.push({ id: itemId, error: itemError });
                }
            }
            
            console.debug('Removal results:', { results, errors });
            
            // If all operations failed, throw an error
            if (errors.length === itemIds.length) {
                throw new Error(`Failed to remove any items: ${JSON.stringify(errors)}`);
            }
            
            // Return the results with partial success information
            return {
                success: results.length > 0,
                total: itemIds.length,
                removed: results.length,
                failed: errors.length,
                results: results,
                errors: errors
            };
        } catch (error) {
            console.error('Error in removePatronsFromPatronBucket:', error);
            throw error;
        }
    }
}
