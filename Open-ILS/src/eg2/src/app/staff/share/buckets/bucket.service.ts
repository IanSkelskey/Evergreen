import { Injectable } from '@angular/core';
import { Observable, Subject, of, throwError, lastValueFrom } from 'rxjs';
import { catchError, map, tap, toArray } from 'rxjs/operators';

import { NetService } from '@eg/core/net.service';
import { IdlService, IdlObject } from '@eg/core/idl.service';
import { AuthService } from '@eg/core/auth.service';
import { EventService } from '@eg/core/event.service';
import { OrgService } from '@eg/core/org.service';
import { StoreService } from '@eg/core/store.service';
import { PcrudService } from '@eg/core/pcrud.service';

/**
 * Constants for the BucketService
 */
const CONSTANTS = {
  STORAGE_KEYS: {
    BUCKET_LOG_PREFIX: 'eg.bucket_log.',
    RECENT_BUCKETS: 'eg.recent_buckets'
  },
  PUBLIC_VALUES: {
    TRUE: 't',
    FALSE: 'f'
  },
  DEFAULT_VALUES: {
    MAX_RECENT_BUCKETS: 10,
    BUCKET_TYPE: 'staff_client'
  }
};

/**
 * Centralized service for managing buckets of all types (biblio, user, copy, callnumber)
 */
@Injectable({
  providedIn: 'root'
})
export class BucketService {
  // Events for bucket refresh notifications
  private bucketRefreshSource = {
    biblio: new Subject<void>(),
    user: new Subject<void>(),
    copy: new Subject<void>(),
    callnumber: new Subject<void>()
  };

  // Observable streams for components to subscribe to
  public bucketRefresh$ = {
    biblio: this.bucketRefreshSource.biblio.asObservable(),
    user: this.bucketRefreshSource.user.asObservable(),
    copy: this.bucketRefreshSource.copy.asObservable(),
    callnumber: this.bucketRefreshSource.callnumber.asObservable()
  };

  // Map bucket class to FM class
  private bucketFmClassMap = {
    'biblio': 'cbreb',
    'user': 'cub',
    'callnumber': 'ccnb',
    'copy': 'ccb'
  };

  // Map bucket class to FM class for bucket items
  private bucketItemFmClassMap = {
    'biblio': 'cbrebi',
    'user': 'cubi',
    'callnumber': 'ccnbi',
    'copy': 'ccbi'
  };

  // Map bucket class to target field for items
  private targetFieldMap = {
    'biblio': 'target_biblio_record_entry',
    'user': 'target_user',
    'callnumber': 'target_call_number',
    'copy': 'target_copy'
  };

  // Favorite bucket flags by bucket class and id
  private favoriteBucketFlags: {
    [bucketClass: string]: {[bucketId: number]: IdlObject}
  } = {
    'biblio': {},
    'user': {},
    'callnumber': {},
    'copy': {}
  };

  // Maximum number of recent buckets to track
  maxRecentBuckets = CONSTANTS.DEFAULT_VALUES.MAX_RECENT_BUCKETS;

  // Bucket history - track recently used buckets by last access time
  private recentBuckets: Map<number, Date> = new Map<number, Date>();

  constructor(
    private net: NetService,
    private idl: IdlService,
    private auth: AuthService,
    private evt: EventService,
    private org: OrgService,
    private store: StoreService,
    private pcrud: PcrudService
  ) {
    // Initialize recent buckets from local storage
    this.loadRecentBucketsFromStorage();
  }

  /**
   * Request a refresh of buckets for a specific bucket class
   * @param bucketClass The type of bucket ('biblio', 'user', 'callnumber', 'copy')
   */
  requestBucketsRefresh(bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy'): void {
    this.bucketRefreshSource[bucketClass].next();
  }

  /**
   * Log a bucket as recently used
   * @param bucketClass The type of bucket
   * @param bucketId The ID of the bucket to log
   */
  logBucket(bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy', bucketId: number): void {
    if (!bucketId) return;
    
    // Update in-memory map
    this.recentBuckets.set(bucketId, new Date());
    
    // Update in local storage
    const storageKey = CONSTANTS.STORAGE_KEYS.BUCKET_LOG_PREFIX + bucketClass;
    const bucketLog: number[] = this.store.getLocalItem(storageKey) || [];
    
    // Add to beginning if not already in the list
    if (!bucketLog.includes(bucketId)) {
      bucketLog.unshift(bucketId);
      
      // Trim the array if it exceeds the maximum size
      if (bucketLog.length > this.maxRecentBuckets) {
        bucketLog.pop();
      }
      
      this.store.setLocalItem(storageKey, bucketLog);
    }
  }

