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

    @ViewChild('grid', { static: false }) grid: GridComponent;
    @ViewChild('newBucketDialog') private newBucketDialog: BucketDialogComponent;
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
        private datePipe: DatePipe
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
            console.debug('DataSource getRows called - current view:', currentView);
            
            if (!currentView) {
                console.warn('No current view defined');
                return of({count: 0, items: []});
            }
            
            const viewDef = this.bucketState.getView(currentView);
            if (!viewDef) {
                console.warn(`View definition not found for: ${currentView}`);
                return of({count: 0, items: []});
            }
            
            console.debug(`DataSource getRows for view: ${currentView}`, pager, sort);
            
            return from(viewDef.bucketIdQuery(pager, sort, false)).pipe(
                switchMap(result => {
                    console.debug('Bucket IDs from query:', result.bucketIds, 'count:', result.count);
                    
                    // Ensure we have valid IDs to search for
                    let ids = result.bucketIds;
                    if (!Array.isArray(ids) || ids.length === 0) {
                        console.debug('No bucket IDs to fetch, returning empty result');
                        return of({count: result.count || 0, items: []});
                    }
                    
                    console.debug('Fetching buckets with IDs:', ids);
                    
                    // Try to directly fetch the buckets with a simpler approach first
                    return this.pcrud.search('cub', 
                        {id: ids}, 
                        { flesh: 1, flesh_fields: {cub: ['owner']} }
                    ).pipe(
                        map(buckets => {
                            console.debug('Raw buckets from pcrud:', buckets);
                            
                            // Convert to array if not already
                            let bucketsArray = buckets;
                            if (!Array.isArray(buckets)) {
                                bucketsArray = buckets ? [buckets] : [];
                            }
                            
                            // Check what we actually received
                            console.debug('Buckets array after normalization:', bucketsArray);
                            
                            // Transform buckets for grid display using the service
                            const items = this.bucketService.transformBucketsForGrid(bucketsArray);
                            console.debug('Transformed grid items:', items);
                            
                            // Ensure all items have a unique index
                            items.forEach((item, idx) => {
                                if (item.id === undefined || item.id === null) {
                                    item.id = `temp_${idx}`; // Provide a fallback ID if needed
                                }
                            });
                            
                            return {
                                count: result.count,
                                items: items
                            };
                        }),
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
            'owner.usrname': (row: any) => row['owner.usrname'] != null ? String(row['owner.usrname']) : '',
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
        
        this.bucketService.retrieveBucketById(this.bucketIdToRetrieve)
            .then(bucket => {
                this.jumpToBucketContent(this.bucketIdToRetrieve);
            })
            .catch(error => {
                console.error('Error retrieving bucket:', error);
                this.retrieveByIdFail.dialogBody = error.toString();
                this.retrieveByIdFail.open();
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
            // Method 1: Use the ViewChild reference if it exists
            if (this.newBucketDialog) {
                this.newBucketDialog.bucketClass = 'user';
                this.newBucketDialog.bucketType = 'staff_client';
                this.newBucketDialog.itemIds = [];
                const results = await lastValueFrom(this.newBucketDialog.open());
                this.handleBucketCreationResult(results);
            } 
            // Method 2: Create the dialog programmatically as fallback
            else {
                // Import the component dynamically to avoid circular dependencies
                const modalRef = this.modal.open(BucketDialogComponent);
                const bucketDialog = modalRef.componentInstance as BucketDialogComponent;
                
                bucketDialog.bucketClass = 'user';
                bucketDialog.bucketType = 'staff_client';
                bucketDialog.itemIds = [];
                
                try {
                    const results = await modalRef.result;
                    this.handleBucketCreationResult(results);
                } catch (err) {
                    // User dismissed the dialog
                    console.debug('Bucket creation canceled');
                }
            }
        } catch (error) {
            this.toast.danger($localize`Error creating bucket: ${error.message || error}`);
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
            const bucket = rows[0].bucket;
            const bucketId = bucket.id();
            this.editDialog.mode = 'update';
            this.editDialog.recordId = bucketId;
            this.editDialog.idlClass = 'cub';
            const editRef = this.editDialog.open();
            const result = await lastValueFrom(editRef);
            if (result) {
                this.bucketService.requestPatronBucketsRefresh();
                this.toast.success($localize`Bucket successfully updated`);
            }
        } catch (error) {
            this.toast.danger($localize`Error updating bucket: ${error.message || error}`);
        }
    }

    openDeleteBucketDialog = async (rows: any[]) => {
        if (!rows.length) return;
        try {
            const confirmation = await lastValueFrom(this.deleteDialog.open());
            if (!confirmation) return;
            
            const bucketIds = rows.map(row => row.bucket.id());
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
}
