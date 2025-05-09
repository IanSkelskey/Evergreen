import { Injectable } from '@angular/core';
import { Observable, Subject, of, throwError, lastValueFrom } from 'rxjs';
import { catchError, map, tap, switchMap, toArray } from 'rxjs/operators';

import { NetService } from '@eg/core/net.service';
import { IdlService, IdlObject } from '@eg/core/idl.service';
import { AuthService } from '@eg/core/auth.service';
import { EventService } from '@eg/core/event.service';
import { OrgService } from '@eg/core/org.service';
import { StoreService } from '@eg/core/store.service';
import { PcrudService } from '@eg/core/pcrud.service';

const BUCKET_CLASSES = ['biblio', 'user', 'callnumber', 'copy'] as const;
type BucketClass = typeof BUCKET_CLASSES[number];

const CONSTANTS = {
  STORAGE_KEYS: {
    BUCKET_LOG_PREFIX: 'eg.bucket_log.',
  },
  PUBLIC_TRUE: 't',
  PUBLIC_FALSE: 'f',
  MAX_RECENT_BUCKETS: 10,
  DEFAULT_BUCKET_TYPE: 'staff_client'
};

@Injectable({ providedIn: 'root' })
export class BucketService {
  private bucketRefreshSource = Object.fromEntries(
    BUCKET_CLASSES.map(type => [type, new Subject<void>()])
  ) as Record<BucketClass, Subject<void>>;
  public bucketRefresh$ = Object.fromEntries(
    BUCKET_CLASSES.map(type => [type, this.bucketRefreshSource[type].asObservable()])
  ) as Record<BucketClass, Observable<void>>;

  private bucketFmClassMap = {
    biblio: 'cbreb', user: 'cub', callnumber: 'ccnb', copy: 'ccb'
  };
  private bucketItemFmClassMap = {
    biblio: 'cbrebi', user: 'cubi', callnumber: 'ccnbi', copy: 'ccbi'
  };
  private targetFieldMap = {
    biblio: 'target_biblio_record_entry',
    user: 'target_user',
    callnumber: 'target_call_number',
    copy: 'target_copy'
  };

  private favoriteBucketFlags: Record<BucketClass, { [bucketId: number]: IdlObject }> = {
    biblio: {}, user: {}, callnumber: {}, copy: {}
  };
  maxRecentBuckets = CONSTANTS.MAX_RECENT_BUCKETS;
  private recentBuckets: Map<number, Date> = new Map();

  constructor(
    private net: NetService,
    private idl: IdlService,
    private auth: AuthService,
    private evt: EventService,
    private org: OrgService,
    private store: StoreService,
    private pcrud: PcrudService
  ) {
    this.loadRecentBucketsFromStorage();
  }

  requestBucketsRefresh(bucketClass: BucketClass): void {
    this.bucketRefreshSource[bucketClass].next();
  }

  logBucket(bucketClass: BucketClass, bucketId: number): void {
    if (!bucketId) return;
    this.recentBuckets.set(bucketId, new Date());
    const storageKey = CONSTANTS.STORAGE_KEYS.BUCKET_LOG_PREFIX + bucketClass;
    const bucketLog: number[] = this.store.getLocalItem(storageKey) || [];
    if (!bucketLog.includes(bucketId)) {
      bucketLog.unshift(bucketId);
      if (bucketLog.length > this.maxRecentBuckets) bucketLog.pop();
      this.store.setLocalItem(storageKey, bucketLog);
    }
  }

  private loadRecentBucketsFromStorage(): void {
    this.recentBuckets.clear();
    BUCKET_CLASSES.forEach(type => {
      const storageKey = CONSTANTS.STORAGE_KEYS.BUCKET_LOG_PREFIX + type;
      const bucketLog: number[] = this.store.getLocalItem(storageKey) || [];
      const now = new Date();
      bucketLog.forEach((bucketId, idx) => {
        const timestamp = new Date(now);
        timestamp.setMinutes(now.getMinutes() - idx);
        this.recentBuckets.set(bucketId, timestamp);
      });
    });
  }