  /**
   * Load recently used buckets from local storage
   */
  private loadRecentBucketsFromStorage(): void {
    // Clear existing data
    this.recentBuckets.clear();
    
    // Load from storage for each bucket type
    ['biblio', 'user', 'callnumber', 'copy'].forEach(type => {
      const storageKey = CONSTANTS.STORAGE_KEYS.BUCKET_LOG_PREFIX + type;
      const bucketLog: number[] = this.store.getLocalItem(storageKey) || [];
      
      // Add to map with decreasing recency (most recent first)
      const now = new Date();
      bucketLog.forEach((bucketId, index) => {
        // Create date objects with decreasing timestamps for proper sorting
        const timestamp = new Date(now);
        timestamp.setMinutes(now.getMinutes() - index);
        this.recentBuckets.set(bucketId, timestamp);
      });
    });
  }

  /**
   * Get recent buckets in order of most recently used
   * @param bucketClass Optional bucket class to filter by
   * @returns Array of bucket IDs
   */
  getRecentBuckets(bucketClass?: 'biblio' | 'user' | 'callnumber' | 'copy'): number[] {
    if (bucketClass) {
      // Return from local storage for specific bucket class
      const storageKey = CONSTANTS.STORAGE_KEYS.BUCKET_LOG_PREFIX + bucketClass;
      return this.store.getLocalItem(storageKey) || [];
    }
    
    // Return all buckets sorted by recency
    return Array.from(this.recentBuckets.entries())
      .sort((a, b) => b[1].getTime() - a[1].getTime())
      .map(entry => entry[0]);
  }

  /**
   * Get the FM class name for a bucket type
   */
  getBucketFmClass(bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy'): string {
    return this.bucketFmClassMap[bucketClass];
  }

  /**
   * Get the FM class name for a bucket item type
   */
  getBucketItemFmClass(bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy'): string {
    return this.bucketItemFmClassMap[bucketClass];
  }

  /**
   * Get the target field name for bucket items
   */
  getTargetField(bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy'): string {
    return this.targetFieldMap[bucketClass];
  }

  /**
   * Check if a user has permission to access a bucket
   * @param bucketClass The type of bucket
   * @param bucket The bucket object or ID
   * @param requiresWrite Whether write access is required
   * @returns Promise resolving to the bucket object if access is granted
   */
  async checkBucketAccess(
    bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy',
    bucket: IdlObject | number,
    requiresWrite: boolean = false
  ): Promise<IdlObject> {
    const bucketFmClass = this.getBucketFmClass(bucketClass);
    const currentUserId = this.auth.user().id();
    
    // Handle bucket ID case
    if (typeof bucket === 'number') {
      try {
        const bucketObj = await lastValueFrom(
          this.pcrud.retrieve(bucketFmClass, bucket, {
            flesh: 1,
            flesh_fields: {[bucketFmClass]: ['owner']}
          })
        );
        
        if (!bucketObj) {
          throw new Error($localize`Bucket not found`);
        }
        
        return this.verifyBucketAccess(bucketObj, currentUserId, requiresWrite);
      } catch (err) {
        throw new Error($localize`Bucket not found or permission denied`);
      }
    }
    
    // Handle bucket object case
    if (bucket && typeof bucket.id === 'function') {
      return this.verifyBucketAccess(bucket, currentUserId, requiresWrite);
    }
    
    throw new Error($localize`Invalid bucket parameter`);
  }
  
