import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { IdlObject } from '@eg/core/idl.service';
import { NetService } from '@eg/core/net.service';
import { PcrudService } from '@eg/core/pcrud.service';
import { AuthService } from '@eg/core/auth.service';

@Injectable({
  providedIn: 'root'
})
export class PatronBucketService {
  private recentPatronBucketIds_: number[] = [];
  private patronBucketsRefreshRequested = new Subject<void>();
  patronBucketsRefreshRequested$ = this.patronBucketsRefreshRequested.asObservable();

  constructor(
    private net: NetService,
    private pcrud: PcrudService,
    private auth: AuthService
  ) {
    // Try to load recent bucket IDs from localStorage
    const recentBuckets = localStorage.getItem('eg.circ.patron.bucket.recent');
    if (recentBuckets) {
      try {
        this.recentPatronBucketIds_ = JSON.parse(recentBuckets);
      } catch (e) {
        console.error('Error parsing recent patron buckets from localStorage:', e);
      }
    }
  }

  requestPatronBucketsRefresh(): void {
    this.patronBucketsRefreshRequested.next();
  }

  recentPatronBucketIds(): number[] {
    return this.recentPatronBucketIds_;
  }

  // Log a bucket ID to the recent buckets list and update localStorage
  logPatronBucket(bucketId: number): void {
    if (!bucketId || isNaN(bucketId)) return;
    
    // Remove the ID if it already exists and push it to the top
    const idx = this.recentPatronBucketIds_.indexOf(bucketId);
    if (idx > -1) {
      this.recentPatronBucketIds_.splice(idx, 1);
    }
    
    // Add to beginning of array
    this.recentPatronBucketIds_.unshift(bucketId);
    
    // Keep only the 10 most recent buckets
    if (this.recentPatronBucketIds_.length > 10) {
      this.recentPatronBucketIds_.length = 10;
    }
    
    localStorage.setItem('eg.circ.patron.bucket.recent', 
      JSON.stringify(this.recentPatronBucketIds_));
  }
  
  // Retrieve patron buckets by their IDs
  async retrievePatronBuckets(bucketIds: number[]): Promise<any[]> {
    if (!bucketIds || bucketIds.length === 0) {
      return [];
    }
    
    try {
      const buckets = await this.pcrud.search('cub', 
        { id: bucketIds },
        {
          flesh: 1,
          flesh_fields: { cub: ['owner', 'owning_lib'] }
        }
      ).toPromise();
      
      // Format the results for the grid display
      return Array.isArray(buckets) ? buckets.map(bucket => ({
        bucket: bucket,
        id: bucket.id(),
        name: bucket.name(),
        description: bucket.description(),
        owner: bucket.owner(),
        'owner.usrname': bucket.owner().usrname(),
        owning_lib: bucket.owning_lib(),
        'owning_lib.shortname': bucket.owning_lib().shortname(),
        btype: bucket.btype(),
        create_time: bucket.create_time()
      })) : [];
    } catch (error) {
      console.error('Error retrieving patron buckets:', error);
      return [];
    }
  }
}
