import {Component, OnInit, OnDestroy, ViewChild, ElementRef} from '@angular/core';
import {Router, ActivatedRoute} from '@angular/router';
import {Observable, Subject, from, lastValueFrom, EMPTY, of} from 'rxjs';
import {takeUntil, catchError, switchMap, map} from 'rxjs/operators';
import {AuthService} from '@eg/core/auth.service';
import {GridComponent} from '@eg/share/grid/grid.component';
import {GridDataSource, GridCellTextGenerator} from '@eg/share/grid/grid';
import {GridFlatDataService} from '@eg/share/grid/grid-flat-data.service';
import {ToastService} from '@eg/share/toast/toast.service';
import {DialogComponent} from '@eg/share/dialog/dialog.component';
import {ConfirmDialogComponent} from '@eg/share/dialog/confirm.component';
import {AlertDialogComponent} from '@eg/share/dialog/alert.component';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {BucketDialogComponent} from '@eg/staff/share/buckets/bucket-dialog.component';
import {BucketTransferDialogComponent} from '@eg/staff/share/buckets/bucket-transfer-dialog.component';
import {FmRecordEditorComponent} from '@eg/share/fm-editor/fm-editor.component';
import {PatronBucketService} from './patron-bucket.service';
import {PatronBucketStateService} from './state.service';
import {DatePipe} from '@angular/common';
import {BucketService} from '@eg/staff/share/buckets/bucket.service';
import {BucketShareDialogComponent} from '@eg/staff/share/buckets/bucket-share-dialog.component';
import {BucketDialogService} from '@eg/staff/share/buckets/bucket-dialog.service';
import {PatronSearchDialogComponent} from '@eg/staff/share/patron/search-dialog.component';

@Component({
    selector: 'eg-patron-bucket-list',
    templateUrl: 'patron-bucket.component.html',
    styleUrls: ['./patron-bucket.component.css']
})

export class PatronBucketComponent implements OnInit, OnDestroy {
    dataSource: GridDataSource = new GridDataSource();
    cellTextGenerator: GridCellTextGenerator;
    bucketIdToRetrieve: number;
    bucketId: number;
    countInProgress = false;
    noSelectedRows = true;
    oneSelectedRow = false;
    retrievingById = false; // Add spinner state
    favoriteIds: number[] = [];

    @ViewChild('grid', { static: false }) grid: GridComponent;
    @ViewChild('newBucketDialog') private newBucketDialog: BucketDialogComponent;
    @ViewChild('editBucketDialog') private editBucketDialog: BucketDialogComponent;
    @ViewChild('editDialog') private editDialog: FmRecordEditorComponent;
    @ViewChild('deleteDialog') private deleteDialog: ConfirmDialogComponent;
    @ViewChild('deleteFail') private deleteFail: AlertDialogComponent;
    @ViewChild('retrieveByIdFail') private retrieveByIdFail: AlertDialogComponent;
    @ViewChild('results') private results: DialogComponent;
    @ViewChild('transferDialog') private transferDialog: BucketTransferDialogComponent;
    @ViewChild('bucketIdInput', { static: false }) bucketIdInput: ElementRef;
    @ViewChild('shareBucketDialog', { static: false }) shareBucketDialog: BucketShareDialogComponent;
    @ViewChild('patronSearch', { static: false }) patronSearch: PatronSearchDialogComponent;

    private destroy$ = new Subject<void>();

    constructor(
        private router: Router,
        private route: ActivatedRoute,
        private auth: AuthService,
        private toast: ToastService,
        private bucketService: PatronBucketService,
        private bucketState: PatronBucketStateService,
        private modal: NgbModal,
        private datePipe: DatePipe,
        private flatData: GridFlatDataService,
        private sharedBucketService: BucketService,
        private bucketDialogService: BucketDialogService
    ) {}
    