  getRecentBuckets(bucketClass?: BucketClass): number[] {
    if (bucketClass) {
      const storageKey = CONSTANTS.STORAGE_KEYS.BUCKET_LOG_PREFIX + bucketClass;
      return this.store.getLocalItem(storageKey) || [];
    }
    return Array.from(this.recentBuckets.entries())
      .sort((a, b) => b[1].getTime() - a[1].getTime())
      .map(entry => entry[0]);
  }

  getBucketFmClass(bucketClass: BucketClass): string {
    return this.bucketFmClassMap[bucketClass];
  }
  getBucketItemFmClass(bucketClass: BucketClass): string {
    return this.bucketItemFmClassMap[bucketClass];
  }
  getTargetField(bucketClass: BucketClass): string {
    return this.targetFieldMap[bucketClass];
  }

  async checkBucketAccess(
    bucketClass: BucketClass,
    bucket: IdlObject | number,
    requiresWrite = false
  ): Promise<IdlObject> {
    const bucketFmClass = this.getBucketFmClass(bucketClass);
    const userId = this.auth.user().id();
    let bucketObj: IdlObject;
    if (typeof bucket === 'number') {
      bucketObj = await lastValueFrom(
        this.pcrud.retrieve(bucketFmClass, bucket, {
          flesh: 1, flesh_fields: { [bucketFmClass]: ['owner'] }
        })
      );
      if (!bucketObj) throw new Error($localize`Bucket not found`);
    } else if (bucket && typeof bucket.id === 'function') {
      bucketObj = bucket;
    } else {
      throw new Error($localize`Invalid bucket parameter`);
    }
    let ownerId: number;
    try {
      const owner = bucketObj.owner?.();
      ownerId = typeof owner?.id === 'function' ? owner.id() : Number(owner);
    } catch { throw new Error($localize`Permission denied: Unable to determine bucket ownership`); }
    if (ownerId === userId) return bucketObj;
    if (requiresWrite) throw new Error($localize`You do not have permission to modify this bucket`);
    let isPublic = false;
    try {
      const pub = bucketObj.pub?.() ?? bucketObj.pub;
      isPublic = pub === CONSTANTS.PUBLIC_TRUE || pub === true;
    } catch {}
    if (isPublic) return bucketObj;
    throw new Error($localize`This bucket is private and can only be accessed by its owner`);
  }

  createBucket(
    bucketClass: BucketClass,
    name: string,
    description = '',
    bucketType = CONSTANTS.DEFAULT_BUCKET_TYPE,
    isPublic = false
  ): Observable<number> {
    const bucketFmClass = this.getBucketFmClass(bucketClass);
    const bucket = this.idl.create(bucketFmClass);
    bucket.owner(this.auth.user().id());
    bucket.name(name);
    bucket.description(description);
    bucket.btype(bucketType);
    bucket.pub(isPublic ? CONSTANTS.PUBLIC_TRUE : CONSTANTS.PUBLIC_FALSE);
    if (bucket.owning_lib) bucket.owning_lib(this.auth.user().home_ou() || this.org.root());
    return this.net.request(
      'open-ils.actor', 'open-ils.actor.container.create',
      this.auth.token(), bucketClass, bucket
    ).pipe(
      catchError(err => throwError(() => new Error(`Failed to create bucket: ${err.message || err}`))),
      tap(bucketId => { if (bucketId) { this.logBucket(bucketClass, bucketId); this.requestBucketsRefresh(bucketClass); } })
    );
  }

  retrieveBucketById(bucketClass: BucketClass, bucketId: number): Observable<any> {
    return this.net.request(
      'open-ils.actor', 'open-ils.actor.container.flesh',
      this.auth.token(), bucketClass, bucketId
    ).pipe(
      map(resp => { const evt = this.evt.parse(resp); if (evt) throw new Error(evt.toString()); return resp; }),
      catchError(err => throwError(() => new Error(`Failed to retrieve bucket: ${err.message || err}`))),
      tap(() => this.logBucket(bucketClass, bucketId))
    );
  }

