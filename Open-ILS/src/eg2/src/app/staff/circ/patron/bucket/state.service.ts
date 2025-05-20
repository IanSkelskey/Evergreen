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
        
        // Create a list of views to update, including normal views and invisible ones
        const viewsToUpdate = [...this.getViewKeys()];
        
        // Make sure 'shared_with_others', 'shared_with_user', etc. are included even if they have null labels
        const specialViews = ['shared_with_others', 'shared_with_user', 'retrieved_by_id'];
        specialViews.forEach(view => {
            if (!viewsToUpdate.includes(view) && this.views[view]) {
                viewsToUpdate.push(view);
            }
        });
        
        const promises = viewsToUpdate.map(viewKey => {
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
            all: {
                label: $localize`Visible to me`,
                sort_key: 10,
                count: null,
                bucketIdQuery: async (pager, sort, justCount) => {
                    try {
                        console.debug('All buckets query - justCount:', justCount);
                        
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
                        
                        // No filters - we want all visible buckets
                        const search: any = { 
                            id: { '!=' : null }
                        };
                        
                        if (justCount) {
                            try {
                                // Count all visible buckets
                                const result = await lastValueFrom(
                                    this.pcrud.search('cub', 
                                        search, 
                                        {}, 
                                        {atomic: true}
                                    )
                                );
                                
                                // Calculate proper count
                                const finalCount = Array.isArray(result) ? result.length : 
                                    (result !== null && result !== undefined) ? 1 : 0;
                                
                                console.debug('All buckets count calculation:', finalCount);
                                this.views.all.count = finalCount;
                                
                                return { bucketIds: [], count: finalCount };
                            } catch (error) {
                                console.error('Error in all buckets count query:', error);
                                return { bucketIds: [], count: 0 };
                            }
                        } else {
                            // Get all buckets with owner info
                            const allBuckets = await lastValueFrom(
                                this.pcrud.search('cub', 
                                    search, 
                                    {
                                        ...options,
                                        flesh: 1,
                                        flesh_fields: {cub: ['owner']}
                                    }, 
                                    {atomic: true}
                                )
                            );
                            
                            // Extract IDs from the records
                            let ids = [];
                            if (Array.isArray(allBuckets)) {
                                ids = allBuckets.map(bucket => bucket.id());
                            } else if (allBuckets !== null && allBuckets !== undefined) {
                                if (typeof allBuckets === 'object' && typeof allBuckets.id === 'function') {
                                    ids = [allBuckets.id()];
                                } else if (typeof allBuckets === 'number') {
                                    ids = [allBuckets];
                                }
                            }
                            
                            console.debug('Extracted all bucket IDs:', ids, 'count:', ids.length);
                            this.views.all.count = ids.length;
                            
                            return { bucketIds: ids, count: ids.length };
                        }
                    } catch (error) {
                        console.error('Error in all buckets bucketIdQuery:', error);
                        this.views.all.count = 0;
                        return { bucketIds: [], count: 0 };
                    }
                }
            },
            user: {
                label: $localize`My Buckets`,
                sort_key: 1,
                count: null,
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
                        
                        // Include ALL bucket types and check for deleted flag
                        const currentUserId = this.userId || this.auth.user().id();
                        console.debug('Current user ID for bucket query:', currentUserId);
                        
                        const search: any = { 
                            owner: currentUserId
                        };
                        
                        // Explicitly search for different bucket types
                        // search.btype = {in: ['staff_client', 'vandelay_queue', 'hold_subscription', null]};
                        
                        // Also check if there's a deleted flag that needs to be filtered
                        // search.deleted = 'f';
                        
                        console.debug('Bucket search criteria:', search, 'options:', options);
                        
                        // First, let's try to get all available bucket types in the system
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
                        
                        if (justCount) {
                            // Count query - direct approach rather than using count:true
                            try {
                                // Try a direct SQL query for debugging
                                // Fetch all buckets and count them
                                const allBuckets = await lastValueFrom(
                                    this.pcrud.search('cub', 
                                        {owner: currentUserId}, 
                                        {}, 
                                        {atomic: true}
                                    )
                                );
                                console.debug('All buckets (full data):', allBuckets);
                                
                                // Calculate proper count
                                const finalCount = Array.isArray(allBuckets) ? allBuckets.length : 
                                    (allBuckets !== null && allBuckets !== undefined) ? 1 : 0;
                                
                                console.debug('Final count calculation:', finalCount);
                                this.views.user.count = finalCount;
                                
                                return { bucketIds: [], count: finalCount };
                            } catch (error) {
                                console.error('Error in count query:', error);
                                return { bucketIds: [], count: 0 };
                            }
                        } else {
                            // Get all buckets for this user - try with no filters first to see what's available
                            try {
                                // Get full records with flesh to ensure we have owner information
                                const allBuckets = await lastValueFrom(
                                    this.pcrud.search('cub', 
                                        {owner: currentUserId}, 
                                        {
                                            ...options,
                                            flesh: 1,
                                            flesh_fields: {cub: ['owner']}
                                        }, 
                                        {atomic: true}
                                    )
                                );
                                console.debug('All buckets (full data):', allBuckets);
                                
                                // Extract IDs from the records
                                let ids = [];
                                if (Array.isArray(allBuckets)) {
                                    ids = allBuckets.map(bucket => bucket.id());
                                } else if (allBuckets !== null && allBuckets !== undefined) {
                                    if (typeof allBuckets === 'object' && typeof allBuckets.id === 'function') {
                                        ids = [allBuckets.id()];
                                    } else if (typeof allBuckets === 'number') {
                                        ids = [allBuckets];
                                    }
                                }
                                
                                console.debug('Extracted bucket IDs:', ids, 'count:', ids.length);
                                this.views.user.count = ids.length;
                                
                                return { bucketIds: ids, count: ids.length };
                            } catch (error) {
                                console.error('Error fetching buckets:', error);
                                return { bucketIds: [], count: 0 };
                            }
                        }
                    } catch (error) {
                        console.error('Error in user bucketIdQuery:', error);
                        this.views.user.count = 0;
                        return { bucketIds: [], count: 0 };
                    }
                }
            },
            favorites: {
                label: $localize`Favorites`,
                sort_key: 2,
                count: null,
                bucketIdQuery: async (pager, sort, justCount) => {
                    try {
                        const favoriteIds = this.bucketSvc.getFavoriteBucketIds('user');
                        console.debug('Favorite bucket IDs:', favoriteIds);
                        
                        if (!favoriteIds.length) {
                            return { bucketIds: [], count: 0 };
                        }
                        
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
                        
                        const search = { id: favoriteIds };
                        
                        if (justCount) {
                            try {
                                // Count query using pcrud.search with atomic:true
                                const allBuckets = await lastValueFrom(
                                    this.pcrud.search('cub', 
                                        search, 
                                        {}, 
                                        {atomic: true}
                                    )
                                );
                                
                                // Calculate proper count
                                const finalCount = Array.isArray(allBuckets) ? allBuckets.length : 
                                    (allBuckets !== null && allBuckets !== undefined) ? 1 : 0;
                                
                                console.debug('Favorites count calculation:', finalCount);
                                this.views.favorites.count = finalCount;
                                
                                return { bucketIds: [], count: finalCount };
                            } catch (error) {
                                console.error('Error in favorites count query:', error);
                                return { bucketIds: [], count: 0 };
                            }
                        } else {
                            try {
                                // Get all favorite buckets with owner info
                                const allBuckets = await lastValueFrom(
                                    this.pcrud.search('cub', 
                                        search, 
                                        {
                                            ...options,
                                            flesh: 1,
                                            flesh_fields: {cub: ['owner']}
                                        }, 
                                        {atomic: true}
                                    )
                                );
                                
                                // Extract IDs from the records
                                let ids = [];
                                if (Array.isArray(allBuckets)) {
                                    ids = allBuckets.map(bucket => bucket.id());
                                } else if (allBuckets !== null && allBuckets !== undefined) {
                                    if (typeof allBuckets === 'object' && typeof allBuckets.id === 'function') {
                                        ids = [allBuckets.id()];
                                    } else if (typeof allBuckets === 'number') {
                                        ids = [allBuckets];
                                    }
                                }
                                
                                console.debug('Extracted favorite bucket IDs:', ids, 'count:', ids.length);
                                this.views.favorites.count = ids.length;
                                
                                return { bucketIds: ids, count: ids.length };
                            } catch (error) {
                                console.error('Error fetching favorite buckets:', error);
                                return { bucketIds: [], count: 0 };
                            }
                        }
                    } catch (error) {
                        console.error('Error in favorites bucketIdQuery:', error);
                        this.views.favorites.count = 0;
                        return { bucketIds: [], count: 0 };
                    }
                }
            },
            recent: {
                label: $localize`Recent`,
                sort_key: 3,
                count: null,
                bucketIdQuery: async (pager, sort, justCount) => {
                    try {
                        console.debug('Recent buckets query - justCount:', justCount);
                        
                        // Get recent bucket IDs from bucket service
                        const recentBucketIds = this.bucketSvc.getRecentBuckets('user');
                        
                        if (!recentBucketIds.length) {
                            return { bucketIds: [], count: 0 };
                        }
                        
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
                        
                        const search = { id: recentBucketIds };
                        
                        if (justCount) {
                            try {
                                // Count recent buckets
                                const result = await lastValueFrom(
                                    this.pcrud.search('cub', 
                                        search, 
                                        {}, 
                                        {atomic: true}
                                    )
                                );
                                
                                // Calculate proper count
                                const finalCount = Array.isArray(result) ? result.length : 
                                    (result !== null && result !== undefined) ? 1 : 0;
                                
                                console.debug('Recent buckets count calculation:', finalCount);
                                this.views.recent.count = finalCount;
                                
                                return { bucketIds: [], count: finalCount };
                            } catch (error) {
                                console.error('Error in recent buckets count query:', error);
                                return { bucketIds: [], count: 0 };
                            }
                        } else {
                            try {
                                // Get all recent buckets with owner info
                                const allBuckets = await lastValueFrom(
                                    this.pcrud.search('cub', 
                                        search, 
                                        {
                                            ...options,
                                            flesh: 1,
                                            flesh_fields: {cub: ['owner']}
                                        }, 
                                        {atomic: true}
                                    )
                                );
                                
                                // Extract IDs from the records
                                let ids = [];
                                if (Array.isArray(allBuckets)) {
                                    ids = allBuckets.map(bucket => bucket.id());
                                } else if (allBuckets !== null && allBuckets !== undefined) {
                                    if (typeof allBuckets === 'object' && typeof allBuckets.id === 'function') {
                                        ids = [allBuckets.id()];
                                    } else if (typeof allBuckets === 'number') {
                                        ids = [allBuckets];
                                    }
                                }
                                
                                console.debug('Extracted recent bucket IDs:', ids, 'count:', ids.length);
                                this.views.recent.count = ids.length;
                                
                                return { bucketIds: ids, count: ids.length };
                            } catch (error) {
                                console.error('Error fetching recent buckets:', error);
                                return { bucketIds: [], count: 0 };
                            }
                        }
                    } catch (error) {
                        console.error('Error in recent bucketIdQuery:', error);
                        this.views.recent.count = 0;
                        return { bucketIds: [], count: 0 };
                    }
                }
            },
            shared_with_others: {
                label: $localize`Shared with others`,
                sort_key: 4,
                count: null,
                bucketIdQuery: async (pager, sort, justCount) => {
                    try {
                        console.debug('Shared with others query - justCount:', justCount);
                        
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
                        
                        const currentUserId = this.auth.user().id();
                        
                        // Query for patron buckets shared by the current user
                        const result = await lastValueFrom(
                            justCount 
                                ? this.pcrud.search('cub',
                                    {
                                        owner: currentUserId,
                                        pub: 't'
                                    },
                                    {},
                                    {atomic: true})
                                : this.pcrud.search('cub',
                                    {
                                        owner: currentUserId,
                                        pub: 't'
                                    },
                                    {
                                        ...options,
                                        flesh: 1,
                                        flesh_fields: {cub: ['owner']}
                                    },
                                    {atomic: true})
                        );
                        
                        if (justCount) {
                            // Calculate count
                            const finalCount = Array.isArray(result) ? result.length : 
                                (result !== null && result !== undefined) ? 1 : 0;
                            
                            console.debug('Shared with others count:', finalCount);
                            this.views.shared_with_others.count = finalCount;
                            
                            return { bucketIds: [], count: finalCount };
                        } else {
                            // Extract IDs
                            let ids = [];
                            if (Array.isArray(result)) {
                                ids = result.map(bucket => bucket.id());
                            } else if (result !== null && result !== undefined) {
                                if (typeof result === 'object' && typeof result.id === 'function') {
                                    ids = [result.id()];
                                } else if (typeof result === 'number') {
                                    ids = [result];
                                }
                            }
                            
                            console.debug('Shared with others bucket IDs:', ids, 'count:', ids.length);
                            this.views.shared_with_others.count = ids.length;
                            
                            return { bucketIds: ids, count: ids.length };
                        }
                    } catch (error) {
                        console.error('Error in shared_with_others query:', error);
                        this.views.shared_with_others.count = 0;
                        return { bucketIds: [], count: 0 };
                    }
                }
            },
            shared_with_user: {
                label: $localize`Shared with me`,
                sort_key: 5,
                count: null,
                bucketIdQuery: async (pager, sort, justCount) => {
                    try {
                        console.debug('Shared with me query - justCount:', justCount);
                        
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
                        
                        const currentUserId = this.auth.user().id();
                        
                        // Query for patron buckets shared with the current user (but not owned by them)
                        const result = await lastValueFrom(
                            justCount 
                                ? this.pcrud.search('cub',
                                    {
                                        owner: {'!=': currentUserId},
                                        pub: 't'
                                    },
                                    {},
                                    {atomic: true})
                                : this.pcrud.search('cub',
                                    {
                                        owner: {'!=': currentUserId},
                                        pub: 't'
                                    },
                                    {
                                        ...options,
                                        flesh: 1,
                                        flesh_fields: {cub: ['owner']}
                                    },
                                    {atomic: true})
                        );
                        
                        if (justCount) {
                            // Calculate count
                            const finalCount = Array.isArray(result) ? result.length : 
                                (result !== null && result !== undefined) ? 1 : 0;
                            
                            console.debug('Shared with me count:', finalCount);
                            this.views.shared_with_user.count = finalCount;
                            
                            return { bucketIds: [], count: finalCount };
                        } else {
                            // Extract IDs
                            let ids = [];
                            if (Array.isArray(result)) {
                                ids = result.map(bucket => bucket.id());
                            } else if (result !== null && result !== undefined) {
                                if (typeof result === 'object' && typeof result.id === 'function') {
                                    ids = [result.id()];
                                } else if (typeof result === 'number') {
                                    ids = [result];
                                }
                            }
                            
                            console.debug('Shared with me bucket IDs:', ids, 'count:', ids.length);
                            this.views.shared_with_user.count = ids.length;
                            
                            return { bucketIds: ids, count: ids.length };
                        }
                    } catch (error) {
                        console.error('Error in shared_with_user query:', error);
                        this.views.shared_with_user.count = 0;
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
    
    // Add a method to get shared buckets
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
}