    async ngOnInit() {
        // Initialize grid-related objects
        this.initCellTextGenerator();
        this.initDataSource();

        // Handle route parameters for bucket ID
        this.route.paramMap.pipe(
            takeUntil(this.destroy$)
        ).subscribe(params => {
            const id = params.get('id');
            if (id) {
                this.bucketIdToRetrieve = Number(id);
                this.bucketState.setBucketIdToRetrieve(this.bucketIdToRetrieve);
                this.bucketState.setCurrentView('retrieved_by_id');
                this.grid?.reload();
            }
        });

        // Handle URL path for switching views with improved mapping
        this.route.url.pipe(
            takeUntil(this.destroy$)
        ).subscribe(segments => {
            if (segments.length === 0) {
                // Default to user view if no path segment
                this.bucketState.setCurrentView('user');
                return;
            }
            
            const path = segments[0]?.path;
            // Map URL paths to view names
            const viewMapping = {
                'user': 'user',
                'all': 'all',
                'favorites': 'favorites',
                'recent': 'recent',
                'shared-with-others': 'shared_with_others',
                'shared-with-me': 'shared_with_user'
            };
            
            const viewName = viewMapping[path] || 'user';
            this.bucketState.setCurrentView(viewName);
            this.grid?.reload();
        });

        // Subscribe to state changes
        this.bucketState.currentView$.pipe(
            takeUntil(this.destroy$)
        ).subscribe(() => {
            if (this.grid) {
                this.grid.reload();
            }
        });

        this.bucketState.countInProgress$.pipe(
            takeUntil(this.destroy$)
        ).subscribe(inProgress => {
            this.countInProgress = inProgress;
        });

        // Listen for bucket refresh requests
        this.bucketService.patronBucketsRefresh$.pipe(
            takeUntil(this.destroy$)
        ).subscribe(() => {
            // Only reload grid for the current view, but always update counts for all tabs
            this.grid?.reload();
            this.bucketState.updateCounts();
        });

        // Load recent bucket and favorite bucket data
        await Promise.all([
            this.loadFavoriteBucketFlags(),
            // Just use the synchronous method since it delegates to the shared bucket service
            Promise.resolve(this.bucketService.recentPatronBucketIds())
        ]);
        
        // Initial grid load with a small delay to ensure everything is ready
        setTimeout(() => {
            if (this.grid) {
                this.grid.reload();
            }
        }, 100);

        // Register the patron search dialog with the bucket dialog service
        setTimeout(() => {
            if (this.patronSearch) {
                this.bucketDialogService.setPatronSearchDialog(this.patronSearch);
            }
        }, 100);
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }

    initDataSource() {
        this.dataSource = new GridDataSource();
        this.dataSource.getRows = (pager, sort): Observable<any> => {
            // Get the current view from the state service
            const currentView = this.bucketState.currentView;
            
            if (!currentView) {
                console.warn('No current view defined');
                return EMPTY; // Changed from of([])
            }
            
            const viewDef = this.bucketState.getView(currentView);
            if (!viewDef) {
                console.warn(`View definition not found for: ${currentView}`);
                return EMPTY; // Changed from of([])
            }
            
            return from(viewDef.bucketIdQuery(pager, sort, false)).pipe(
                switchMap(result => {
                    let ids = result.bucketIds;
                    if (!Array.isArray(ids) || ids.length === 0) {
                        return EMPTY; // Changed from of([])
                    }
                    
                    // Fetch bucket stats first
                    return this.sharedBucketService.getBucketStats('user', ids).pipe(
                        switchMap(countStats => {
                            return this.flatData.getRows(
                                this.grid.context,
                                {id: ids},
                                pager,
                                sort
                            ).pipe(
                                map(row => {
                                    // Enhance row data with share stats
                                    return {
                                        ...row,
                                        item_count: countStats[row.id]?.item_count || 0,
                                        org_share_count: countStats[row.id]?.org_share_count || 0,
                                        usr_view_share_count: countStats[row.id]?.usr_view_share_count || 0,
                                        usr_edit_share_count: countStats[row.id]?.usr_update_share_count || 0,
                                        favorite: this.sharedBucketService.isFavoriteBucket('user', row.id)
                                    };
                            }),
                            catchError(err => {
                                console.error('Error retrieving patron buckets:', err);
                                return EMPTY; // Changed from of([])
                            })
                            );
                        }),
                        catchError(err => {
                            console.error('Error retrieving bucket stats:', err);
                            return this.flatData.getRows(
                                this.grid.context,
                                {id: ids},
                                pager,
                                sort
                            );
                        })
                    );
                }),
                catchError(error => {
                    console.error('Error in bucketIdQuery:', error);
                    return EMPTY; // Changed from of([])
                })
            );
        };
    }