  /**
   * Verify user access rights to a bucket
   * @param bucket The bucket object
   * @param userId The user ID checking access
   * @param requiresWrite Whether write access is required
   * @returns The bucket object if access is granted
   * @throws Error if access is denied
   */
  private verifyBucketAccess(bucket: IdlObject, userId: number, requiresWrite: boolean): IdlObject {
    let ownerId: number;
    
    try {
      if (bucket.owner && typeof bucket.owner === 'function') {
        const owner = bucket.owner();
        if (owner && typeof owner.id === 'function') {
          ownerId = owner.id();
        } else if (!isNaN(Number(owner))) {
          ownerId = Number(owner);
        }
      } else if (bucket.owner !== undefined) {
        ownerId = Number(bucket.owner);
      }
    } catch (e) {
      // If we can't determine ownership, deny access for safety
      throw new Error($localize`Permission denied: Unable to determine bucket ownership`);
    }
    
    // If user is owner, they always have access
    if (ownerId === userId) {
      return bucket;
    }
    
    // If write access is required and user is not owner, deny access
    if (requiresWrite) {
      throw new Error($localize`You do not have permission to modify this bucket`);
    }
    
    // For read access, check if bucket is public
    let isPublic = false;
    try {
      if (typeof bucket.pub === 'function') {
        isPublic = bucket.pub() === CONSTANTS.PUBLIC_VALUES.TRUE || bucket.pub() === true;
      } else if (bucket.pub !== undefined) {
        isPublic = bucket.pub === CONSTANTS.PUBLIC_VALUES.TRUE || bucket.pub === true;
      }
    } catch (e) {
      // If we can't determine if public, assume not public
      isPublic = false;
    }
    
    if (isPublic) {
      return bucket;
    }
    
    throw new Error($localize`This bucket is private and can only be accessed by its owner`);
  }

  /**
   * Create a new bucket
   * @param bucketClass The type of bucket to create
   * @param name Bucket name
   * @param description Optional bucket description
   * @param bucketType Optional bucket type (defaults to 'staff_client')
   * @param isPublic Whether the bucket is public
   */
  createBucket(
    bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy',
    name: string, 
    description: string = '',
    bucketType: string = CONSTANTS.DEFAULT_VALUES.BUCKET_TYPE,
    isPublic: boolean = false
  ): Observable<number> {
    // Get the appropriate bucket FM class
    const bucketFmClass = this.getBucketFmClass(bucketClass);
    const bucket = this.idl.create(bucketFmClass);

    // Set bucket properties
    bucket.owner(this.auth.user().id());
    bucket.name(name);
    bucket.description(description || '');
    bucket.btype(bucketType);
    bucket.pub(isPublic ? CONSTANTS.PUBLIC_VALUES.TRUE : CONSTANTS.PUBLIC_VALUES.FALSE);
    
    // Set owning_lib if the IDL has this field
    if (bucket.owning_lib) {
      bucket.owning_lib(this.auth.user().home_ou() || this.org.root());
    }

    return this.net.request(
      'open-ils.actor',
      'open-ils.actor.container.create',
      this.auth.token(), bucketClass, bucket
    ).pipe(
      catchError(err => {
        console.error(`Error creating ${bucketClass} bucket:`, err);
        return throwError(() => new Error(`Failed to create bucket: ${err.message || err}`));
      }),
      tap(bucketId => {
        if (bucketId) {
          this.logBucket(bucketClass, bucketId);
          this.requestBucketsRefresh(bucketClass);
        }
      })
    );
  }

  /**
   * Retrieve a bucket by ID
   * @param bucketClass The type of bucket
   * @param bucketId The ID of the bucket to retrieve
   */
  retrieveBucketById(
    bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy',
    bucketId: number
  ): Observable<any> {
    return this.net.request(
      'open-ils.actor',
      'open-ils.actor.container.flesh',
      this.auth.token(), bucketClass, bucketId
    ).pipe(
      map(resp => {
        const evt = this.evt.parse(resp);
        if (evt) {
          throw new Error(evt.toString());
        }
        return resp;
      }),
      catchError(err => {
        console.error(`Error retrieving ${bucketClass} bucket ${bucketId}:`, err);
        return throwError(() => new Error(`Failed to retrieve bucket: ${err.message || err}`));
      }),
      tap(() => this.logBucket(bucketClass, bucketId))
    );
  }

