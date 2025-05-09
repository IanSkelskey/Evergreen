import { Injectable } from '@angular/core';
import { Subject, lastValueFrom } from 'rxjs';
import { PcrudService } from '@eg/core/pcrud.service';
import { IdlObject } from '@eg/core/idl.service';
import { BucketService } from '@eg/staff/share/buckets/bucket.service';

/**
 * Service for managing patron buckets (collections of patrons)
 * Extends the core bucket functionality with patron-specific features
 */
@Injectable({
  providedIn: 'root'
})
export class PatronBucketService {
  /**
   * Maximum number of recent buckets to track in local storage
   */
  maxRecentPatronBuckets = 10;
    
  private patronBucketsRefreshRequested = new Subject<void>();
  patronBucketsRefreshRequested$ = this.patronBucketsRefreshRequested.asObservable();
    
  constructor(
    private pcrud: PcrudService,
    private bucketService: BucketService
  ) {}
  
  /**
   * Notify subscribers that patron buckets should be refreshed
   */
  requestPatronBucketsRefresh(): void {
    this.patronBucketsRefreshRequested.next();
    // Also notify the shared bucket service
    this.bucketService.requestBucketsRefresh('user');
  }
    
  /**
   * Records recently accessed buckets in local storage
   * @param bucketId The ID of the bucket to log
   */
  logPatronBucket(bucketId: number): void {
    // Delegate to shared bucket service
    this.bucketService.logBucket('user', bucketId);
  }
    
  /**
   * Get the list of recently accessed bucket IDs
   * @returns Array of recent bucket IDs
   */
  recentPatronBucketIds(): number[] {
    // Delegate to shared bucket service
    return this.bucketService.getRecentBuckets('user');
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
    // Delegate to shared bucket service
    return this.bucketService.checkBucketAccess('user', bucket, requiresWrite);
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
    bucketType: string = 'staff_client', 
    isPublic: boolean = false
  ): Promise<{id: number, name: string}> {
    try {
      const result = await lastValueFrom(
        this.bucketService.createBucket('user', name, description, bucketType, isPublic)
      );
      
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
      return await lastValueFrom(this.bucketService.retrieveBucketById('user', bucketId));
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
    // Delegate to shared bucket service
    return this.bucketService.transformBucketsForGrid('user', buckets);
  }
    
  /**
   * Update an existing bucket
   * @param bucket The bucket object to update
   * @returns Promise resolving to success object with ID
   */
  async updateBucket(bucket: IdlObject): Promise<any> {
    try {
      await lastValueFrom(this.bucketService.updateBucket('user', bucket));
      return {
        success: true,
        id: bucket.id()
      };
    } catch (error) {
      throw new Error(`Error updating bucket: ${error.message || error}`);
    }
  }
    
  /**
   * Delete a bucket
   * @param bucketId The ID of the bucket to delete
   * @returns Promise resolving to success object with optional error message
   */
  async deleteBucket(bucketId: number): Promise<{success: boolean, message?: string}> {
    try {
      await lastValueFrom(this.bucketService.deleteBucket('user', bucketId));
      return {success: true};
    } catch (error) {
      return {success: false, message: error.message || 'Unknown error'};
    }
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
        cubi: ['target_user'],
        au: ['card']
      }
    };
    
    try {
      // Use atomic to get all items at once
      const items = await lastValueFrom(
        this.pcrud.search('cubi', query, options, {atomic: true})
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
      firstName = this.safeGetProperty(user, 'first_given_name', '');
      lastName = this.safeGetProperty(user, 'family_name', '');
      
      if (user.card && user.card() && typeof user.card().barcode === 'function') {
        barcode = user.card().barcode();
      }
    } catch (e) {
      // Keep default empty values
    }
    
    return { firstName, lastName, barcode };
  }
  
  /**
   * Safely get a property value from an IDL object
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
   * Add patrons to a patron bucket
   * @param bucketId The bucket to add to
   * @param patronIds Array of patron IDs to add
   * @returns Result object with counts and IDs
   */
  async addPatronsToPatronBucket(bucketId: number, patronIds: number[]): Promise<any> {
    // Delegate to shared bucket service
    return this.bucketService.addItemsToBucket('user', bucketId, patronIds, true);
  }
    
  /**
   * Remove patrons from a bucket
   * @param bucketId The bucket ID to remove from
   * @param itemIds Array of bucket item IDs to remove
   * @returns Result object with counts and detailed results
   */
  async removePatronsFromPatronBucket(itemIds: number[]): Promise<any> {
    // Delegate to shared bucket service
    return this.bucketService.removeItemsFromBucket('user', itemIds);
  }

  /**
   * Check if a patron is already in a bucket
   * @param bucketId The bucket ID to check
   * @param patronId The patron ID to check
   * @returns Array of matching bucket items if found
   */
  async checkPatronInBucket(bucketId: number, patronId: number): Promise<any[]> {
    try {
      // Use the shared bucket service to check for duplicates
      const existingItems = await this.bucketService.checkItemsInBucket('user', bucketId, [patronId]);
      return existingItems.has(patronId) ? [true] : [];
    } catch (error) {
      console.error('Error checking if patron is in bucket:', error);
      return [];
    }
  }
}