  updateBucket(bucketClass: BucketClass, bucket: any): Observable<any> {
    const bucketId = typeof bucket.id === 'function' ? bucket.id() : Number(bucket.id);
    if (!bucketId || isNaN(bucketId)) return throwError(() => new Error('Invalid bucket ID'));
    const bucketFmClass = this.getBucketFmClass(bucketClass);
    return this.pcrud.retrieve(bucketFmClass, bucketId).pipe(
      map(existingBucket => {
        if (!existingBucket) throw new Error('Bucket not found');
        if (bucket.name !== undefined) existingBucket.name(typeof bucket.name === 'function' ? bucket.name() : bucket.name);
        if (bucket.description !== undefined) existingBucket.description(typeof bucket.description === 'function' ? bucket.description() : bucket.description);
        if (bucket.pub !== undefined) {
          const pubValue = typeof bucket.pub === 'function' ? bucket.pub() : bucket.pub;
          existingBucket.pub(pubValue === true || pubValue === CONSTANTS.PUBLIC_TRUE ? CONSTANTS.PUBLIC_TRUE : CONSTANTS.PUBLIC_FALSE);
        }
        if (bucket.btype !== undefined) existingBucket.btype(typeof bucket.btype === 'function' ? bucket.btype() : bucket.btype);
        existingBucket.ischanged(true);
        return existingBucket;
      }),
      switchMap(updatedBucket =>
        this.pcrud.update(updatedBucket).pipe(
          map(() => ({ success: true, id: bucketId })),
          catchError(err => throwError(() => new Error(`Failed to update bucket via pcrud: ${err.message || err}`)))
        )
      ),
      catchError(err => throwError(() => new Error(`Failed to update bucket: ${err.message || err}`))),
      tap(() => { this.logBucket(bucketClass, bucketId); this.requestBucketsRefresh(bucketClass); })
    );
  }

  deleteBucket(bucketClass: BucketClass, bucketId: number): Observable<any> {
    return this.net.request(
      'open-ils.actor', 'open-ils.actor.container.full_delete',
      this.auth.token(), bucketClass, bucketId
    ).pipe(
      map(resp => { const evt = this.evt.parse(resp); if (evt) throw new Error(evt.toString()); return resp; }),
      catchError(err => throwError(() => new Error(`Failed to delete bucket: ${err.message || err}`))),
      tap(() => {
        this.recentBuckets.delete(bucketId);
        const storageKey = CONSTANTS.STORAGE_KEYS.BUCKET_LOG_PREFIX + bucketClass;
        const bucketLog: number[] = this.store.getLocalItem(storageKey) || [];
        const idx = bucketLog.indexOf(bucketId);
        if (idx !== -1) { bucketLog.splice(idx, 1); this.store.setLocalItem(storageKey, bucketLog); }
        this.requestBucketsRefresh(bucketClass);
      })
    );
  }

  retrieveUserBuckets(bucketClass: BucketClass, bucketType = CONSTANTS.DEFAULT_BUCKET_TYPE): Observable<any[]> {
    return this.net.request(
      'open-ils.actor', 'open-ils.actor.container.retrieve_by_class.authoritative',
      this.auth.token(), this.auth.user().id(), bucketClass, bucketType
    ).pipe(
      map(buckets => buckets || []),
      catchError(() => of([]))
    );
  }

  async checkItemsInBucket(
    bucketClass: BucketClass,
    bucketId: number,
    itemIds: number[]
  ): Promise<Map<number, boolean>> {
    if (!itemIds.length) return new Map();
    const existingItems = new Map<number, boolean>();
    const bucketItemClass = this.getBucketItemFmClass(bucketClass);
    const targetField = this.getTargetField(bucketClass);
    try {
      const query: any = { bucket: bucketId };
      query[targetField] = itemIds;
      const results = await lastValueFrom(
        this.pcrud.search(bucketItemClass, query, {}, { atomic: true }).pipe(toArray(), catchError(() => of([])))
      );
      results.forEach(item => {
        if (item && item[targetField]) {
          const targetId = typeof item[targetField] === 'function' ? item[targetField]() : item[targetField];
          existingItems.set(Number(targetId), true);
        }
      });
      return existingItems;
    } catch { return new Map(); }
  }