    initCellTextGenerator() {
        this.cellTextGenerator = {
            id: (row: any) => row.id != null ? String(row.id) : '',
            name: (row: any) => row.name != null ? String(row.name) : '',
            description: (row: any) => row.description != null ? String(row.description) : '',
            btype: (row: any) => row.btype != null ? String(row.btype) : '',
            owner_usrname: (row: any) => row.owner_usrname != null ? String(row.owner_usrname) : '',
            create_time: (row: any) =>
                row.create_time ? this.datePipe.transform(row.create_time, 'medium') || '' : '',
            // Add generators for share stats columns
            item_count: (row: any) => row.item_count != null ? String(row.item_count) : '0',
            org_share_count: (row: any) => row.org_share_count != null ? String(row.org_share_count) : '0',
            usr_view_share_count: (row: any) => row.usr_view_share_count != null ? String(row.usr_view_share_count) : '0',
            usr_edit_share_count: (row: any) => row.usr_edit_share_count != null ? String(row.usr_edit_share_count) : '0'
        };
    }

    isCurrentView(view: string): boolean {
        return this.bucketState.isCurrentView(view);
    }

    getViewKeys(): string[] {
        return this.bucketState.getViewKeys();
    }

    getViews() {
        return this.bucketState.getViews();
    }

    // Update switchTo to handle URL navigation
    switchTo(view: string) {
        // Map view names to URL paths
        const urlMapping = {
            'user': 'user',
            'all': 'all',
            'favorites': 'favorites',
            'recent': 'recent',
            'shared_with_others': 'shared-with-others',
            'shared_with_user': 'shared-with-me'
        };
        
        const urlPath = urlMapping[view] || 'user';
        
        // Update state and navigate
        this.bucketState.setCurrentView(view);
        this.router.navigate([urlPath], { relativeTo: this.route.parent });
    }
    
    gridSelectionChange(selected: any[]) {
        this.noSelectedRows = selected.length === 0;
        this.oneSelectedRow = selected.length === 1;
    }

    retrieveBucketById() {
        if (
            this.bucketIdToRetrieve == null ||
            this.bucketIdToRetrieve < 0
        ) {
            // Focus the input field if no ID is provided or negative
            setTimeout(() => this.bucketIdInput?.nativeElement?.focus(), 0);
            return;
        }
        
        this.retrievingById = true;
        this.bucketService.retrieveBucketById(this.bucketIdToRetrieve)
            .then(bucket => {
                this.retrievingById = false;
                // Log this bucket in recent buckets
                this.bucketService.logPatronBucket(this.bucketIdToRetrieve);
                // Navigate directly to bucket content page with correct path
                this.router.navigate(['/staff/circ/patron/bucket/content', this.bucketIdToRetrieve])
                    .catch(err => {
                        console.error('Navigation error:', err);
                        this.toast.danger($localize`Error navigating to bucket: ${err.message || err}`);
                    });
            })
            .catch(error => {
                this.retrievingById = false;
                // Show error as toast
                this.toast.danger(error?.message || $localize`Unknown error retrieving bucket`);
                // Return focus to the input field
                setTimeout(() => this.bucketIdInput?.nativeElement?.focus(), 0);
            });
    }

    jumpToBucketContent(bucketId: number) {
        if (!bucketId) {
            this.toast.danger($localize`Cannot view content: Invalid bucket ID`);
            return;
        }
        
        // First check if the user has access to this bucket
        this.bucketService.checkBucketAccess(bucketId)
            .then(() => {
                // Access granted, proceed to bucket content
                this.bucketService.logPatronBucket(bucketId);
                this.router.navigate(['/staff/circ/patron/bucket/content', bucketId]).catch(err => {
                    this.toast.danger($localize`Navigation error: ${err.message || err}`);
                });
            })
            .catch(err => {
                // Access denied
                console.error('Permission denied:', err);
                this.toast.danger($localize`${err.message || 'Access denied'}`);
            });
    }