  /**
   * Update an existing bucket
   * @param bucketClass The type of bucket
   * @param bucket The bucket object to update
   */
  updateBucket(
    bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy',
    bucket: any
  ): Observable<any> {
    // Format pub property to 't' or 'f' if it's a boolean
    if (bucket.pub !== undefined) {
      if (typeof bucket.pub === 'function') {
        const pubValue = bucket.pub();
        if (pubValue === true || pubValue === false) {
          bucket.pub(pubValue ? CONSTANTS.PUBLIC_VALUES.TRUE : CONSTANTS.PUBLIC_VALUES.FALSE);
        }
      } else if (typeof bucket.pub === 'boolean') {
        bucket.pub = bucket.pub ? CONSTANTS.PUBLIC_VALUES.TRUE : CONSTANTS.PUBLIC_VALUES.FALSE;
      }
    }
    
    return this.net.request(
      'open-ils.actor',
      'open-ils.actor.container.update',
      this.auth.token(), bucketClass, bucket
    ).pipe(
      map(resp => {
        const evt = this.evt.parse(resp);
        if (evt) {
          throw new Error(evt.toString());
        }
        return resp;
      }),
      catchError(err => {
        console.error(`Error updating ${bucketClass} bucket:`, err);
        return throwError(() => new Error(`Failed to update bucket: ${err.message || err}`));
      }),
      tap(() => {
        this.logBucket(bucketClass, bucket.id());
        this.requestBucketsRefresh(bucketClass);
      })
    );
  }

  /**
   * Delete a bucket
   * @param bucketClass The type of bucket
   * @param bucketId The ID of the bucket to delete
   */
  deleteBucket(
    bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy',
    bucketId: number
  ): Observable<any> {
    return this.net.request(
      'open-ils.actor',
      'open-ils.actor.container.full_delete',
      this.auth.token(), bucketClass, bucketId
    ).pipe(
      map(resp => {
        const evt = this.evt.parse(resp);
        if (evt) {
          throw new Error(evt.toString());
        }
        return resp;
      }),
      catchError(err => {
        console.error(`Error deleting ${bucketClass} bucket ${bucketId}:`, err);
        return throwError(() => new Error(`Failed to delete bucket: ${err.message || err}`));
      }),
      tap(() => {
        // Remove from recent buckets
        this.recentBuckets.delete(bucketId);
        
        // Remove from local storage
        const storageKey = CONSTANTS.STORAGE_KEYS.BUCKET_LOG_PREFIX + bucketClass;
        const bucketLog: number[] = this.store.getLocalItem(storageKey) || [];
        const index = bucketLog.indexOf(bucketId);
        if (index !== -1) {
          bucketLog.splice(index, 1);
          this.store.setLocalItem(storageKey, bucketLog);
        }
        
        // Notify subscribers
        this.requestBucketsRefresh(bucketClass);
      })
    );
  }

  /**
   * Retrieve all buckets for the current user of a specific class and type
   * @param bucketClass The type of bucket
   * @param bucketType The bucket type (e.g., 'staff_client')
   */
  retrieveUserBuckets(
    bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy',
    bucketType: string = CONSTANTS.DEFAULT_VALUES.BUCKET_TYPE
  ): Observable<any[]> {
    return this.net.request(
      'open-ils.actor',
      'open-ils.actor.container.retrieve_by_class.authoritative',
      this.auth.token(), this.auth.user().id(),
      bucketClass, bucketType
    ).pipe(
      map(buckets => buckets || []),
      catchError(err => {
        console.error(`Error retrieving ${bucketClass} buckets:`, err);
        return of([]);
      })
    );
  }

  /**
   * Check if items already exist in a bucket to prevent duplicates
   * @param bucketClass The type of bucket
   * @param bucketId The ID of the bucket
   * @param itemIds The item IDs to check
   * @returns Promise resolving to a map of item IDs that already exist in the bucket
   */
  async checkItemsInBucket(
    bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy',
    bucketId: number,
    itemIds: number[]
  ): Promise<Map<number, boolean>> {
    if (!itemIds.length) {
      return new Map<number, boolean>();
    }
    
    const existingItems = new Map<number, boolean>();
    const bucketItemClass = this.getBucketItemFmClass(bucketClass);
    const targetField = this.getTargetField(bucketClass);
    
    try {
      const query: any = {bucket: bucketId};
      query[targetField] = itemIds;
      
      const results = await lastValueFrom(
        this.pcrud.search(bucketItemClass, query, {}, {atomic: true})
          .pipe(
            toArray(),
            catchError(() => of([]))
          )
      );
      
      results.forEach(item => {
        if (item && item[targetField]) {
          const targetId = typeof item[targetField] === 'function' ? 
            item[targetField]() : item[targetField];
          existingItems.set(Number(targetId), true);
        }
      });
      
      return existingItems;
    } catch (error) {
      console.error(`Error checking items in ${bucketClass} bucket:`, error);
      return new Map<number, boolean>();
    }
  }

