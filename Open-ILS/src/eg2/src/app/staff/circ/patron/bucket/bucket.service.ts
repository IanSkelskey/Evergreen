import { Injectable } from '@angular/core';
import { Subject, lastValueFrom, of } from 'rxjs';
import { toArray, catchError, defaultIfEmpty } from 'rxjs/operators';
import { AuthService } from '@eg/core/auth.service';
import { NetService } from '@eg/core/net.service';
import { PcrudService } from '@eg/core/pcrud.service';
import { EventService } from '@eg/core/event.service';
import { IdlService, IdlObject } from '@eg/core/idl.service';
import { StoreService } from '@eg/core/store.service';

/**
 * Constants for the PatronBucketService
 */
const CONSTANTS = {
  STORAGE_KEYS: {
    PATRON_BUCKET_LOG: 'eg.patron_bucket_log'
  },
  IDL_CLASSES: {
    BUCKET: 'cub',
    BUCKET_ITEM: 'cubi',
    USER: 'au'
  },
  API: {
    SERVICE: 'open-ils.actor',
    METHODS: {
      CREATE_CONTAINER: 'open-ils.actor.container.create',
      CREATE_ITEM: 'open-ils.actor.container.item.create',
      DELETE_ITEM: 'open-ils.actor.container.item.delete',
      UPDATE_CONTAINERS: 'open-ils.actor.containers.update',
      DELETE_CONTAINER: 'open-ils.actor.container.full_delete'
    }
  },
  BUCKET_TYPES: {
    STAFF_CLIENT: 'staff_client'
  },
  ERROR_CODES: {
    ITEM_NOT_FOUND: 'CONTAINER_USER_BUCKET_ITEM_NOT_FOUND'
  },
  DEFAULT_VALUES: {
    MAX_RECENT_BUCKETS: 10,
    ROOT_ORG_ID: 1
  },
  PUBLIC_VALUES: {
    TRUE: 't',
    FALSE: 'f'
  }
};

/**
 * Service for managing patron buckets (collections of patrons)
 * Provides methods for creating, updating, retrieving, and managing patron buckets
 */
@Injectable({
  providedIn: 'root'
})
export class PatronBucketService {
  /**
   * Maximum number of recent buckets to track in local storage
   */
  maxRecentPatronBuckets = CONSTANTS.DEFAULT_VALUES.MAX_RECENT_BUCKETS;
    
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
  
  /**
   * Notify subscribers that patron buckets should be refreshed
   */
  requestPatronBucketsRefresh(): void {
    this.patronBucketsRefreshRequested.next();
  }
    
  /**
   * Records recently accessed buckets in local storage
   * @param bucketId The ID of the bucket to log
   */
  logPatronBucket(bucketId: number): void {
    const patronBucketLog = this.store.getLocalItem(CONSTANTS.STORAGE_KEYS.PATRON_BUCKET_LOG) || [];
    
    if (!patronBucketLog.includes(bucketId)) {
      patronBucketLog.unshift(bucketId);
      
      if (patronBucketLog.length > this.maxRecentPatronBuckets) {
        patronBucketLog.pop();
      }
      
      this.store.setLocalItem(CONSTANTS.STORAGE_KEYS.PATRON_BUCKET_LOG, patronBucketLog);
    }
  }
    
  /**
   * Get the list of recently accessed bucket IDs
   * @returns Array of recent bucket IDs
   */
  recentPatronBucketIds(): number[] {
    return this.store.getLocalItem(CONSTANTS.STORAGE_KEYS.PATRON_BUCKET_LOG) || [];
  }
    
  /**
   * Get the home organizational unit for a user
   * @param userId The user ID to lookup, defaults to current user
   * @returns The home organizational unit ID
   */
  private async getUserHomeOu(userId?: number): Promise<number> {
    // Default to the currently logged-in user if no ID provided
    const id = userId || this.auth.user().id();
      
    // Try to get from current user object first if it's the logged-in user
    if (!userId && this.auth.user()) {
      try {
        const homeOu = this.auth.user().home_ou();
        if (homeOu) return homeOu;
      } catch (e) {
        // Fall through to next method
      }
    }
      
    // Retrieve the user object with pcrud
    try {
      const user = await lastValueFrom(this.pcrud.retrieve(
        CONSTANTS.IDL_CLASSES.USER, 
        id, 
        { select: ['home_ou'] }
      ));
      
      if (user && user.home_ou) {
        return typeof user.home_ou === 'function' ? user.home_ou() : user.home_ou;
      }
    } catch (e) {
      // Fall through to alternative methods
    }
    
    // Try workstation org
    const wsOrgId = this.auth.workstation();
    if (wsOrgId) return Number(wsOrgId);
    
    // Last resort - return the root org
    return CONSTANTS.DEFAULT_VALUES.ROOT_ORG_ID;
  }
    