    openNewBucketDialog = async () => {
        try {
            // Use our shared bucket dialog component
            if (this.editBucketDialog) {
                this.editBucketDialog.bucketClass = 'user';
                this.editBucketDialog.editMode = false;
                this.editBucketDialog.bucketId = null;
                this.editBucketDialog.bucketData = null;
                this.editBucketDialog.showPublicOption = true;
                
                try {
                    const results = await lastValueFrom(this.editBucketDialog.open({size: 'lg'}));
                    // Only handle results if there's actual data
                    if (results) {
                        this.handleBucketCreationResult(results);
                    }
                } catch (err) {
                    // User dismissed the dialog - silently handle this case
                    console.debug('Bucket creation canceled');
                }
            } 
            // Fallback to the original method using newBucketDialog if available
            else if (this.newBucketDialog) {
                this.newBucketDialog.bucketClass = 'user';
                try {
                    const results = await lastValueFrom(this.newBucketDialog.open());
                    if (results) {
                        this.handleBucketCreationResult(results);
                    }
                } catch (err) {
                    // User dismissed the dialog - silently handle this case
                    console.debug('Bucket creation canceled');
                }
            } 
            // Create the dialog programmatically as fallback
            else {
                const modalRef = this.modal.open(BucketDialogComponent, {
                    size: 'lg'
                });
                const bucketDialog = modalRef.componentInstance as BucketDialogComponent;
                bucketDialog.bucketClass = 'user';
                bucketDialog.editMode = false;
                
                try {
                    const results = await modalRef.result;
                    if (results) {
                        this.handleBucketCreationResult(results);
                    }
                } catch (err) {
                    // User dismissed the dialog
                    console.debug('Bucket creation canceled');
                }
            }
        } catch (error) {
            // Only show error toast for actual errors, not for dialog dismissals
            if (error && error.message !== 'no elements in sequence') {
                this.toast.danger($localize`Error creating bucket: ${error.message || error}`);
            }
        }
    }

    // Helper method to handle bucket creation result
    private handleBucketCreationResult(results: any) {
        if (results && results.id) {
            // Log the bucket to recent buckets
            this.bucketService.logPatronBucket(results.id);
            // Navigate to the bucket content view
            this.router.navigate(['/staff/circ/patron/bucket/content', results.id]);
            this.toast.success($localize`Bucket "${results.name}" created successfully`);
        } else {
            // Just refresh the list if we don't have a specific ID to navigate to
            this.bucketService.requestPatronBucketsRefresh();
            this.toast.success($localize`Bucket created successfully`);
        }
    }

    openEditBucketDialog = async (rows: any[]) => {
        if (!rows.length) return;
        try {
            const row = rows[0];
            
            // Better checking for bucket object and ID
            if (!row) {
                this.toast.danger($localize`Error: No row data available`);
                return;
            }
            
            // Get the bucket ID safely - different row formats are possible
            let bucketId;
            let bucket;
            
            // Try different ways to get the bucket ID
            if (row.id) {
                // Direct ID from flat data
                bucketId = row.id;
            } else if (row.bucket && typeof row.bucket.id === 'function') {
                // IDL object with id() method
                bucket = row.bucket;
                bucketId = bucket.id();
            } else if (row.bucket && row.bucket.id) {
                // Object with direct id property
                bucket = row.bucket;
                bucketId = row.bucket.id;
            } else {
                this.toast.danger($localize`Error: Could not determine bucket ID`);
                return;
            }
            
            console.log('Editing bucket with ID:', bucketId);
            
            // Prepare bucket data for editing with safe access
            const bucketData = {
                id: bucketId,
                name: row.name || '',
                description: row.description || '',
                btype: row.btype || 'staff_client',
                owner: this.auth.user().id(), // Default to current user
                pub: false // Default public state
            };
            
            // If we have a bucket object, try to get data from it directly
            if (bucket) {
                try {
                    if (typeof bucket.name === 'function') bucketData.name = bucket.name();
                } catch (e) { console.warn('Error accessing bucket name:', e); }
                
                try {
                    if (typeof bucket.description === 'function') bucketData.description = bucket.description();
                } catch (e) { console.warn('Error accessing bucket description:', e); }
                
                try {
                    if (typeof bucket.btype === 'function') bucketData.btype = bucket.btype();
                } catch (e) { console.warn('Error accessing bucket type:', e); }
                
                try {
                    if (typeof bucket.owner === 'function') bucketData.owner = bucket.owner();
                } catch (e) { console.warn('Error accessing bucket owner:', e); }

                try {
                    // Improved pub value extraction
                    if (typeof bucket.pub === 'function') {
                        // Handle different possible pub values
                        const pubValue = bucket.pub();
                        bucketData.pub = pubValue === 't' || pubValue === true;
                        console.debug('Retrieved pub value from function:', pubValue, 'converted to:', bucketData.pub);
                    } else if (bucket.pub !== undefined) {
                        // Direct property access fallback
                        bucketData.pub = bucket.pub === 't' || bucket.pub === true;
                        console.debug('Retrieved pub value from property:', bucket.pub, 'converted to:', bucketData.pub);
                    }
                } catch (e) { 
                    console.warn('Error accessing bucket pub flag:', e); 
                }
            } else {
                // If we don't have the bucket object but have row data, try to get pub from row
                try {
                    if (row.pub !== undefined) {
                        bucketData.pub = row.pub === 't' || row.pub === true;
                        console.debug('Retrieved pub value from row:', row.pub, 'converted to:', bucketData.pub);
                    }
                } catch (e) {
                    console.warn('Error accessing row pub value:', e);
                }
            }
            
            console.debug('Final bucket data for edit dialog:', bucketData);
            
            // Use the shared bucket dialog component for editing
            if (this.editBucketDialog) {
                this.editBucketDialog.bucketClass = 'user';
                this.editBucketDialog.editMode = true;
                this.editBucketDialog.bucketId = bucketId;
                this.editBucketDialog.bucketData = bucketData;
                this.editBucketDialog.showPublicOption = true;
                
                try {
                    const result = await lastValueFrom(this.editBucketDialog.open({size: 'lg'}));
                    if (result) {
                        this.bucketService.requestPatronBucketsRefresh();
                        this.toast.success($localize`Bucket successfully updated`);
                    }
                } catch (err) {
                    // User dismissed the dialog - silently handle this case
                    console.debug('Bucket editing canceled');
                }
            } else {
                // Fall back to the fm-editor
                this.editDialog.mode = 'update';
                this.editDialog.recordId = bucketId;
                this.editDialog.idlClass = 'cub';
                const editRef = this.editDialog.open();
                const result = await lastValueFrom(editRef);
                if (result) {
                    this.bucketService.requestPatronBucketsRefresh();
                    this.toast.success($localize`Bucket successfully updated`);
                }
            }
        } catch (error) {
            console.error('Error in openEditBucketDialog:', error);
            this.toast.danger($localize`Error updating bucket: ${error.message || error}`);
        }
    }