  async addItemsToBucket(
    bucketClass: BucketClass,
    bucketId: number,
    itemIds: number[],
    preventDuplicates = true
  ): Promise<any> {
    if (!itemIds.length) return { success: true, count: 0, added: 0, alreadyInBucket: 0 };
    this.logBucket(bucketClass, bucketId);
    await this.checkBucketAccess(bucketClass, bucketId, true);
    let newItemIds = itemIds, existingItemIds: number[] = [];
    if (preventDuplicates) {
      const existingItems = await this.checkItemsInBucket(bucketClass, bucketId, itemIds);
      existingItemIds = Array.from(existingItems.keys());
      newItemIds = itemIds.filter(id => !existingItems.has(id));
      if (!newItemIds.length) {
        return { success: true, count: itemIds.length, added: 0, alreadyInBucket: existingItemIds.length, addedIds: [], existingIds: existingItemIds };
      }
    }
    const targetField = this.getTargetField(bucketClass);
    const bucketItemClass = this.getBucketItemFmClass(bucketClass);
    const items = newItemIds.map(itemId => {
      const item = this.idl.create(bucketItemClass);
      item.bucket(bucketId);
      item[targetField](itemId);
      return item;
    });
    try {
      const response = await lastValueFrom(
        this.net.request('open-ils.actor', 'open-ils.actor.container.item.create', this.auth.token(), bucketClass, items)
      );
      const evt = this.evt.parse(response);
      if (evt) throw new Error(evt.toString());
      this.requestBucketsRefresh(bucketClass);
      return {
        success: true, count: itemIds.length, added: newItemIds.length, alreadyInBucket: existingItemIds.length,
        addedIds: newItemIds, existingIds: existingItemIds, response
      };
    } catch (error) {
      throw new Error(`Error adding items to ${bucketClass} bucket: ${error.message || error}`);
    }
  }

  async removeItemsFromBucket(bucketClass: BucketClass, itemIds: number[]): Promise<any> {
    if (!itemIds.length) return { success: true, count: 0, removed: 0 };
    const results = [], errors = [];
    for (const itemId of itemIds) {
      try {
        const response = await lastValueFrom(
          this.net.request('open-ils.actor', 'open-ils.actor.container.item.delete', this.auth.token(), bucketClass, itemId)
        );
        const evt = this.evt.parse(response);
        if (evt && (evt.textcode === 'CONTAINER_ITEM_NOT_FOUND' || evt.textcode === 'CONTAINER_USER_BUCKET_ITEM_NOT_FOUND')) {
          results.push({ id: itemId, success: true, already_removed: true });
        } else if (evt) {
          errors.push({ id: itemId, error: evt });
        } else {
          results.push({ id: itemId, success: true });
        }
      } catch (error) {
        errors.push({ id: itemId, error });
      }
    }
    const success = results.length > 0;
    if (success) this.requestBucketsRefresh(bucketClass);
    return { success, count: itemIds.length, removed: results.length, failed: errors.length, results, errors };
  }

  retrieveBucketItems(bucketClass: BucketClass, bucketId: number): Observable<any[]> {
    return this.net.request(
      'open-ils.actor', 'open-ils.actor.container.contents.retrieve',
      this.auth.token(), bucketClass, bucketId
    ).pipe(
      map(resp => { const evt = this.evt.parse(resp); if (evt) throw new Error(evt.toString()); return resp || []; }),
      catchError(() => of([])),
      tap(() => this.logBucket(bucketClass, bucketId))
    );
  }

  transformBucketsForGrid(bucketClass: BucketClass, buckets: IdlObject[] | IdlObject): any[] {
    if (!buckets) return [];
    const bucketArray = Array.isArray(buckets) ? buckets : [buckets];
    return bucketArray.map((bucket, idx) => {
      if (!bucket) return this.createEmptyBucketDisplay(idx);
      let ownerUsername = '';
      try { ownerUsername = bucket.owner?.().usrname?.() || ''; } catch {}
      const bucketId = this.safeGetProperty(bucket, 'id', `bucket_${idx}`);
      return {
        id: bucketId,
        name: this.safeGetProperty(bucket, 'name', ''),
        description: this.safeGetProperty(bucket, 'description', ''),
        btype: this.safeGetProperty(bucket, 'btype', ''),
        owner_usrname: ownerUsername,
        create_time: this.safeGetProperty(bucket, 'create_time', null) ? new Date(this.safeGetProperty(bucket, 'create_time', null)) : null,
        bucket,
        owning_lib: this.safeGetProperty(bucket, 'owning_lib', null),
        is_public: this.safeGetProperty(bucket, 'pub', '') === CONSTANTS.PUBLIC_TRUE,
        favorite: typeof bucketId === 'number' ? this.isFavoriteBucket(bucketClass, bucketId) : false
      };
    });
  }
  private createEmptyBucketDisplay(index: number): any {
    return { id: `unknown_${index}`, name: 'Unknown Bucket', description: '', btype: '', owner_usrname: '', create_time: null, bucket: null, owning_lib: null, is_public: false, favorite: false };
  }
  private safeGetProperty<T>(obj: any, property: string, defaultValue: T): T {
    if (!obj) return defaultValue;
    try {
      if (typeof obj[property] === 'function') return obj[property]() || defaultValue;
      else if (obj[property] !== undefined) return obj[property];
    } catch {}
    return defaultValue;
  }