  /**
   * Safely get a property value from an IDL object, handling different access patterns
   * @param obj The IDL object
   * @param property The property name to access
   * @param defaultValue Default value if property cannot be accessed
   * @returns The property value or default value
   */
  private safeGetProperty<T>(obj: any, property: string, defaultValue: T): T {
    if (!obj) return defaultValue;
    
    try {
      if (typeof obj[property] === 'function') {
        return obj[property]() || defaultValue;
      } else if (obj[property] !== undefined) {
        return obj[property];
      }
    } catch (e) {
      // Return default value on error
    }
    
    return defaultValue;
  }
  
  /**
   * Check if a bucket is public
   * @param bucket The bucket object
   * @returns True if the bucket is public
   */
  private isBucketPublic(bucket: IdlObject): boolean {
    const pubValue = this.safeGetProperty<any>(bucket, 'pub', null);
    return pubValue === CONSTANTS.PUBLIC_VALUES.TRUE || pubValue === true;
  }
  
  /**
   * Get the owner ID from a bucket
   * @param bucket The bucket object
   * @returns The owner ID or null if not found
   */
  private getBucketOwnerId(bucket: IdlObject): number | null {
    try {
      if (typeof bucket.owner === 'function') {
        const owner = bucket.owner();
        if (owner) {
          if (typeof owner === 'object' && typeof owner.id === 'function') {
            return owner.id();
          } else if (!isNaN(Number(owner))) {
            return Number(owner);
          }
        }
      }
      
      if (bucket.owner !== undefined) {
        return Number(bucket.owner);
      }
    } catch (e) {
      // Return null on error
    }
    
    return null;
  }
    
  /**
   * Check if the current user has access to a bucket
   * @param bucket The bucket or bucket ID to check
   * @param requiresWrite Whether write access is required (defaults to false)
   * @param loadBucket Whether to load the bucket if only an ID is provided (defaults to true)
   * @returns A promise that resolves with the bucket object if access is granted
   * @throws Error if access is denied
   */
  async checkBucketAccess(
    bucket: IdlObject | number, 
    requiresWrite: boolean = false,
    loadBucket: boolean = true
  ): Promise<IdlObject> {
    // Handle bucket ID case
    if (typeof bucket === 'number') {
      const bucketId = bucket;
      
      if (loadBucket) {
        try {
          const bucketObj = await lastValueFrom(
            this.pcrud.retrieve(CONSTANTS.IDL_CLASSES.BUCKET, bucketId, {
              flesh: 1,
              flesh_fields: {[CONSTANTS.IDL_CLASSES.BUCKET]: ['owner']}
            })
          );
          
          if (!bucketObj) {
            throw new Error($localize`Bucket not found`);
          }
          
          return this.checkObjectAccess(bucketObj, requiresWrite);
        } catch (err) {
          throw new Error($localize`Bucket not found or permission denied`);
        }
      }
      
      return null;
    } 
    
    // Handle bucket object case
    if (bucket && typeof bucket.id === 'function') {
      return this.checkObjectAccess(bucket, requiresWrite);
    }
    
    throw new Error($localize`Invalid bucket parameter`);
  }
  
  /**
   * Check if the current user has access to a bucket object
   * @param bucketObj The bucket object to check
   * @param requiresWrite Whether write access is required
   * @returns The bucket object if access is granted
   * @throws Error if access is denied
   */
  private async checkObjectAccess(bucketObj: IdlObject, requiresWrite: boolean): Promise<IdlObject> {
    const currentUserId = this.auth.user().id();
    const ownerId = this.getBucketOwnerId(bucketObj);
    
    // If user is owner, they always have access
    if (ownerId === currentUserId) {
      return bucketObj;
    }
    
    // If write access is required and user is not owner, deny access
    if (requiresWrite) {
      throw new Error($localize`You do not have permission to modify this bucket`);
    }
    
    // For read access, check if bucket is public
    if (this.isBucketPublic(bucketObj)) {
      return bucketObj;
    }
    
    throw new Error($localize`This bucket is private and can only be accessed by its owner`);
  }
    