    openDeleteBucketDialog = async (rows: any[]) => {
        if (!rows.length) return;
        try {
            const confirmation = await lastValueFrom(this.deleteDialog.open());
            if (!confirmation) return;
            
            // Safely extract bucket IDs from row data, handling different possible structures
            const bucketIds = rows.map(row => {
                // Handle different possible data structures
                if (row.id) {
                    // Direct ID access (flat data)
                    return row.id;
                } else if (row.bucket && typeof row.bucket.id === 'function') {
                    // IDL object with id() method
                    return row.bucket.id();
                } else if (row.bucket && row.bucket.id) {
                    // Object with direct id property
                    return row.bucket.id;
                }
                throw new Error(`Unable to determine bucket ID from row data`);
            });
            
            const results = await Promise.all(bucketIds.map(id => this.bucketService.deleteBucket(id)));
            
            const failures = results.filter(r => !r.success);
            if (failures.length > 0) {
                this.deleteFail.open();
            } else {
                this.toast.success($localize`Bucket(s) successfully deleted`);
            }
            
            this.bucketService.requestPatronBucketsRefresh();
        } catch (error) {
            this.toast.danger($localize`Error deleting bucket: ${error.message || error}`);
            this.deleteFail.open();
        }
    }

    openTransferDialog = async (rows: any[]) => {
        if (!rows.length) return;
        
        this.transferDialog.containerType = 'user';
        
        // Ensure we provide objects with direct id properties
        // This handles different row structure formats safely
        this.transferDialog.containerObjects = rows.map(row => {
            // If row already has an id property, use it directly
            if (row.id !== undefined) {
                return { id: row.id, name: row.name || '' };
            }
            // Otherwise try to extract from bucket property if it exists
            else if (row.bucket) {
                const bucketId = typeof row.bucket.id === 'function' ? row.bucket.id() : row.bucket.id;
                return { id: bucketId, name: row.name || row.bucket.name || '' };
            }
            // Fallback case
            return null;
        }).filter(obj => obj !== null && obj.id !== undefined);
        
        try {
            const results = await lastValueFrom(this.transferDialog.open());
            if (results?.success) {
                this.bucketService.requestPatronBucketsRefresh();
                this.toast.success($localize`Bucket ownership transferred`);
            }
        } catch (error) {
            console.error('Error in transfer dialog:', error);
        }
    }

