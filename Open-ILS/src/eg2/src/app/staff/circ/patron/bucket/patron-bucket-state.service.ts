import {Injectable} from '@angular/core';
import {BehaviorSubject, Observable, lastValueFrom, of} from 'rxjs';
import {AuthService} from '@eg/core/auth.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {Pager} from '@eg/share/util/pager';

export interface GridColumnSort {
    name: string;
    dir: string;
}

export interface BucketQueryResult {
    bucketIds: number[];
    count: number;
}

export interface BucketView {
    label: string | null;
    sort_key: number | null;
    count: number | null;
    bucketIdQuery: (pager: Pager, sort: GridColumnSort[], justCount: boolean) => Promise<BucketQueryResult>;
}

@Injectable({
    providedIn: 'root'
})
export class PatronBucketStateService {
    // View definitions
    private views: {[name: string]: BucketView} = {};
    
    // Current view state
    private currentViewSubject = new BehaviorSubject<string>('user');
    currentView$ = this.currentViewSubject.asObservable();
    
    // Bucket ID to retrieve
    private bucketIdToRetrieveSubject = new BehaviorSubject<number>(null);
    bucketIdToRetrieve$ = this.bucketIdToRetrieveSubject.asObservable();
    
    // Count in progress flag
    private countInProgressSubject = new BehaviorSubject<boolean>(false);
    countInProgress$ = this.countInProgressSubject.asObservable();
    
    // Track user ID for queries
    private userId: number;
    
    constructor(
        private auth: AuthService,
        private pcrud: PcrudService
    ) {
        this.userId = this.auth.user().id();
        this.initViews();
    }
    
    // Get the current view
    get currentView(): string {
        return this.currentViewSubject.getValue();
    }
    
    // Set the current view
    setCurrentView(view: string): void {
        this.currentViewSubject.next(view);
    }
    
    // Get bucket ID to retrieve
    get bucketIdToRetrieve(): number {
        return this.bucketIdToRetrieveSubject.getValue();
    }
    
    // Set bucket ID to retrieve
    setBucketIdToRetrieve(id: number): void {
        this.bucketIdToRetrieveSubject.next(id);
    }
    
    // Get all views
    getViews(): {[name: string]: BucketView} {
        return this.views;
    }
    
    // Get a specific view
    getView(name: string): BucketView {
        return this.views[name];
    }
    
    // Check if a view is the current view
    isCurrentView(view: string): boolean {
        return this.currentView === view;
    }
    
    // Get view keys sorted by sort_key
    getViewKeys(): string[] {
        return Object.keys(this.views)
            .filter(key => this.views[key].label !== null)
            .sort((a, b) => {
                const sortA = this.views[a].sort_key;
                const sortB = this.views[b].sort_key;
                if (sortA === null || sortB === null) {
                    return 0;
                }
                return sortA - sortB;
            });
    }
    
    // Set counting in progress state
    setCountInProgress(inProgress: boolean): void {
        this.countInProgressSubject.next(inProgress);
    }
    
    // Update counts for all views
    async updateCounts(): Promise<void> {
        this.setCountInProgress(true);
        
        const promises = this.getViewKeys().map(viewKey => {
            return this.views[viewKey].bucketIdQuery(null, null, true)
                .then(result => {
                    this.views[viewKey].count = result.count;
                })
                .catch(error => {
                    console.error(`Error getting count for view ${viewKey}:`, error);
                    this.views[viewKey].count = 0;
                });
        });

        await Promise.all(promises);
        this.setCountInProgress(false);
    }
    
    // Initialize view definitions
    private initViews(): void {
        this.views = {
            user: {
                label: $localize`My Buckets`,
                sort_key: 1,
                count: -1,
                bucketIdQuery: async (pager, sort, justCount) => {
                    try {
                        console.debug('User bucket query - justCount:', justCount, 'userId:', this.userId || this.auth.user().id());
                        
                        let options: any = {};
                        if (pager && !justCount) {
                            options.limit = pager.limit;
                            options.offset = pager.offset;
                        }
                        if (sort && sort.length && !justCount) {
                            options.order_by = {
                                cub: sort.map(s => ({
                                    field: s.name,
                                    direction: s.dir.toUpperCase()
                                }))
                            };
                        }
                        
                        // Make sure we have the correct search parameters
                        const search = { 
                            owner: this.userId || this.auth.user().id(), 
                            btype: 'staff_client' 
                        };
                        
                        console.debug('Bucket search criteria:', search, 'options:', options);
                        
                        if (justCount) {
                            // Count query - direct approach rather than using count:true which may be unreliable
                            const idList = await lastValueFrom(this.pcrud.search('cub', search, {}, {idlist: true}));
                            console.debug('Count via ID list:', idList);
                            
                            // Convert result to array for counting
                            let ids = [];
                            if (idList !== null) {
                                if (typeof idList === 'number') {
                                    ids = [idList]; // Single ID
                                } else if (Array.isArray(idList)) {
                                    ids = idList; // Already an array
                                }
                            }
                            
                            const finalCount = ids.length;
                            console.debug('Final count:', finalCount);
                            this.views.user.count = finalCount;
                            return { bucketIds: [], count: finalCount };
                        } else {
                            // ID list query - get the actual bucket IDs
                            const idResults = await lastValueFrom(this.pcrud.search('cub', search, options, {idlist: true}));
                            console.debug('Raw bucket IDs:', idResults);
                            
                            // Handle different return types - ensure we have an array
                            let ids = [];
                            if (idResults !== null) {
                                if (typeof idResults === 'number') {
                                    ids = [idResults]; // Single ID
                                } else if (Array.isArray(idResults)) {
                                    ids = idResults; // Already an array
                                }
                            }
                            
                            console.debug('Normalized bucket IDs:', ids, 'count:', ids.length);
                            
                            // Update the view count with the actual number of IDs
                            this.views.user.count = ids.length;
                            
                            return { bucketIds: ids, count: ids.length };
                        }
                    } catch (error) {
                        console.error('Error in user bucketIdQuery:', error);
                        this.views.user.count = 0;
                        return { bucketIds: [], count: 0 };
                    }
                }
            },
            retrieved_by_id: {
                label: null,
                sort_key: null,
                count: null,
                bucketIdQuery: async (pager, sort, justCount) => {
                    const id = this.bucketIdToRetrieve;
                    if (!id) {
                        return { bucketIds: [], count: 0 };
                    }
                    
                    const bucketIds = [id];
                    return { bucketIds: bucketIds, count: bucketIds.length };
                }
            }
        };
    }
}
