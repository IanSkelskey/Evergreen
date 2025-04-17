import {Injectable} from '@angular/core';
import {Observable, Subject, of} from 'rxjs';
import {AuthService} from '@eg/core/auth.service';
import {NetService} from '@eg/core/net.service';
import {IdlObject} from '@eg/core/idl.service';

export interface UpdateProgress {
  stage: string;
  count: number;
  max: number;
  label?: string;
  error?: string;
  ord?: number;
}

@Injectable({
  providedIn: 'root'
})
export class PatronBucketUpdateService {
  constructor(
    private auth: AuthService,
    private net: NetService
  ) {}
  
  // Update all users in a bucket with the given fields
  batchUpdateUsers(bucketId: number, name: string, fields: any): Observable<UpdateProgress> {
    const progress$ = new Subject<UpdateProgress>();
    
    this.net.request(
      'open-ils.actor',
      'open-ils.actor.container.user.batch_edit',
      this.auth.token(), bucketId, name, fields
    ).subscribe({
      next: (response: any) => {
        if (response.error) {
          progress$.next({
            stage: 'ERROR',
            count: 0,
            max: 0,
            error: response.error
          });
        } else if (response.stage === 'COMPLETE') {
          progress$.next({
            stage: 'COMPLETE',
            count: response.count || 0,
            max: response.count || 0
          });
          progress$.complete();
        } else {
          progress$.next({
            stage: response.stage,
            count: response.count || 0,
            max: response.max || 1,
            label: response.label || response.stage,
            ord: response.ord
          });
        }
      },
      error: (err) => {
        progress$.error(err);
      }
    });
    
    return progress$.asObservable();
  }
  
  // Delete all users in a bucket
  batchDeleteUsers(bucketId: number, name: string): Observable<UpdateProgress> {
    const progress$ = new Subject<UpdateProgress>();
    
    this.net.request(
      'open-ils.actor',
      'open-ils.actor.container.user.batch_delete',
      this.auth.token(), bucketId, name, { deleted: 't' }
    ).subscribe({
      next: (response: any) => {
        if (response.error) {
          progress$.next({
            stage: 'ERROR',
            count: 0,
            max: 0,
            error: response.error
          });
        } else if (response.stage === 'COMPLETE') {
          progress$.next({
            stage: 'COMPLETE',
            count: response.count || 0,
            max: response.count || 0
          });
          progress$.complete();
        } else {
          progress$.next({
            stage: response.stage,
            count: response.count || 0,
            max: response.max || 1,
            label: response.label || response.stage,
            ord: response.ord
          });
        }
      },
      error: (err) => {
        progress$.error(err);
      }
    });
    
    return progress$.asObservable();
  }
  
  // Apply statcat changes to users in a bucket
  applyStatCats(bucketId: number, changes: any): Observable<UpdateProgress> {
    const progress$ = new Subject<UpdateProgress>();
    
    this.net.request(
      'open-ils.actor',
      'open-ils.actor.container.user.batch_statcat_apply',
      this.auth.token(), bucketId, changes
    ).subscribe({
      next: (response: any) => {
        if (response.error) {
          progress$.next({
            stage: 'ERROR',
            count: 0,
            max: 0,
            error: response.error
          });
        } else if (response.stage === 'COMPLETE') {
          progress$.next({
            stage: 'COMPLETE',
            count: response.count || 0,
            max: response.count || 0
          });
          progress$.complete();
        } else {
          progress$.next({
            stage: response.stage,
            count: response.count || 0,
            max: response.max || 1,
            label: response.label || response.stage,
            ord: response.ord
          });
        }
      },
      error: (err) => {
        progress$.error(err);
      }
    });
    
    return progress$.asObservable();
  }
  
  // Apply rollback to users in a bucket
  applyRollback(bucketId: number, rollbackGroupId: number): Observable<UpdateProgress> {
    const progress$ = new Subject<UpdateProgress>();
    
    this.net.request(
      'open-ils.actor',
      'open-ils.actor.container.user.apply_rollback',
      this.auth.token(), bucketId, rollbackGroupId
    ).subscribe({
      next: (response: any) => {
        if (response.error) {
          progress$.next({
            stage: 'ERROR',
            count: 0,
            max: 0,
            error: response.error
          });
        } else if (response.stage === 'COMPLETE') {
          progress$.next({
            stage: 'COMPLETE',
            count: response.count || 0,
            max: response.count || 0
          });
          progress$.complete();
        } else {
          progress$.next({
            stage: response.stage,
            count: response.count || 0,
            max: response.max || 1,
            label: response.label || response.stage,
            ord: response.ord
          });
        }
      },
      error: (err) => {
        progress$.error(err);
      }
    });
    
    return progress$.asObservable();
  }
  
  // Get changesets for a bucket
  getChangesets(bucketId: number): Observable<IdlObject[]> {
    return this.net.request(
      'open-ils.actor',
      'open-ils.actor.container.user.retrieve_changesets',
      this.auth.token(), bucketId
    );
  }
}
