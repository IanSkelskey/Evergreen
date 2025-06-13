import { Injectable } from '@angular/core';
import { Subject, lastValueFrom, Observable } from 'rxjs';
import { tap, map, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { PcrudService } from '@eg/core/pcrud.service';
import { NetService } from '@eg/core/net.service';
import { AuthService } from '@eg/core/auth.service';
import { IdlObject } from '@eg/core/idl.service';
import { BucketService } from '@eg/staff/share/buckets/bucket.service';
import { ɵ$localize as $localize } from '@angular/localize';

/**
 * Service for managing patron buckets (collections of patrons)
 * Extends the core bucket functionality with patron-specific features
 */
@Injectable({
  providedIn: 'root'
})
export class PatronBucketService {
  private readonly BUCKET_TYPE = 'user';
  private patronBucketsRefreshRequested = new Subject<void>();
  public patronBucketsRefresh$ = this.patronBucketsRefreshRequested.asObservable();

  constructor(
    private pcrud: PcrudService,
    private bucketService: BucketService,
    private net: NetService,
    private auth: AuthService
  ) {}

  // Bucket Management - Direct delegation to shared service
  requestPatronBucketsRefresh(): void {
    this.patronBucketsRefreshRequested.next();
    this.bucketService.requestBucketsRefresh(this.BUCKET_TYPE);
  }

  logPatronBucket(bucketId: number): void {
    this.bucketService.logBucket(this.BUCKET_TYPE, bucketId);
  }

  recentPatronBucketIds(): number[] {
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
    try {
      return await lastValueFrom(this.bucketService.retrieveBucketById(this.BUCKET_TYPE, bucketId));
    } catch (error: any) {
      const message = this.isEmptyError(error) 
        ? $localize`No bucket found with ID ${bucketId}`
        : $localize`Error retrieving bucket: ${error.message || error}`;
      throw new Error(message);
    }
  }

  transformBucketsForGrid(buckets: IdlObject[] | IdlObject): any[] {
    return this.bucketService.transformBucketsForGrid(this.BUCKET_TYPE, buckets);
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

  getPatronBucketStats(bucketIds: number[]): Observable<any> {
    return this.bucketService.getBucketStats(this.BUCKET_TYPE, bucketIds);
  }

  async addPatronsToPatronBucket(bucketId: number, patronIds: number[]): Promise<any> {
    return this.bucketService.addItemsToBucket(this.BUCKET_TYPE, bucketId, patronIds, true);
  }

  async removePatronsFromPatronBucket(itemIds: number[]): Promise<any> {
    return this.bucketService.removeItemsFromBucket(this.BUCKET_TYPE, itemIds);
  }

  async checkPatronInBucket(bucketId: number, patronId: number): Promise<any[]> {
    try {
      const existingItems = await this.bucketService.checkItemsInBucket(this.BUCKET_TYPE, bucketId, [patronId]);
      return existingItems.has(patronId) ? [true] : [];
    } catch (error) {
      console.error('Error checking if patron is in bucket:', error);
      return [];
    }
  }

  // Favorite functionality - delegate to shared service
  async loadFavoritePatronBucketFlags(): Promise<void> {
    await this.bucketService.loadFavoriteBucketFlags(this.BUCKET_TYPE);
  }

  isFavoritePatronBucket(bucketId: number): boolean {
    return this.bucketService.isFavoriteBucket(this.BUCKET_TYPE, bucketId);
  }

  async addFavoritePatronBucketFlag(bucketId: number): Promise<void> {
    await this.bucketService.addFavoriteBucket(this.BUCKET_TYPE, bucketId);
    this.requestPatronBucketsRefresh();
  }

  async removeFavoritePatronBucketFlag(bucketId: number): Promise<void> {
    await this.bucketService.removeFavoriteBucket(this.BUCKET_TYPE, bucketId);
    this.requestPatronBucketsRefresh();
  }

  getFavoritePatronBucketIds(): number[] {
    return this.bucketService.getFavoriteBucketIds(this.BUCKET_TYPE);
  }

  // Patron-specific functionality
  async retrievePatronBucketItems(bucketId: number): Promise<any[]> {
    await this.checkBucketAccess(bucketId);
    
    const query = { bucket: bucketId };
    const options = {
      flesh: 2,
      flesh_fields: {
        cubi: ['target_user'],
        au: ['card']
      }
    };
    
    const items = await lastValueFrom(
      this.pcrud.search('cubi', query, options, { atomic: true })
    );
    
    const itemsArray = this.normalizeToArray(items);
    return itemsArray.map(item => this.transformBucketItem(item));
  }

  async retrievePatronByBarcode(barcode: string): Promise<{patron?: any, error?: string, errorTitle?: string}> {
    const response = await lastValueFrom(
      this.net.request(
        'open-ils.actor',
        'open-ils.actor.user.fleshed.retrieve_by_barcode',
        this.auth.token(),
        barcode.trim()
      ).pipe(catchError(() => of(null)))
    );

    if (!response) {
      return {
        error: $localize`No patron found with barcode "${barcode}"`,
        errorTitle: $localize`Patron Not Found`
      };
    }

    if (this.isApiError(response)) {
      return this.handleApiError(response, barcode);
    }

    return { patron: response };
  }

  async addPatronByBarcode(bucketId: number, barcode: string): Promise<{
    success: boolean,
    added?: boolean,
    duplicate?: boolean,
    patronName?: string,
    error?: string,
    errorTitle?: string
  }> {
    const lookupResult = await this.retrievePatronByBarcode(barcode);
    
    if (lookupResult.error) {
      return {
        success: false,
        error: lookupResult.error,
        errorTitle: lookupResult.errorTitle
      };
    }

    const patron = lookupResult.patron;
    const existingItems = await this.checkPatronInBucket(bucketId, patron.id());
    
    if (existingItems.length > 0) {
      return { success: true, duplicate: true };
    }
    
    const addResult = await this.addPatronsToPatronBucket(bucketId, [patron.id()]);
    
    if (addResult.added > 0) {
      return {
        success: true,
        added: true,
        patronName: `${patron.family_name()}, ${patron.first_given_name()}`
      };
    }
    
    if (addResult.alreadyInBucket > 0) {
      return { success: true, duplicate: true };
    }
    
    return {
      success: false,
      error: $localize`Failed to add patron to bucket`
    };
  }

  async processBarcodeFile(
    bucketId: number, 
    fileContent: string,
    progressCallback?: (progress: {value: number, max: number}) => void
  ): Promise<{added: number, duplicates: number, errors: number, processed: number}> {
    const barcodes = this.extractBarcodesFromFile(fileContent);
    const results = { added: 0, duplicates: 0, errors: 0, processed: 0 };
    
    for (const barcode of barcodes) {
      await this.processSingleBarcode(bucketId, barcode, results);
      
      results.processed++;
      progressCallback?.({ value: results.processed, max: barcodes.length });
    }
    
    return results;
  }

  async batchEditPatrons(
    bucketId: number,
    editParams: any,
    progressCallback?: (progress: any) => void
  ): Promise<any> {
    this.validateBatchEditParams(bucketId, editParams);
    await this.checkBucketAccess(bucketId, true);
    
    return lastValueFrom(
      this.net.request(
        'open-ils.actor',
        'open-ils.actor.container.user.batch_edit',
        this.auth.token(),
        bucketId,
        editParams.name,
        editParams
      ).pipe(
        tap(progress => this.handleBatchProgress(progress, progressCallback)),
        map(progress => this.mapBatchResult(progress)),
        catchError(error => of({ success: false, error: error.message || error }))
      )
    );
  }

  async applyRollbackToPatronBucket(
    bucketId: number,
    fieldsetGroupId: number,
    progressCallback?: (progress: any) => void
  ): Promise<any> {
    this.validateRollbackParams(bucketId, fieldsetGroupId);
    await this.checkBucketAccess(bucketId, true);
    
    return lastValueFrom(
      this.net.request(
        'open-ils.actor',
        'open-ils.actor.container.user.apply_rollback',
        this.auth.token(),
        bucketId,
        fieldsetGroupId
      ).pipe(
        tap(progress => this.handleRollbackProgress(progress, progressCallback)),
        map(progress => this.mapBatchResult(progress)),
        catchError(error => of({ success: false, error: error.message || error }))
      )
    );
  }

  // Private helper methods
  private isEmptyError(error: any): boolean {
    return error?.message === 'no elements in sequence' || error?.name === 'EmptyError';
  }

  private normalizeToArray<T>(items: T | T[] | null): T[] {
    if (!items) return [];
    return Array.isArray(items) ? items : [items];
  }

  private transformBucketItem(item: IdlObject): any {
    try {
      const user = item.target_user();
      const { firstName, lastName, barcode } = this.extractPatronInfo(user);
      
      return {
        id: item.id(),
        bucketId: item.bucket(),
        userId: user?.id() || 0,
        patron_name: lastName ? `${lastName}, ${firstName}` : 'Unknown Patron',
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

  private extractPatronInfo(user: IdlObject): {firstName: string, lastName: string, barcode: string} {
    if (!user) {
      return { firstName: '', lastName: '', barcode: '' };
    }
    
    const firstName = this.safeGetProperty(user, 'first_given_name', '');
    const lastName = this.safeGetProperty(user, 'family_name', '');
    const barcode = user.card?.()?.barcode?.() || '';
    
    return { firstName, lastName, barcode };
  }

  private safeGetProperty<T>(obj: any, property: string, defaultValue: T): T {
    if (!obj) return defaultValue;
    
    try {
      const value = typeof obj[property] === 'function' ? obj[property]() : obj[property];
      return value !== undefined ? value : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  private isApiError(response: any): boolean {
    return response && typeof response === 'object' && response.ilsevent;
  }

  private handleApiError(response: any, barcode: string): {error: string, errorTitle: string} {
    const errorMappings = {
      'ACTOR_CARD_NOT_FOUND': $localize`No patron found with barcode "${barcode}".`,
      'ACTOR_USER_NOT_FOUND': $localize`The patron associated with barcode "${barcode}" could not be found.`,
      'NO_SESSION': $localize`Your session has expired. Please log in again.`,
      'ACTOR_USER_BARRED': $localize`This patron account is barred. Barcode: ${barcode}`,
      'ACTOR_CARD_INACTIVE': $localize`This patron card is marked as inactive. Barcode: ${barcode}`
    };
    
    const errorTitle = response.textcode === 'NO_SESSION' 
      ? $localize`Session Expired` 
      : $localize`Error Finding Patron`;
    
    const error = errorMappings[response.textcode] || 
      $localize`Unable to retrieve patron with barcode "${barcode}". Error: ${response.desc || response.textcode}`;
    
    return { error, errorTitle };
  }

  private extractBarcodesFromFile(fileContent: string): string[] {
    const barcodes = fileContent
      .split(/[\r\n]+/)
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    if (barcodes.length === 0) {
      throw new Error($localize`No barcodes found in the uploaded file.`);
    }
    
    return barcodes;
  }

  private async processSingleBarcode(bucketId: number, barcode: string, results: any): Promise<void> {
    try {
      const response = await lastValueFrom(
        this.net.request(
          'open-ils.actor',
          'open-ils.actor.user.fleshed.retrieve_by_barcode',
          this.auth.token(),
          barcode
        )
      );
      
      if (this.isApiError(response)) {
        results.errors++;
        return;
      }
      
      if (!response?.id()) {
        results.errors++;
        return;
      }
      
      const existingItems = await this.checkPatronInBucket(bucketId, response.id());
      if (existingItems.length > 0) {
        results.duplicates++;
        return;
      }
      
      const addResult = await this.addPatronsToPatronBucket(bucketId, [response.id()]);
      if (addResult.added > 0) {
        results.added++;
      } else {
        results.errors++;
      }
    } catch (error) {
      console.error(`Error processing barcode ${barcode}:`, error);
      results.errors++;
    }
  }

  private validateBatchEditParams(bucketId: number, editParams: any): void {
    if (!bucketId) throw new Error('Bucket ID is required');
    if (!editParams?.name) throw new Error('Edit name is required');
    
    const editableParams = { ...editParams };
    delete editableParams.name;
    
    if (Object.keys(editableParams).length === 0) {
      throw new Error('No edit parameters specified');
    }
  }

  private validateRollbackParams(bucketId: number, fieldsetGroupId: number): void {
    if (!bucketId) throw new Error('Bucket ID is required');
    if (!fieldsetGroupId) throw new Error('Fieldset group ID is required');
  }

  private handleBatchProgress(progress: any, progressCallback?: (progress: any) => void): void {
    if (!progressCallback) return;
    
    const stageLabels = {
      'CONTAINER_BATCH_UPDATE_PERM_CHECK': $localize`Checking permissions`,
      'CONTAINER_PERM_CHECK': $localize`Verifying bucket access`,
      'ITEM_PERM_CHECK': $localize`Checking item permissions`,
      'FIELDSET_GROUP_CREATE': $localize`Creating edit group`,
      'FIELDSET_CREATE': $localize`Preparing edit fields`,
      'FIELDSET_EDITS_CREATE': $localize`Creating edit changes`,
      'CONSTRUCT_QUERY': $localize`Building update query`,
      'APPLY_EDITS': $localize`Applying changes`,
      'COMPLETE': $localize`Complete`
    };
    
    progress.label = stageLabels[progress.stage] || progress.stage;
    progress.max = progress.max || 1;
    progress.count = progress.count || 1;
    
    progressCallback(progress);
  }

  private handleRollbackProgress(progress: any, progressCallback?: (progress: any) => void): void {
    if (!progressCallback) return;
    
    const stageLabels = {
      'CONTAINER_BATCH_UPDATE_PERM_CHECK': $localize`Checking permissions`,
      'CONTAINER_PERM_CHECK': $localize`Verifying bucket access`,
      'ITEM_PERM_CHECK': $localize`Checking item permissions`,
      'ROLLBACK_PREPARE': $localize`Preparing rollback`,
      'ROLLBACK_APPLY': $localize`Applying rollback changes`,
      'COMPLETE': $localize`Complete`
    };
    
    progress.label = stageLabels[progress.stage] || progress.stage;
    progress.max = progress.max || 1;
    progress.count = progress.count || 1;
    
    progressCallback(progress);
  }

  private mapBatchResult(progress: any): any {
    if (progress.stage === 'COMPLETE') {
      return { success: true };
    }
    
    if (progress.error) {
      return { success: false, error: progress.error };
    }
    
    return null;
  }
}