  retrieveSharedBucket(bucketClass: BucketClass, bucketId: number): Observable<any> {
    return this.retrieveBucketById(bucketClass, bucketId);
  }

  getBucketStats(bucketClass: BucketClass, bucketIds: number[]): Observable<any> {
    if (!bucketIds.length) return of({});
    const validBucketIds = bucketIds.filter(id => id && !isNaN(Number(id)) && id !== -1);
    if (!validBucketIds.length) return of({});
    return this.net.request(
      'open-ils.actor',
      `open-ils.actor.container.${bucketClass}.count_stats.authoritative`,
      this.auth.token(),
      validBucketIds
    ).pipe(catchError(() => of({})));
  }

  async loadFavoriteBucketFlags(bucketClass: BucketClass): Promise<void> {
    const bucketFmClass = this.getBucketFmClass(bucketClass);
    const flagClass = bucketFmClass + 'uf';
    if (!this.idl.classes[flagClass]) return;
    try {
      const flags = await lastValueFrom(
        this.pcrud.search(flagClass, { flag: 'favorite', usr: this.auth.user().id() }, {}, { idlist: false, atomic: true })
      );
      this.favoriteBucketFlags[bucketClass] = (flags || []).reduce((acc, flag) => {
        const bucketId = typeof flag.bucket === 'function' ? flag.bucket() : flag.bucket;
        acc[bucketId] = flag;
        return acc;
      }, {});
    } catch { this.favoriteBucketFlags[bucketClass] = {}; }
  }

  isFavoriteBucket(bucketClass: BucketClass, bucketId: number): boolean {
    return !!this.favoriteBucketFlags[bucketClass]?.[bucketId];
  }

  async addFavoriteBucket(bucketClass: BucketClass, bucketId: number): Promise<void> {
    const bucketFmClass = this.getBucketFmClass(bucketClass);
    const flagClass = bucketFmClass + 'uf';
    if (!this.idl.classes[flagClass]) throw new Error(`Favorite flags not implemented for ${bucketClass} buckets`);
    if (this.favoriteBucketFlags[bucketClass]?.[bucketId]) return;
    const flag = this.idl.create(flagClass);
    flag.isnew(true);
    flag.bucket(bucketId);
    flag.usr(this.auth.user().id());
    flag.flag('favorite');
    try {
      const createdFlag = await lastValueFrom(this.pcrud.create(flag));
      if (!this.favoriteBucketFlags[bucketClass]) this.favoriteBucketFlags[bucketClass] = {};
      this.favoriteBucketFlags[bucketClass][bucketId] = createdFlag;
      this.requestBucketsRefresh(bucketClass);
    } catch (error) { throw error; }
  }

  async removeFavoriteBucket(bucketClass: BucketClass, bucketId: number): Promise<void> {
    if (!this.favoriteBucketFlags[bucketClass]?.[bucketId]) return;
    try {
      await lastValueFrom(this.pcrud.remove(this.favoriteBucketFlags[bucketClass][bucketId]));
      delete this.favoriteBucketFlags[bucketClass][bucketId];
      this.requestBucketsRefresh(bucketClass);
    } catch (error) { throw error; }
  }

  getFavoriteBucketIds(bucketClass: BucketClass): number[] {
    return Object.keys(this.favoriteBucketFlags[bucketClass] || {}).map(Number);
  }
}