  /**
   * Create a new patron bucket
   * @param name Bucket name
   * @param description Bucket description
   * @param bucketType Type of bucket (defaults to staff_client)
   * @param isPublic Whether the bucket is publicly accessible
   * @returns Promise resolving to the created bucket info
   */
  async createBucket(
    name: string, 
    description: string = '', 
    bucketType: string = CONSTANTS.BUCKET_TYPES.STAFF_CLIENT, 
    isPublic: boolean = false
  ): Promise<{id: number, name: string}> {
    const bucket = this.idl.create(CONSTANTS.IDL_CLASSES.BUCKET);
    const ownerId = this.auth.user().id();
    
    bucket.owner(ownerId);
    bucket.name(name);
    bucket.description(description || '');
    bucket.btype(bucketType);
    bucket.pub(isPublic ? CONSTANTS.PUBLIC_VALUES.TRUE : CONSTANTS.PUBLIC_VALUES.FALSE);
    
    // Set owning_lib to the owner's home_ou
    const homeOu = await this.getUserHomeOu(ownerId);
    bucket.owning_lib(homeOu);
    
    try {
      const result = await lastValueFrom(
        this.net.request(
          CONSTANTS.API.SERVICE,
          CONSTANTS.API.METHODS.CREATE_CONTAINER,
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
      throw new Error(`Error creating bucket: ${error.message || error}`);
    }
  }
    
  /**
   * Retrieve a bucket by its ID
   * @param bucketId The bucket ID to retrieve
   * @returns Promise resolving to the bucket object
   */
  async retrieveBucketById(bucketId: number): Promise<IdlObject> {
    try {
      const bucket = await lastValueFrom(this.pcrud.retrieve(
        CONSTANTS.IDL_CLASSES.BUCKET, 
        bucketId, 
        {
          flesh: 1, 
          flesh_fields: {[CONSTANTS.IDL_CLASSES.BUCKET]: ['owner']}
        }
      ));
      
      const evt = this.evt.parse(bucket);
      if (evt) {
        throw new Error(evt.toString());
      }
      
      if (!bucket) {
        throw new Error($localize`No bucket found with ID ${bucketId}`);
      }
      
      // Check authorization - this will throw an error if access is denied
      await this.checkBucketAccess(bucket);
      
      return bucket;
    } catch (error: any) {
      // Handle "no elements in sequence" (EmptyError) gracefully
      if (error && (error.message === 'no elements in sequence' || error.name === 'EmptyError')) {
        throw new Error($localize`No bucket found with ID ${bucketId}`);
      }
      throw new Error($localize`Error retrieving bucket: ${error.message || error}`);
    }
  }
    
  /**
   * Transform bucket objects for grid display
   * @param buckets The bucket(s) to transform
   * @returns Array of bucket objects formatted for display
   */
  transformBucketsForGrid(buckets: IdlObject[] | IdlObject): any[] {
    if (!buckets) return [];
    
    // Ensure we have an array
    const bucketArray = Array.isArray(buckets) ? buckets : [buckets];
    
    return bucketArray.map((bucket, index) => {
      if (!bucket) {
        return this.createEmptyBucketDisplay(index);
      }
      
      // Get bucket properties safely
      const bucketId = this.safeGetProperty<any>(bucket, 'id', `bucket_${index}`);
      
      const ownerUsername = this.getOwnerUsername(bucket);
      
      // Get owning_lib safely
      const owningLib = this.safeGetProperty<any>(bucket, 'owning_lib', null);
      
      const createTime = this.safeGetProperty<any>(bucket, 'create_time', null);
      
      return {
        id: bucketId,
        name: this.safeGetProperty<string>(bucket, 'name', ''),
        description: this.safeGetProperty<string>(bucket, 'description', ''),
        btype: this.safeGetProperty<string>(bucket, 'btype', ''),
        owner_usrname: ownerUsername,
        create_time: createTime ? new Date(createTime) : null,
        bucket: bucket,
        owning_lib: owningLib
      };
    });
  }
  
  /**
   * Create an empty bucket display object for when a bucket is null/undefined
   * @param index Index in the array for identification
   * @returns An empty bucket display object
   */
  private createEmptyBucketDisplay(index: number): any {
    return {
      id: `unknown_${index}`,
      name: 'Unknown Bucket',
      description: '',
      btype: '',
      owner_usrname: '',
      create_time: null,
      bucket: null,
      owning_lib: null
    };
  }
  
  /**
   * Get the owner's username from a bucket object
   * @param bucket The bucket object
   * @returns The owner's username or empty string
   */
  private getOwnerUsername(bucket: IdlObject): string {
    try {
      if (bucket.owner && typeof bucket.owner === 'function') {
        const owner = bucket.owner();
        if (owner && typeof owner.usrname === 'function') {
          return owner.usrname();
        }
      }
    } catch (e) {
      // Return empty string on error
    }
    return '';
  }
    
  /**
   * Retrieve items (patrons) in a bucket
   * @param bucketId The bucket ID to retrieve items from
   * @returns Array of patron items in the bucket
   */
  async retrievePatronBucketItems(bucketId: number): Promise<any[]> {
    // Check if user has permission to access this bucket
    await this.checkBucketAccess(bucketId);
    
    const query = { bucket: bucketId };
    const options = {
      flesh: 2,
      flesh_fields: {
        [CONSTANTS.IDL_CLASSES.BUCKET_ITEM]: ['target_user'],
        [CONSTANTS.IDL_CLASSES.USER]: ['card']
      }
    };
    
    try {
      // Use atomic to get all items at once
      const items = await lastValueFrom(
        this.pcrud.search(CONSTANTS.IDL_CLASSES.BUCKET_ITEM, query, options, {atomic: true})
      );
      
      // Normalize to array
      const itemsArray = !items ? [] : (Array.isArray(items) ? items : [items]);
      
      return itemsArray.map(item => this.transformBucketItem(item));
    } catch (error) {
      throw new Error(`Error retrieving patron bucket items: ${error.message || error}`);
    }
  }
  
  /**
   * Transform a bucket item into a display-friendly format
   * @param item The bucket item to transform
   * @returns A patron representation for the UI
   */
  private transformBucketItem(item: IdlObject): any {
    try {
      const user = item.target_user();
      
      // Extract patron information with error handling
      const { firstName, lastName, barcode } = this.extractPatronInfo(user);
      
      return {
        id: item.id(),
        bucketId: item.bucket(),
        userId: user ? user.id() : 0,
        patron_name: lastName ? lastName + ', ' + firstName : 'Unknown Patron',
        barcode: barcode || 'No Barcode',
        patron: user
      };
    } catch (error) {
      return {
        id: item.id(),
        bucketId: item.bucket(),
        userId: 0,
        patron_name: 'Error',
        barcode: 'Error',
        patron: null
      };
    }
  }
  
  /**
   * Extract patron information from a user object
   * @param user The user object to extract info from
   * @returns Object with firstName, lastName, and barcode
   */
  private extractPatronInfo(user: IdlObject): {firstName: string, lastName: string, barcode: string} {
    let firstName = '';
    let lastName = '';
    let barcode = '';
    
    if (!user) {
      return { firstName, lastName, barcode };
    }
    
    try {
      firstName = this.safeGetProperty<string>(user, 'first_given_name', '');
      lastName = this.safeGetProperty<string>(user, 'family_name', '');
      
      if (user.card && user.card() && typeof user.card().barcode === 'function') {
        barcode = user.card().barcode();
      }
    } catch (e) {
      // Keep default empty values
    }
    
    return { firstName, lastName, barcode };
  }
    
  /**
   * Add patrons to a patron bucket
   * @param bucketId The bucket to add to
   * @param patronIds Array of patron IDs to add
   * @returns Result object with counts and IDs
   */
  async addPatronsToPatronBucket(bucketId: number, patronIds: number[]): Promise<any> {
    this.logPatronBucket(bucketId);
    
    // Check if user has permission to add items to this bucket
    await this.checkBucketAccess(bucketId, true);
    
    if (!patronIds || patronIds.length === 0) {
      return this.createEmptyPatronAddResult();
    }
    
    // Check which patrons are already in the bucket
    const { existingPatrons, existingPatronIds } = await this.findExistingPatronsInBucket(bucketId, patronIds);
    
    // Filter out patrons that are already in the bucket
    const newPatronIds = patronIds.filter(id => !existingPatrons.has(id));
    
    // If all patrons are already in the bucket, return early
    if (newPatronIds.length === 0) {
      return {
        success: true,
        added: 0,
        alreadyInBucket: existingPatronIds.length,
        total: patronIds.length,
        addedIds: [],
        existingIds: existingPatronIds
      };
    }
    
    try {
      const items = this.createBucketItemsForPatrons(bucketId, newPatronIds);
      
      // Add the new patrons to the bucket
      const response = await lastValueFrom(
        this.net.request(
          CONSTANTS.API.SERVICE,
          CONSTANTS.API.METHODS.CREATE_ITEM,
          this.auth.token(), 'user', items
        )
      );
      
      const evt = this.evt.parse(response);
      if (evt) {
        throw new Error(evt.toString());
      }
      
      return {
        success: true,
        added: newPatronIds.length,
        alreadyInBucket: existingPatronIds.length,
        total: patronIds.length,
        addedIds: newPatronIds,
        existingIds: existingPatronIds,
        response: response
      };
    } catch (error) {
      throw new Error(`Error adding patrons to bucket: ${error.message || error}`);
    }
  }
  
  /**
   * Create an empty result object for patron addition
   * @returns Empty result object
   */
  private createEmptyPatronAddResult(): any {
    return {
      success: true,
      added: 0,
      alreadyInBucket: 0,
      total: 0,
      addedIds: [],
      existingIds: []
    };
  }
  
  /**
   * Find patrons that already exist in a bucket
   * @param bucketId The bucket ID to check
   * @param patronIds The patron IDs to check
   * @returns Object containing existing patrons map and array of IDs
   */
  private async findExistingPatronsInBucket(
    bucketId: number, 
    patronIds: number[]
  ): Promise<{existingPatrons: Map<number, boolean>, existingPatronIds: number[]}> {
    const existingPatrons = new Map<number, boolean>();
    const existingPatronIds: number[] = [];
    
    for (const patronId of patronIds) {
      const existingItems = await this.checkPatronInBucket(bucketId, patronId);
      if (existingItems && existingItems.length > 0) {
        existingPatrons.set(patronId, true);
        existingPatronIds.push(patronId);
      }
    }
    
    return { existingPatrons, existingPatronIds };
  }
  
  /**
   * Create bucket item objects for a list of patrons
   * @param bucketId The bucket ID
   * @param patronIds Array of patron IDs
   * @returns Array of bucket item objects
   */
  private createBucketItemsForPatrons(bucketId: number, patronIds: number[]): IdlObject[] {
    return patronIds.map(patronId => {
      const item = this.idl.create(CONSTANTS.IDL_CLASSES.BUCKET_ITEM);
      item.bucket(bucketId);
      item.target_user(patronId);
      return item;
    });
  }
    
  /**
   * Remove patrons from a bucket
   * @param bucketId The bucket ID to remove from
   * @param itemIds Array of bucket item IDs to remove
   * @returns Result object with counts and detailed results
   */
  async removePatronsFromPatronBucket(bucketId: number, itemIds: number[]): Promise<any> {
    // Validate inputs
    if (!itemIds || itemIds.length === 0) {
      throw new Error('No item IDs provided for removal');
    }
    
    // Filter out any non-numeric or invalid values
    const validItemIds = itemIds.filter(id => id !== undefined && id !== null && !isNaN(Number(id)));
    if (validItemIds.length === 0) {
      throw new Error('No valid item IDs provided for removal');
    }
    
    try {
      const { results, errors } = await this.processItemRemovals(validItemIds);
      
      // We'll consider it a success if at least one item was removed successfully
      // or if all items were already removed
      const successful = results.length > 0;
      
      // Only throw an error if all operations failed and no items were already removed
      if (!successful && errors.length > 0) {
        throw new Error(`Failed to remove any items: ${JSON.stringify(errors)}`);
      }
      
      // Return the results with partial success information
      return {
        success: successful,
        total: validItemIds.length,
        removed: results.length,
        failed: errors.length,
        results: results,
        errors: errors
      };
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Process the removal of multiple items
   * @param validItemIds Array of valid item IDs to remove
   * @returns Object with results and errors arrays
   */
  private async processItemRemovals(validItemIds: number[]): Promise<{results: any[], errors: any[]}> {
    const results = [];
    const errors = [];
    
    for (const itemId of validItemIds) {
      try {
        const response = await lastValueFrom(
          this.net.request(
            CONSTANTS.API.SERVICE,
            CONSTANTS.API.METHODS.DELETE_ITEM,
            this.auth.token(), 'user', itemId
          ),
          { defaultValue: { success: true, id: itemId } }
        );
        
        // Check for errors
        const evt = this.evt.parse(response);
        if (evt) {
          // Handle the specific "item not found" error as a success
          if (evt.textcode === CONSTANTS.ERROR_CODES.ITEM_NOT_FOUND) {
            results.push({ id: itemId, success: true, already_removed: true });
          } else {
            errors.push({ id: itemId, error: evt });
          }
        } else {
          results.push({ id: itemId, success: true });
        }
      } catch (itemError) {
        errors.push({ id: itemId, error: itemError });
      }
    }
    
    return { results, errors };
  }
    
  /**
   * Update an existing bucket
   * @param bucket The bucket object to update
   * @returns Promise resolving to success object with ID
   */
  async updateBucket(bucket: IdlObject): Promise<any> {
    // Check if user has permission to update this bucket
    await this.checkBucketAccess(bucket, true);
    
    // Format the bucket for update
    await this.formatBucketForUpdate(bucket);
    
    try {
      // Try using the containers.update method with specific parameters
      const response = await lastValueFrom(
        this.net.request(
          CONSTANTS.API.SERVICE,
          CONSTANTS.API.METHODS.UPDATE_CONTAINERS,
          this.auth.token(), 
          'user', 
          [bucket]  // Send as an array for batch API
        )
      );
      
      if (!response || !response[bucket.id()]) {
        throw new Error('No response from server for bucket update');
      }
      
      const result = response[bucket.id()];
      const evt = this.evt.parse(result);
      if (evt) {
        throw new Error(evt.toString());
      }
      
      this.requestPatronBucketsRefresh();
      return {
        success: true,
        id: bucket.id()
      };
    } catch (error) {
      throw new Error(`Error updating bucket: ${error.message || error}`);
    }
  }
  
  /**
   * Format a bucket object for update API call
   * @param bucket The bucket to format
   */
  private async formatBucketForUpdate(bucket: IdlObject): Promise<void> {
    // Make sure pub is properly formatted - API requires 't' or 'f' character values
    if (typeof bucket.pub === 'function') {
      const pubValue = bucket.pub();
      if (pubValue === true || pubValue === false) {
        bucket.pub(pubValue ? CONSTANTS.PUBLIC_VALUES.TRUE : CONSTANTS.PUBLIC_VALUES.FALSE);
      }
    }
    
    // Ensure the owning_lib is set if it isn't already
    if ((!bucket.owning_lib || !bucket.owning_lib()) && typeof bucket.owner === 'function') {
      try {
        const ownerId = bucket.owner();
        const homeOu = await this.getUserHomeOu(ownerId);
        bucket.owning_lib(homeOu);
      } catch (e) {
        // Continue with update even if setting owning_lib fails
      }
    }
  }
    
  /**
   * Delete a bucket
   * @param bucketId The ID of the bucket to delete
   * @returns Promise resolving to success object with optional error message
   */
  async deleteBucket(bucketId: number): Promise<{success: boolean, message?: string}> {
    try {
      // Check if user has permission to delete this bucket
      await this.checkBucketAccess(bucketId, true);
      
      const response = await lastValueFrom(
        this.net.request(
          CONSTANTS.API.SERVICE,
          CONSTANTS.API.METHODS.DELETE_CONTAINER,
          this.auth.token(), 'user', bucketId
        )
      );
      
      const evt = this.evt.parse(response);
      if (evt) {
        return {success: false, message: evt.toString()};
      }
      
      this.requestPatronBucketsRefresh();
      return {success: true};
    } catch (error) {
      return {success: false, message: error.message || 'Unknown error'};
    }
  }

  /**
   * Check if a patron is already in a bucket
   * @param bucketId The bucket ID to check
   * @param patronId The patron ID to check
   * @returns Array of matching bucket items if found
   */
  async checkPatronInBucket(bucketId: number, patronId: number): Promise<any[]> {
    try {
      return await lastValueFrom(
        this.pcrud.search(CONSTANTS.IDL_CLASSES.BUCKET_ITEM, {
          bucket: bucketId,
          target_user: patronId
        }).pipe(
          toArray(),
          defaultIfEmpty([]),
          catchError(() => of([]))
        )
      );
    } catch {
      return [];
    }
  }
}