    openShareBucketDialog = async (rows: any[]) => {
        if (!rows || rows.length === 0) {
            this.toast.danger($localize`No buckets selected for sharing`);
            return;
        }

        try {
            this.shareBucketDialog.containerObjects = rows;
            this.shareBucketDialog.bucketClass = 'user';
            await this.shareBucketDialog.loadAouTree();
            await this.shareBucketDialog.populateCheckedNodes();
            await this.shareBucketDialog.loadAuGridViewPermGrid();
            await this.shareBucketDialog.loadAuGridEditPermGrid();

            const dialogRef$ = this.shareBucketDialog.open({size: 'lg'}).pipe(
                takeUntil(this.destroy$),
                catchError((error: unknown) => {
                    console.debug('openShareBucketDialog error:', error);
                    return EMPTY;
                })
            );
            const result = await lastValueFrom(dialogRef$, { defaultValue: null });
            if (result && result.success) {
                this.toast.success($localize`Bucket sharing updated successfully`);
                setTimeout(() => {
                    this.bucketService.requestPatronBucketsRefresh();
                }, 500);
            }
        } catch (error) {
            console.error('Error in share bucket dialog:', error);
            this.toast.danger($localize`Error updating bucket sharing: ${error.message || error}`);
        }
    }

    // Add this method to handle the View Content button click
    viewSelectedBuckets(rows: any[]) {
        if (!rows.length) return;
        rows.forEach(row => this.jumpToBucketContent(row.id));
    }

    debugRowData(rows: any[]) {
        if (!rows.length) return;
        console.log('Sample row data:', rows[0]);
        this.toast.info(`Row data logged to console`);
    }

    // Load favorite bucket flags
    async loadFavoriteBucketFlags(): Promise<void> {
        try {
            await this.sharedBucketService.loadFavoriteBucketFlags('user');
            this.favoriteIds = this.sharedBucketService.getFavoriteBucketIds('user');
            console.debug('Loaded favorite bucket IDs:', this.favoriteIds);
        } catch (error) {
            console.error('Error loading favorite bucket flags:', error);
        }
    }
    
    // Check if a bucket is a favorite
    isFavoriteBucket(bucketId: number): boolean {
        return this.sharedBucketService.isFavoriteBucket('user', bucketId);
    }

    // Add a bucket to favorites
    async favoriteBucket(rows: any[]): Promise<void> {
        if (!rows.length) return;
        
        const results = [];
        for (const row of rows) {
            if (!this.isFavoriteBucket(row.id)) {
                try {
                    await this.sharedBucketService.addFavoriteBucket('user', row.id);
                    results.push({ id: row.id, success: true });
                } catch (error) {
                    console.error(`Error adding favorite for bucket ${row.id}:`, error);
                    results.push({ id: row.id, success: false, error });
                }
            }
        }
        
        // Update the favoriteIds list
        this.favoriteIds = this.sharedBucketService.getFavoriteBucketIds('user');
        
        // Show success message
        const successCount = results.filter(r => r.success).length;
        if (successCount > 0) {
            this.toast.success($localize`${successCount} bucket(s) added to favorites`);
            this.bucketState.updateCounts();
            this.grid?.reload();
        }
    }

    // Remove a bucket from favorites
    async unFavoriteBucket(rows: any[]): Promise<void> {
        if (!rows.length) return;
        
        const results = [];
        for (const row of rows) {
            if (this.isFavoriteBucket(row.id)) {
                try {
                    await this.sharedBucketService.removeFavoriteBucket('user', row.id);
                    results.push({ id: row.id, success: true });
                } catch (error) {
                    console.error(`Error removing favorite for bucket ${row.id}:`, error);
                    results.push({ id: row.id, success: false, error });
                }
            }
        }
        
        // Update the favoriteIds list
        this.favoriteIds = this.sharedBucketService.getFavoriteBucketIds('user');
        
        // Show success message
        const successCount = results.filter(r => r.success).length;
        if (successCount > 0) {
            this.toast.success($localize`${successCount} bucket(s) removed from favorites`);
            this.bucketState.updateCounts();
            this.grid?.reload();
        }
    }
}