  /**
   * Add items to a bucket with duplicate prevention
   * @param bucketClass The type of bucket
   * @param bucketId The ID of the bucket to add items to
   * @param itemIds Array of item IDs to add
   * @param preventDuplicates Whether to prevent duplicate items (default: true)
   */
  async addItemsToBucket(
    bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy',
    bucketId: number,
    itemIds: number[],
    preventDuplicates: boolean = true
  ): Promise<any> {
    if (!itemIds.length) {
      return { success: true, count: 0, added: 0, alreadyInBucket: 0 };
    }

    this.logBucket(bucketClass, bucketId);
    
    // Check bucket access
    await this.checkBucketAccess(bucketClass, bucketId, true);
    
    let newItemIds = itemIds;
    let existingItemIds: number[] = [];
    
    // Check for duplicates if prevention is enabled
    if (preventDuplicates) {
      const existingItems = await this.checkItemsInBucket(bucketClass, bucketId, itemIds);
      existingItemIds = Array.from(existingItems.keys());
      newItemIds = itemIds.filter(id => !existingItems.has(id));
      
      if (newItemIds.length === 0) {
        return { 
          success: true, 
          count: itemIds.length,
          added: 0,
          alreadyInBucket: existingItemIds.length,
          addedIds: [],
          existingIds: existingItemIds
        };
      }
    }

    const targetField = this.getTargetField(bucketClass);
    const bucketItemClass = this.getBucketItemFmClass(bucketClass);
    const items = [];

    newItemIds.forEach(itemId => {
      const item = this.idl.create(bucketItemClass);
      item.bucket(bucketId);
      item[targetField](itemId);
      items.push(item);
    });

    try {
      const response = await lastValueFrom(
        this.net.request(
          'open-ils.actor',
          'open-ils.actor.container.item.create',
          this.auth.token(), bucketClass, items
        )
      );
      
      const evt = this.evt.parse(response);
      if (evt) {
        throw new Error(evt.toString());
      }
      
      this.requestBucketsRefresh(bucketClass);
      
      return { 
        success: true, 
        count: itemIds.length,
        added: newItemIds.length,
        alreadyInBucket: existingItemIds.length,
        addedIds: newItemIds,
        existingIds: existingItemIds,
        response: response
      };
    } catch (error) {
      throw new Error(`Error adding items to ${bucketClass} bucket: ${error.message || error}`);
    }
  }

  /**
   * Remove items from a bucket
   * @param bucketClass The type of bucket
   * @param itemIds Array of bucket item IDs to remove (these are the IDs of the bucket items, not the target items)
   */
  async removeItemsFromBucket(
    bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy',
    itemIds: number[]
  ): Promise<any> {
    if (!itemIds.length) {
      return { success: true, count: 0, removed: 0 };
    }

    const results = [];
    const errors = [];
    
    // Process items individually to handle partial failures
    for (const itemId of itemIds) {
      try {
        const response = await lastValueFrom(
          this.net.request(
            'open-ils.actor',
            'open-ils.actor.container.item.delete',
            this.auth.token(), bucketClass, itemId
          )
        );
        
        const evt = this.evt.parse(response);
        if (evt) {
          // Some specific error codes might indicate the item was already removed
          if (evt.textcode === 'CONTAINER_ITEM_NOT_FOUND' || 
              evt.textcode === 'CONTAINER_USER_BUCKET_ITEM_NOT_FOUND') {
            results.push({ id: itemId, success: true, already_removed: true });
          } else {
            errors.push({ id: itemId, error: evt });
          }
        } else {
          results.push({ id: itemId, success: true });
        }
      } catch (error) {
        errors.push({ id: itemId, error });
      }
    }
    
    // Consider it a success if at least one item was removed or already removed
    const success = results.length > 0;
    
    if (success) {
      this.requestBucketsRefresh(bucketClass);
    }
    
    return {
      success,
      count: itemIds.length,
      removed: results.length,
      failed: errors.length,
      results,
      errors
    };
  }

