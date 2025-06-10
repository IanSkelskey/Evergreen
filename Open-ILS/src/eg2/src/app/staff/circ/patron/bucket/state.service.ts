import {Injectable} from '@angular/core';
import {BehaviorSubject, lastValueFrom} from 'rxjs';
import {AuthService} from '@eg/core/auth.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {Pager} from '@eg/share/util/pager';
import {BucketService} from '@eg/staff/share/buckets/bucket.service';

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
        private pcrud: PcrudService,
        private bucketSvc: BucketService
    ) {
        this.userId = this.auth.user().id();
        this.initViews();
        // Immediately update counts after initializing views
        this.updateCounts();
    }
    
    // Helper methods for properties
    get currentView(): string {
        return this.currentViewSubject.getValue();
    }
    
    setCurrentView(view: string): void {
        this.currentViewSubject.next(view);
    }
    
    get bucketIdToRetrieve(): number {
        return this.bucketIdToRetrieveSubject.getValue();
    }
    
    setBucketIdToRetrieve(id: number): void {
        this.bucketIdToRetrieveSubject.next(id);
    }
    
    getViews(): {[name: string]: BucketView} {
        return this.views;
    }
    
    getView(name: string): BucketView {
        return this.views[name];
    }
    
    isCurrentView(view: string): boolean {
        return this.currentView === view;
    }
    
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
    
    setCountInProgress(inProgress: boolean): void {
        this.countInProgressSubject.next(inProgress);
    }
    
    // Get shared buckets
    getSharedBuckets(): Promise<any[]> {
        return this.pcrud.search('cub', 
            {pub: true}, // Get buckets where public=true
            {
                flesh: 1,
                flesh_fields: {
                    cub: ['owner']
                },
                order_by: [{class: 'cub', field: 'create_time', direction: 'desc'}]
            }
        ).toPromise();
    }
    
    // Update counts for all views
    async updateCounts(): Promise<void> {
        this.setCountInProgress(true);
        
        // Create a list of views to update, including normal views and invisible ones
        const viewsToUpdate = [...this.getViewKeys()];
        
        // Make sure special views are included even if they have null labels
        const specialViews = ['shared_with_others', 'shared_with_user', 'retrieved_by_id'];
        specialViews.forEach(view => {
            if (!viewsToUpdate.includes(view) && this.views[view]) {
                viewsToUpdate.push(view);
            }
        });
        
        const promises = viewsToUpdate.map(viewKey => 
            this.views[viewKey].bucketIdQuery(null, null, true)
                .then(result => {
                    this.views[viewKey].count = result.count;
                })
                .catch(error => {
                    console.error(`Error getting count for view ${viewKey}:`, error);
                    this.views[viewKey].count = 0;
                })
        );

        await Promise.all(promises);
        this.setCountInProgress(false);
    }
    
    // Helper methods for query operations
    
    // Create query options for pagination and sorting
    private createQueryOptions(pager: Pager, sort: GridColumnSort[], justCount: boolean): any {
        if (justCount) return {};
        
        let options: any = {};
        
        if (pager) {
            options.limit = pager.limit;
            options.offset = pager.offset;
        }
        
        if (sort && sort.length) {
            options.order_by = {
                cub: sort.map(s => ({
                    field: s.name,
                    direction: s.dir.toUpperCase()
                }))
            };
        }
        
        return options;
    }
    
    // Extract IDs from query results
    private extractIdsFromResult(result: any): number[] {
        if (!result) return [];
        
        if (Array.isArray(result)) {
            return result.map(bucket => bucket.id());
        }
        
        if (typeof result === 'object' && typeof result.id === 'function') {
            return [result.id()];
        }
        
        if (typeof result === 'number') {
            return [result];
        }
        
        return [];
    }
    
    // Calculate count from result
    private calculateCount(result: any): number {
        if (!result) return 0;
        
        if (Array.isArray(result)) {
            return result.length;
        }
        
        return (result !== null && result !== undefined) ? 1 : 0;
    }
    
    // Perform bucket search with error handling
    private async performBucketSearch(
        search: any, 
        options: any = {}, 
        justCount: boolean = false,
        viewName: string = 'unknown'
    ): Promise<BucketQueryResult> {
        try {
            // For count queries, we don't need flesh or extra options
            const queryOptions = justCount ? {} : {
                ...options,
                flesh: 1,
                flesh_fields: {cub: ['owner']}
            };
            
            const result = await lastValueFrom(
                this.pcrud.search('cub', search, queryOptions, {atomic: true})
            );
            
            const count = this.calculateCount(result);
            
            // For count queries, we just return the count
            if (justCount) {
                if (this.views[viewName]) {
                    this.views[viewName].count = count;
                }
                return { bucketIds: [], count };
            }
            
            // For regular queries, extract IDs and return
            const bucketIds = this.extractIdsFromResult(result);
            
            if (this.views[viewName]) {
                this.views[viewName].count = bucketIds.length;
            }
            
            return { bucketIds, count: bucketIds.length };
        } catch (error) {
            console.error(`Error in ${viewName} bucket search:`, error);
            
            if (this.views[viewName]) {
                this.views[viewName].count = 0;
            }
            
            return { bucketIds: [], count: 0 };
        }
    }
    
    // Initialize view definitions
    private initViews(): void {
        this.views = {
            all: {
                label: $localize`Visible to me`,
                sort_key: 10,
                count: null,
                bucketIdQuery: async (pager, sort, justCount) => {
                    console.debug('All buckets query - justCount:', justCount);
                    
                    const options = this.createQueryOptions(pager, sort, justCount);
                    const search = { id: { '!=' : null } };
                    
                    return this.performBucketSearch(search, options, justCount, 'all');
                }
            },
            user: {
                label: $localize`My Buckets`,
                sort_key: 1,
                count: null,
                bucketIdQuery: async (pager, sort, justCount) => {
                    const currentUserId = this.userId || this.auth.user().id();
                    console.debug('User bucket query - justCount:', justCount, 'userId:', currentUserId);
                    
                    const options = this.createQueryOptions(pager, sort, justCount);
                    const search = { owner: currentUserId };
                    
                    // Optional: Get all bucket types for debugging
                    try {
                        const allBucketTypes = await lastValueFrom(
                            this.pcrud.search('cub', 
                                {owner: currentUserId}, 
                                {distinct: 'btype'}, 
                                {atomic: true}
                            )
                        );
                        console.debug('All available bucket types in the system:', allBucketTypes);
                    } catch (err) {
                        console.warn('Error fetching distinct bucket types:', err);
                    }
                    
                    return this.performBucketSearch(search, options, justCount, 'user');
                }
            },
            favorites: {
                label: $localize`Favorites`,
                sort_key: 2,
                count: null,
                bucketIdQuery: async (pager, sort, justCount) => {
                    const favoriteIds = this.bucketSvc.getFavoriteBucketIds('user');
                    console.debug('Favorite bucket IDs:', favoriteIds);
                    
                    if (!favoriteIds.length) {
                        return { bucketIds: [], count: 0 };
                    }
                    
                    const options = this.createQueryOptions(pager, sort, justCount);
                    const search = { id: favoriteIds };
                    
                    return this.performBucketSearch(search, options, justCount, 'favorites');
                }
            },
            recent: {
                label: $localize`Recent`,
                sort_key: 3,
                count: null,
                bucketIdQuery: async (pager, sort, justCount) => {
                    console.debug('Recent buckets query - justCount:', justCount);
                    
                    const recentBucketIds = this.bucketSvc.getRecentBuckets('user');
                    
                    if (!recentBucketIds.length) {
                        return { bucketIds: [], count: 0 };
                    }
                    
                    const options = this.createQueryOptions(pager, sort, justCount);
                    const search = { id: recentBucketIds };
                    
                    return this.performBucketSearch(search, options, justCount, 'recent');
                }
            },
            shared_with_others: {
                label: $localize`Shared with others`,
                sort_key: 4,
                count: null,
                bucketIdQuery: async (pager, sort, justCount) => {
                    console.debug('Shared with others query - justCount:', justCount);
                    
                    const options = this.createQueryOptions(pager, sort, justCount);
                    const currentUserId = this.auth.user().id();
                    const search = { 
                        owner: currentUserId,
                        pub: 't'
                    };
                    
                    return this.performBucketSearch(search, options, justCount, 'shared_with_others');
                }
            },
            shared_with_user: {
                label: $localize`Shared with me`,
                sort_key: 5,
                count: null,
                bucketIdQuery: async (pager, sort, justCount) => {
                    console.debug('Shared with me query - justCount:', justCount);
                    
                    const options = this.createQueryOptions(pager, sort, justCount);
                    const currentUserId = this.auth.user().id();
                    const search = { 
                        owner: {'!=': currentUserId},
                        pub: 't'
                    };
                    
                    return this.performBucketSearch(search, options, justCount, 'shared_with_user');
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
                    return { bucketIds, count: bucketIds.length };
                }
            }
        };
    }
}
