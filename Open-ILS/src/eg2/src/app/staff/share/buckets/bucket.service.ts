import { Injectable } from '@angular/core';
import { Observable, Subject, of, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

import { NetService } from '@eg/core/net.service';
import { IdlService } from '@eg/core/idl.service';
import { AuthService } from '@eg/core/auth.service';
import { EventService } from '@eg/core/event.service';
import { OrgService } from '@eg/core/org.service';

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

  // Map bucket class to target field for items
  private targetFieldMap = {
    'biblio': 'target_biblio_record_entry',
    'user': 'target_user',
    'callnumber': 'target_call_number',
    'copy': 'target_copy'
  };

  // Bucket history - track recently used buckets
  private recentBuckets: Map<number, Date> = new Map<number, Date>();

  constructor(
    private net: NetService,
    private idl: IdlService,
    private auth: AuthService,
    private evt: EventService,
    private org: OrgService
  ) {}

  /**
   * Request a refresh of buckets for a specific bucket class
   * @param bucketClass The type of bucket ('biblio', 'user', 'callnumber', 'copy')
   */
  requestBucketsRefresh(bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy'): void {
    this.bucketRefreshSource[bucketClass].next();
  }

  /**
   * Log a bucket as recently used
   * @param bucketId The ID of the bucket to log
   */
  logBucket(bucketId: number): void {
    this.recentBuckets.set(bucketId, new Date());
  }

  /**
   * Get recent buckets in order of most recently used
   */
  getRecentBuckets(): number[] {
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
   * Get the target field name for bucket items
   */
  getTargetField(bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy'): string {
    return this.targetFieldMap[bucketClass];
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
    bucketType: string = 'staff_client',
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
    bucket.pub(isPublic ? 't' : 'f');
    
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
        return throwError(err);
      }),
      tap(bucketId => {
        if (bucketId) {
          this.logBucket(bucketId);
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
        return throwError(err);
      }),
      tap(() => this.logBucket(bucketId))
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
        return throwError(err);
      }),
      tap(() => {
        this.logBucket(bucket.id());
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
        return throwError(err);
      }),
      tap(() => {
        this.recentBuckets.delete(bucketId);
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
    bucketType: string = 'staff_client'
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
   * Add items to a bucket
   * @param bucketClass The type of bucket
   * @param bucketId The ID of the bucket to add items to
   * @param itemIds Array of item IDs to add
   */
  addItemsToBucket(
    bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy',
    bucketId: number,
    itemIds: number[]
  ): Observable<any> {
    if (!itemIds.length) {
      return of({ success: true, count: 0 });
    }

    const targetField = this.getTargetField(bucketClass);
    const bucketFmClass = this.getBucketFmClass(bucketClass);
    const items = [];

    itemIds.forEach(itemId => {
      const item = this.idl.create(bucketFmClass + 'i');
      item.bucket(bucketId);
      item[targetField](itemId);
      items.push(item);
    });

    return this.net.request(
      'open-ils.actor',
      'open-ils.actor.container.item.create',
      this.auth.token(), bucketClass, items
    ).pipe(
      map(resp => {
        const evt = this.evt.parse(resp);
        if (evt) {
          throw new Error(evt.toString());
        }
        return { success: true, count: itemIds.length };
      }),
      catchError(err => {
        console.error(`Error adding items to ${bucketClass} bucket ${bucketId}:`, err);
        return throwError(err);
      }),
      tap(() => {
        this.logBucket(bucketId);
        this.requestBucketsRefresh(bucketClass);
      })
    );
  }

  /**
   * Remove items from a bucket
   * @param bucketClass The type of bucket
   * @param itemIds Array of bucket item IDs to remove (these are the IDs of the bucket items, not the target items)
   */
  removeItemsFromBucket(
    bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy',
    itemIds: number[]
  ): Observable<any> {
    if (!itemIds.length) {
      return of({ success: true, count: 0 });
    }

    return this.net.request(
      'open-ils.actor',
      'open-ils.actor.container.item.delete',
      this.auth.token(), bucketClass, itemIds
    ).pipe(
      map(resp => {
        const evt = this.evt.parse(resp);
        if (evt) {
          throw new Error(evt.toString());
        }
        return { success: true, count: itemIds.length };
      }),
      catchError(err => {
        console.error(`Error removing items from ${bucketClass} bucket:`, err);
        return throwError(err);
      }),
      tap(() => {
        this.requestBucketsRefresh(bucketClass);
      })
    );
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
      tap(() => this.logBucket(bucketId))
    );
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
        return throwError(err);
      })
    );
  }
}