  /**
   * Retrieve items in a bucket
   * @param bucketClass The type of bucket
   * @param bucketId The ID of the bucket to get items from
   */
  retrieveBucketItems(
    bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy',
    bucketId: number
  ): Observable<any[]> {
    return this.net.request(
      'open-ils.actor',
      'open-ils.actor.container.contents.retrieve',
      this.auth.token(), bucketClass, bucketId
    ).pipe(
      map(resp => {
        const evt = this.evt.parse(resp);
        if (evt) {
          throw new Error(evt.toString());
        }
        return resp || [];
      }),
      catchError(err => {
        console.error(`Error retrieving items from ${bucketClass} bucket ${bucketId}:`, err);
        return of([]);
      }),
      tap(() => this.logBucket(bucketClass, bucketId))
    );
  }

  /**
   * Transform bucket objects for grid display
   * @param bucketClass The type of bucket
   * @param buckets The bucket(s) to transform
   * @returns Array of bucket objects formatted for display
   */
  transformBucketsForGrid(
    bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy', 
    buckets: IdlObject[] | IdlObject
  ): any[] {
    if (!buckets) return [];
    
    // Ensure we have an array
    const bucketArray = Array.isArray(buckets) ? buckets : [buckets];
    
    return bucketArray.map((bucket, index) => {
      if (!bucket) {
        return this.createEmptyBucketDisplay(index);
      }
      
      // Get owner username safely
      let ownerUsername = '';
      try {
        if (bucket.owner && typeof bucket.owner === 'function') {
          const owner = bucket.owner();
          if (owner && typeof owner.usrname === 'function') {
            ownerUsername = owner.usrname();
          }
        }
      } catch (e) {
        // Keep default empty value
      }
      
      // Get other properties safely
      const bucketId = this.safeGetProperty(bucket, 'id', `bucket_${index}`);
      const name = this.safeGetProperty(bucket, 'name', '');
      const description = this.safeGetProperty(bucket, 'description', '');
      const btype = this.safeGetProperty(bucket, 'btype', '');
      const createTime = this.safeGetProperty(bucket, 'create_time', null);
      const owningLib = this.safeGetProperty(bucket, 'owning_lib', null);
      const isPublic = this.safeGetProperty(bucket, 'pub', '') === CONSTANTS.PUBLIC_VALUES.TRUE;
      const favorite = typeof bucketId === 'number'
        ? this.isFavoriteBucket(bucketClass, bucketId)
        : false;
      
      return {
        id: bucketId,
        name,
        description,
        btype,
        owner_usrname: ownerUsername,
        create_time: createTime ? new Date(createTime) : null,
        bucket,
        owning_lib: owningLib,
        is_public: isPublic,
        favorite
      };
    });
  }
  
  /**
   * Create an empty bucket display object
   * @param index Index for identification
   * @returns Empty bucket display object
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
      owning_lib: null,
      is_public: false,
      favorite: false
    };
  }
  
  /**
   * Safely get a property value from an IDL object
   * @param obj The object to get the property from
   * @param property The property name
   * @param defaultValue The default value if property access fails
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
   * Retrieve a shared bucket by ID
   * @param bucketClass The type of bucket
   * @param bucketId The ID of the shared bucket
   */
  retrieveSharedBucket(
    bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy',
    bucketId: number
  ): Observable<any> {
    return this.net.request(
      'open-ils.actor',
      'open-ils.actor.container.flesh',
      this.auth.token(), bucketClass, bucketId
    ).pipe(
      map(resp => {
        const evt = this.evt.parse(resp);
        if (evt) {
          throw new Error(evt.toString());
        }
        return resp;
      }),
      catchError(err => {
        console.error(`Error retrieving shared ${bucketClass} bucket ${bucketId}:`, err);
        return throwError(() => new Error(`Failed to retrieve shared bucket: ${err.message || err}`));
      })
    );
  }
  
  /**
   * Get bucket statistics (item counts, share counts)
   * @param bucketClass The type of bucket
   * @param bucketIds Array of bucket IDs to get stats for
   * @returns Observable of bucket stats keyed by bucket ID
   */
  getBucketStats(
    bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy',
    bucketIds: number[]
  ): Observable<any> {
    if (!bucketIds.length) {
      return of({});
    }
    
    // Filter out any invalid IDs
    const validBucketIds = bucketIds.filter(id => id && !isNaN(Number(id)) && id !== -1);
    
    if (!validBucketIds.length) {
      return of({});
    }
    
    return this.net.request(
      'open-ils.actor',
      `open-ils.actor.container.${bucketClass}.count_stats.authoritative`,
      this.auth.token(),
      validBucketIds
    ).pipe(
      catchError(() => of({}))
    );
  }

