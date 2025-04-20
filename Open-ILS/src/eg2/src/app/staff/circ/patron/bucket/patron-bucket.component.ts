import {Component, OnInit, OnDestroy, ViewChild} from '@angular/core';
import {Router, ActivatedRoute} from '@angular/router';
import {Observable, Subject, from, lastValueFrom, EMPTY, of} from 'rxjs';
import {takeUntil, catchError, switchMap, map} from 'rxjs/operators';
import {AuthService} from '@eg/core/auth.service';
import {IdlObject} from '@eg/core/idl.service';
import {NetService} from '@eg/core/net.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {EventService} from '@eg/core/event.service';
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
import {BucketShareDialogComponent} from '@eg/staff/share/buckets/bucket-share-dialog.component';
import {FmRecordEditorComponent} from '@eg/share/fm-editor/fm-editor.component';
import {PatronBucketService} from './patron-bucket.service';
import {PatronBucketStateService} from './patron-bucket-state.service';
import {DatePipe} from '@angular/common';
import {OrgService} from '@eg/core/org.service';
import {PatronBucketCreateDialogComponent} from './patron-bucket-create-dialog.component';

@Component({
    selector: 'eg-patron-bucket',
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

    @ViewChild('grid', { static: false }) grid: GridComponent;
    @ViewChild('newBucketDialog') private newBucketDialog: BucketDialogComponent;
    @ViewChild('createBucketDialog') private createBucketDialog: PatronBucketCreateDialogComponent;
    @ViewChild('editDialog') private editDialog: FmRecordEditorComponent;
    @ViewChild('deleteDialog') private deleteDialog: ConfirmDialogComponent;
    @ViewChild('deleteFail') private deleteFail: AlertDialogComponent;
    @ViewChild('retrieveByIdFail') private retrieveByIdFail: AlertDialogComponent;
    @ViewChild('results') private results: DialogComponent;
    @ViewChild('transferDialog') private transferDialog: BucketTransferDialogComponent;
    @ViewChild('shareBucketDialog') private shareBucketDialog: BucketShareDialogComponent;

    private destroy$ = new Subject<void>();

    constructor(
        private router: Router,
        private route: ActivatedRoute,
        private auth: AuthService,
        private net: NetService,
        private pcrud: PcrudService,
        private evt: EventService,
        private toast: ToastService,
        private org: OrgService,
        private bucketService: PatronBucketService,
        private bucketState: PatronBucketStateService,
        private modal: NgbModal,
        private datePipe: DatePipe,
        private flatData: GridFlatDataService
    ) {}

    ngOnInit() {
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

        // Handle URL path for switching views
        this.route.url.pipe(
            takeUntil(this.destroy$)
        ).subscribe(segments => {
            const path = segments[0]?.path;
            const views = this.bucketState.getViews();
            if (path && views[path]) {
                this.bucketState.setCurrentView(path);
                this.grid?.reload();
            }
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
        this.bucketService.patronBucketsRefreshRequested$.pipe(
            takeUntil(this.destroy$)
        ).subscribe(() => {
            this.grid?.reload();
            this.bucketState.updateCounts();
        });

        // Get initial counts for all views
        this.bucketState.updateCounts();
        
        // Initial grid load with a small delay to ensure everything is ready
        setTimeout(() => {
            if (this.grid) {
                this.grid.reload();
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
                return of({count: 0, items: []});
            }
            
            const viewDef = this.bucketState.getView(currentView);
            if (!viewDef) {
                console.warn(`View definition not found for: ${currentView}`);
                return of({count: 0, items: []});
            }
            
            return from(viewDef.bucketIdQuery(pager, sort, false)).pipe(
                switchMap(result => {
                    // Ensure we have valid IDs to search for
                    let ids = result.bucketIds;
                    if (!Array.isArray(ids) || ids.length === 0) {
                        return of({count: result.count || 0, items: []});
                    }
                    
                    // Use flatData service instead of direct pcrud + transformation
                    return this.flatData.getRows(
                        this.grid.context,
                        {id: ids},
                        pager,
                        sort
                    ).pipe(
                        catchError(err => {
                            console.error('Error retrieving patron buckets:', err);
                            return of({count: 0, items: []});
                        })
                    );
                }),
                catchError(error => {
                    console.error('Error in bucketIdQuery:', error);
                    return of({count: 0, items: []});
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
                row.create_time ? this.datePipe.transform(row.create_time, 'medium') || '' : ''
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

    switchTo(view: string) {
        this.bucketState.setCurrentView(view);
    }

    gridSelectionChange(selected: any[]) {
        this.noSelectedRows = selected.length === 0;
        this.oneSelectedRow = selected.length === 1;
    }

    retrieveBucketById() {
        if (!this.bucketIdToRetrieve) return;
        this.retrievingById = true;
        this.bucketService.retrieveBucketById(this.bucketIdToRetrieve)
            .then(bucket => {
                this.retrievingById = false;
                this.jumpToBucketContent(this.bucketIdToRetrieve);
            })
            .catch(error => {
                this.retrievingById = false;
                // Show error as toast instead of inline error
                this.toast.danger(error?.message || $localize`Unknown error retrieving bucket`);
                // Optionally, open the dialog for more severe errors
                // this.retrieveByIdFail.dialogBody = error?.message || $localize`Unknown error retrieving bucket`;
                // this.retrieveByIdFail.open();
            });
    }

    jumpToBucketContent(bucketId: number) {
        if (!bucketId) {
            this.toast.danger($localize`Cannot view content: Invalid bucket ID`);
            return;
        }
        this.bucketService.logPatronBucket(bucketId);
        this.router.navigate(['/staff/circ/patron/bucket/content', bucketId]).catch(err => {
            this.toast.danger($localize`Navigation error: ${err.message || err}`);
        });
    }

    openNewBucketDialog = async () => {
        try {
            // Use our enhanced dialog if available
            if (this.createBucketDialog) {
                try {
                    const results = await lastValueFrom(this.createBucketDialog.open({size: 'lg'}));
                    // Only handle results if there's actual data
                    if (results) {
                        this.handleBucketCreationResult(results);
                    }
                } catch (err) {
                    // User dismissed the dialog - silently handle this case
                    console.debug('Bucket creation canceled');
                }
            } 
            // Fallback to the old dialog if necessary
            else if (this.newBucketDialog) {
                this.newBucketDialog.bucketClass = 'user';
                this.newBucketDialog.bucketType = 'staff_client';
                this.newBucketDialog.itemIds = [];
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
            // Create the new dialog programmatically as fallback
            else {
                const modalRef = this.modal.open(PatronBucketCreateDialogComponent, {
                    size: 'lg'
                });
                const bucketDialog = modalRef.componentInstance as PatronBucketCreateDialogComponent;
                
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
                    if (typeof bucket.pub === 'function') {
                        // Handle different possible pub values
                        const pubValue = bucket.pub();
                        bucketData.pub = pubValue === 't' || pubValue === true;
                    }
                } catch (e) { console.warn('Error accessing bucket pub flag:', e); }
            }
            
            // Use the create dialog component for editing
            if (this.createBucketDialog) {
                this.createBucketDialog.editMode = true;
                this.createBucketDialog.bucketId = bucketId;
                this.createBucketDialog.bucketData = bucketData;
                
                try {
                    const result = await lastValueFrom(this.createBucketDialog.open({size: 'lg'}));
                    if (result && result.success) {
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
        this.transferDialog.containerObjects = rows.map(row => row.bucket);
        
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
        if (!rows.length) return;
        
        this.shareBucketDialog.containerObjects = rows.map(row => row.bucket);
        
        try {
            const results = await lastValueFrom(this.shareBucketDialog.open());
            if (results?.success) {
                this.bucketService.requestPatronBucketsRefresh();
                this.toast.success($localize`Bucket sharing updated`);
            }
        } catch (error) {
            console.error('Error in share dialog:', error);
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
}