  /**
   * Load favorite bucket flags from the database
   * @param bucketClass The type of bucket
   * @returns Promise that resolves when flags are loaded
   */
  async loadFavoriteBucketFlags(bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy'): Promise<void> {
    const bucketFmClass = this.getBucketFmClass(bucketClass);
    const flagClass = bucketFmClass + 'uf';
    
    if (!this.idl.classes[flagClass]) {
      console.warn(`Favorite flags not implemented for ${bucketClass} buckets`);
      return;
    }
    
    try {
      const flags = await lastValueFrom(
        this.pcrud.search(flagClass, 
          { 
            flag: 'favorite', 
            usr: this.auth.user().id() 
          }, 
          {}, 
          { 
            idlist: false, 
            atomic: true 
          }
        )
      );
      
      this.favoriteBucketFlags[bucketClass] = (flags || []).reduce((acc, flag) => {
        const bucketId = typeof flag.bucket === 'function' ? flag.bucket() : flag.bucket;
        acc[bucketId] = flag;
        return acc;
      }, {});
    } catch (error) {
      console.error(`Error loading favorite flags for ${bucketClass} buckets:`, error);
      this.favoriteBucketFlags[bucketClass] = {};
    }
  }

  /**
   * Check if a bucket is marked as favorite
   * @param bucketClass The type of bucket
   * @param bucketId The bucket ID to check
   * @returns True if the bucket is a favorite
   */
  isFavoriteBucket(bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy', bucketId: number): boolean {
    return !!this.favoriteBucketFlags[bucketClass]?.[bucketId];
  }

  /**
   * Add a bucket to favorites
   * @param bucketClass The type of bucket
   * @param bucketId The ID of the bucket to favorite
   * @returns Promise resolving when complete
   */
  async addFavoriteBucket(bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy', bucketId: number): Promise<void> {
    const bucketFmClass = this.getBucketFmClass(bucketClass);
    const flagClass = bucketFmClass + 'uf';
    
    if (!this.idl.classes[flagClass]) {
      throw new Error(`Favorite flags not implemented for ${bucketClass} buckets`);
    }
    
    // Check if already a favorite
    if (this.favoriteBucketFlags[bucketClass]?.[bucketId]) {
      return;
    }
    
    // Create and store flag
    const flag = this.idl.create(flagClass);
    flag.isnew(true);
    flag.bucket(bucketId);
    flag.usr(this.auth.user().id());
    flag.flag('favorite');
    
    try {
      const createdFlag = await lastValueFrom(this.pcrud.create(flag));
      if (!this.favoriteBucketFlags[bucketClass]) {
        this.favoriteBucketFlags[bucketClass] = {};
      }
      this.favoriteBucketFlags[bucketClass][bucketId] = createdFlag;
      this.requestBucketsRefresh(bucketClass);
    } catch (error) {
      console.error(`Error adding favorite for bucket ${bucketId}:`, error);
      throw error;
    }
  }

  /**
   * Remove a bucket from favorites
   * @param bucketClass The type of bucket
   * @param bucketId The ID of the bucket to unfavorite
   * @returns Promise resolving when complete
   */
  async removeFavoriteBucket(bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy', bucketId: number): Promise<void> {
    // Check if it's a favorite
    if (!this.favoriteBucketFlags[bucketClass]?.[bucketId]) {
      return;
    }
    
    try {
      await lastValueFrom(this.pcrud.remove(this.favoriteBucketFlags[bucketClass][bucketId]));
      delete this.favoriteBucketFlags[bucketClass][bucketId];
      this.requestBucketsRefresh(bucketClass);
    } catch (error) {
      console.error(`Error removing favorite for bucket ${bucketId}:`, error);
      throw error;
    }
  }

  /**
   * Get the IDs of all favorite buckets of a specific type
   * @param bucketClass The type of bucket
   * @returns Array of favorite bucket IDs
   */
  getFavoriteBucketIds(bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy'): number[] {
    if (!this.favoriteBucketFlags[bucketClass]) {
      return [];
    }
    return Object.keys(this.favoriteBucketFlags[bucketClass]).map(Number);
  }
}
