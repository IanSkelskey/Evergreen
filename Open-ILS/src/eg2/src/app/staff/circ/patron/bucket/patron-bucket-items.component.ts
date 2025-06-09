import {Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit} from '@angular/core';
import {Router, ActivatedRoute, NavigationEnd} from '@angular/router';
import {lastValueFrom, EMPTY, Subject, Observable, from, of, forkJoin} from 'rxjs';
import {catchError, takeUntil, filter, map, switchMap, toArray} from 'rxjs/operators';
import {AuthService} from '@eg/core/auth.service';
import {IdlObject} from '@eg/core/idl.service';
import {NetService} from '@eg/core/net.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {OrgService} from '@eg/core/org.service';
import {EventService} from '@eg/core/event.service';
import {PermService} from '@eg/core/perm.service';
import {GridComponent} from '@eg/share/grid/grid.component';
import {GridDataSource} from '@eg/share/grid/grid';
import {GridFlatDataService} from '@eg/share/grid/grid-flat-data.service';
import {ToastService} from '@eg/share/toast/toast.service';
import {ConfirmDialogComponent} from '@eg/share/dialog/confirm.component';
import {AlertDialogComponent} from '@eg/share/dialog/alert.component';
import {ProgressDialogComponent} from '@eg/share/dialog/progress.component';
import {PatronBucketService} from './patron-bucket.service';
import {PatronService} from '@eg/staff/share/patron/patron.service';
import {PatronBucketAddDialogComponent} from './add-dialog.component';
import {BucketItemTransferDialogComponent} from '@eg/staff/share/buckets/item-transfer-dialog.component';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {Pager} from '@eg/share/util/pager';
import {PatronBarcodeUploadComponent} from './patron-barcode-upload.component';
import {PatronBucketBatchEditComponent} from './patron-bucket-batch-edit.component';
import {PatronBucketChangesetsComponent} from './patron-bucket-changesets.component';
import {ɵ$localize as $localize} from '@angular/localize';

@Component({
    selector: 'eg-patron-bucket-item',
    templateUrl: 'patron-bucket-items.component.html',
    styleUrls: ['patron-bucket-items.component.css']
})
export class PatronBucketItemComponent implements OnInit, OnDestroy, AfterViewInit {
    bucketId: number;
    bucket: IdlObject;
    returnTo: string;
    dataSource: GridDataSource = new GridDataSource();
    noSelectedRows = true;
    oneSelectedRow = false;
    hasUpdatePerm = false;
    hasDeletePerm = false;
    
    @ViewChild('grid', { static: true }) grid: GridComponent;
    @ViewChild('confirmDialog') confirmDialog: ConfirmDialogComponent;
    @ViewChild('alertDialog') alertDialog: AlertDialogComponent;
    @ViewChild('progressDialog') progressDialog: ProgressDialogComponent;
    @ViewChild('addPatronDialog') private addPatronDialog: PatronBucketAddDialogComponent;
    @ViewChild('uploadBarcodeDialog') private uploadBarcodeDialog: PatronBarcodeUploadComponent;
    @ViewChild('itemTransferDialog') private itemTransferDialog: BucketItemTransferDialogComponent;
    @ViewChild('batchEditDialog') private batchEditDialog: PatronBucketBatchEditComponent;
    
    private destroy$ = new Subject<void>();
    isLoading = true;
    private currentUrl: string;
    private previousBucketId: number;
    private bucketItemMap: Map<number, number> = new Map(); // Maps patron IDs to bucket item IDs

    constructor(
        private router: Router,
        private route: ActivatedRoute,
        private auth: AuthService,
        private net: NetService,
        private evt: EventService,
        private pcrud: PcrudService,
        private org: OrgService,
        private toast: ToastService,
        private flatData: GridFlatDataService,
        private bucketService: PatronBucketService,
        private patronService: PatronService,
        private modal: NgbModal,
        private perm: PermService
    ) {
        // Initialize datasource like the search component does
        this.dataSource = new GridDataSource();
        this.dataSource.getRows = (pager: Pager, sort: any[]) => {
            return this.getRows(pager, sort);
        };
    }

    ngOnInit() {
        this.perm.hasWorkPermAt(['UPDATE_USER']).then(result => this.hasUpdatePerm = !!result);
        this.perm.hasWorkPermAt(['DELETE_USER']).then(result => this.hasDeletePerm = !!result);

        this.router.events.pipe(
            filter(event => event instanceof NavigationEnd),
            takeUntil(this.destroy$)
        ).subscribe((event: NavigationEnd) => {
            const previousUrl = this.currentUrl;
            this.currentUrl = event.url;
            
            if (previousUrl && previousUrl === this.currentUrl) {
                console.debug('Detected revisit to same bucket page - forcing refresh');
                setTimeout(() => this.refreshGridData(), 100);
            }
        });

        this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
            const bucketId = +params.get('id');
            
            const bucketChanged = this.bucketId !== bucketId;
            this.previousBucketId = this.bucketId;
            this.bucketId = bucketId;
            
            if (bucketChanged) {
                console.debug(`Loading bucket ${bucketId}, previous: ${this.previousBucketId}`);
                this.checkBucketAccess();
            } else {
                console.debug(`Bucket ID unchanged (${bucketId}) - refreshing data`);
                this.refreshGridData();
            }
        });

        this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
            this.returnTo = params.returnTo;
        });
    }

    ngAfterViewInit() {
        setTimeout(() => this.refreshGridData(), 100);
    }

    async checkBucketAccess() {
        try {
            this.isLoading = true;
            
            console.debug('Checking bucket access for bucket ID:', this.bucketId);
            
            const bucket = await lastValueFrom(
                this.pcrud.retrieve('cub', this.bucketId, 
                    {flesh: 1, flesh_fields: {cub: ['owner']}}
                )
            );
            
            await this.bucketService.checkBucketAccess(bucket);
            
            this.bucket = bucket;
            this.bucketService.logPatronBucket(this.bucketId);
            // Data source is already initialized in the constructor; no need to call initDataSource
            this.gridSelectionChange([]);
            this.isLoading = false;
            
            setTimeout(() => this.refreshGridData(), 100);
            
        } catch (err) {
            console.error('Permission denied or bucket not found:', err);
            
            this.router.navigate(['/staff/circ/patron/bucket/unauthorized'], { 
                state: { message: err.message || 'Access denied to this patron bucket.' } 
            });
        }
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }

    gridSelectionChange(keys: string[]) {
        this.noSelectedRows = keys.length === 0;
        this.oneSelectedRow = keys.length === 1;
    }

    // Instead of initDataSource - follow search component's pattern
    getRows(pager: Pager, sort: any[]): Observable<IdlObject> {
        if (!this.bucketId) {
            return of();
        }
        
        return this.retrieveBucketPatrons(this.bucketId, pager, sort).pipe(
            map(user => this.localFleshUser(user))
        );
    }

    // Similar to the search component's localFleshUser
    localFleshUser(user: IdlObject): IdlObject {
        if (user && typeof user.home_ou === 'function') {
            // Try to fetch the org unit object if we have an ID
            try {
                const homeOu = user.home_ou();
                if (homeOu && !isNaN(Number(homeOu))) {
                    user.home_ou(this.org.get(homeOu));
                }
            } catch (e) {
                console.warn('Error fleshing home_ou', e);
            }
        }
        return user;
    }

    /**
     * Retrieves patrons contained in the bucket
     * This is the key method that transforms bucket items into patron objects
     */
    private retrieveBucketPatrons(bucketId: number, pager: Pager, sort: any[]): Observable<IdlObject> {
        console.debug(`Retrieving patron bucket items for bucket ${bucketId}`);
        
        // First get all bucket items without pagination
        return from(this.bucketService.retrievePatronBucketItems(bucketId)).pipe(
            switchMap(items => {
                // If no items in the bucket, return empty array
                if (!items || items.length === 0) {
                    console.debug('No items found in bucket');
                    return of();
                }

                console.debug(`Found ${items.length} bucket items, retrieving patron data`);

                // Extract patron IDs and create a mapping of patron ID to bucket item ID
                const patronIds = [];
                this.bucketItemMap.clear();
                    
                items.forEach(item => {
                    if (item.userId) {
                        patronIds.push(item.userId);
                        this.bucketItemMap.set(item.userId, item.id);
                    } else {
                        console.warn('Found bucket item without userId:', item);
                    }
                });

                if (patronIds.length === 0) {
                    console.debug('No patron IDs extracted from bucket items');
                    return of();
                }
                
                console.debug(`Processing ${patronIds.length} patron IDs: ${patronIds.join(', ')}`);

                // Create sort object for pcrud
                const sortObj = {};
                if (sort && sort.length > 0) {
                    sort.forEach(s => {
                        sortObj[s.name] = s.dir.toUpperCase();
                    });
                } else {
                    // Default sort
                    sortObj['family_name'] = 'ASC';
                    sortObj['first_given_name'] = 'ASC';
                }

                // Use similar approach to search.component.ts
                // Note: we're intentionally not applying pager.offset here because
                // we need to get ALL bucket items first, then paginate the results
                return this.pcrud.search('au', 
                    {id: patronIds}, 
                    {
                        flesh: 3,
                        flesh_fields: {
                            au: ['card', 'home_ou', 'profile', 'money_summary', 'mailing_address', 'billing_address'],
                            pgt: ['name'],
                            aou: ['name']
                        },
                        order_by: sortObj
                    }
                ).pipe(
                    // Collect all patrons from the search
                    toArray(),
                    // Apply client-side pagination after getting all patrons
                    map(patrons => {
                        console.debug(`Received ${patrons.length} patrons from server`);
                        
                        // Apply pagination to the full result set
                        const start = pager.offset;
                        const end = start + pager.limit;
                        const pagedPatrons = patrons.slice(start, end);
                        
                        console.debug(`Returning patrons ${start} to ${end-1} (if available)`);
                        return pagedPatrons;
                    }),
                    // Flatten the array to emit one patron at a time
                    switchMap(pagedPatrons => {
                        if (pagedPatrons.length === 0) return of();
                        return from(pagedPatrons);
                    }),
                    // Now map each patron to include the bucket item ID
                    map((patron: any) => {
                        // Attach bucket item ID to patron object for operations like delete
                        patron._bucket_item_id = this.bucketItemMap.get(patron.id());
                        return patron;
                    })
                );
            }),
            catchError(err => {
                console.error('Error retrieving patrons for bucket:', err);
                this.toast.danger($localize`Error loading patron data: ${err.message || err}`);
                return of();
            })
        );
    }

    async removeFromBucket(patrons: IdlObject[]): Promise<boolean> {
        if (!patrons.length) return false;
        
        try {
            // Extract bucket item IDs from the patron objects using our mapping
            const itemIds = patrons.map(patron => {
                const bucketItemId = this.bucketItemMap.get(patron.id());
                if (bucketItemId === undefined) {
                    console.warn('Patron missing bucket item ID in map:', patron);
                    return null;
                }
                return Number(bucketItemId);
            }).filter(id => id !== null);
            
            if (itemIds.length === 0) {
                this.toast.danger($localize`Unable to remove patrons - no valid bucket item IDs found`);
                return false;
            }
            
            console.debug('Attempting to remove items from bucket:', itemIds);
            
            const result = await this.bucketService.removePatronsFromPatronBucket(itemIds);
            
            console.debug('Remove operation result:', result);
            this.toast.success($localize`${patrons.length} patron(s) removed from bucket`);
            this.grid.reload();
            return true;
        } catch (err) {
            console.error('Error removing patrons from bucket:', err);
            
            if (err.message && err.message.includes('CONTAINER_USER_BUCKET_ITEM_NOT_FOUND')) {
                console.log('Some items were not found in bucket. They may have been already removed.');
                this.toast.success($localize`Patrons removed from bucket`);
                this.grid.reload();
                return true;
            }
            
            this.toast.danger($localize`Error removing patrons: ${err.message || err}`);
            return false;
        } finally {
            setTimeout(() => this.grid.reload(), 100);
        }
    }

    async editSelectedPatrons(patrons: IdlObject[]): Promise<void> {
        if (!patrons.length || !this.hasUpdatePerm) return;

        if (patrons.length === 1) {
            const patron = patrons[0];
            const url = `/eg2/staff/circ/patron/${patron.id()}/edit`;
            window.open(url, '_blank');
        } else {
            patrons.forEach((patron, index) => {
                const url = `/eg2/staff/circ/patron/${patron.id()}/edit`;
                const windowName = `edit_patron_${patron.id()}_${index}`;
                const windowFeatures = 'width=1024,height=768,resizable=yes,scrollbars=yes';
                window.open(url, windowName, windowFeatures);
            });
        }
    }

    async moveAddToBucket(patrons: IdlObject[], remove = false): Promise<void> {
        // Accepts an array of selected patrons (from grid selection)
        if (!patrons || !patrons.length) return;

        // Extract patron IDs directly from the patron objects
        const userIds = patrons.map(patron => patron.id()).filter(id => id !== null);

        if (userIds.length === 0) {
            this.toast.danger($localize`Unable to add patrons - no valid IDs found`);
            return;
        }

        console.debug('Adding users to bucket with IDs:', userIds);

        try {
            if (!this.itemTransferDialog) {
                const modalRef = this.modal.open(BucketItemTransferDialogComponent, {
                    size: 'lg'
                });

                const dialogInstance = modalRef.componentInstance as BucketItemTransferDialogComponent;
                dialogInstance.bucketClass = 'user';
                dialogInstance.bucketType = 'staff_client';
                // Always assign a new array reference to trigger Angular change detection
                dialogInstance.itemIds = [...userIds];
                dialogInstance.operationType = remove ? 'move' : 'add';
                // Force header update for correct plurality/count
                dialogInstance.setDialogHeader();

                const result = await modalRef.result;

                if (result && result.success && remove) {
                    const removeResult = await this.bucketService.removePatronsFromPatronBucket(
                        patrons.map(p => p._bucket_item_id).filter(id => id)
                    );
                    if (removeResult && removeResult.success) {
                        this.toast.success($localize`Patrons successfully moved to another bucket`);
                    } else {
                        this.toast.warning(
                            $localize`Patrons were copied to the destination bucket but could not be removed from the source bucket`
                        );
                    }
                } else if (result && result.success) {
                    this.toast.success($localize`Patrons copied to selected bucket`);
                }
            } else {
                // Always assign a new array reference to trigger Angular change detection
                this.itemTransferDialog.bucketClass = 'user';
                this.itemTransferDialog.bucketType = 'staff_client';
                this.itemTransferDialog.itemIds = [...userIds];
                this.itemTransferDialog.operationType = remove ? 'move' : 'add';
                this.itemTransferDialog.setDialogHeader();

                const result = await lastValueFrom(this.itemTransferDialog.open({size: 'lg'}));

                if (result && result.success && remove) {
                    const removeResult = await this.bucketService.removePatronsFromPatronBucket(
                        patrons.map(p => p._bucket_item_id).filter(id => id)
                    );
                    if (removeResult && removeResult.success) {
                        this.toast.success($localize`Patrons successfully moved to another bucket`);
                    } else {
                        this.toast.warning(
                            $localize`Patrons were copied to the destination bucket but could not be removed from the source bucket`
                        );
                    }
                } else if (result && result.success) {
                    this.toast.success($localize`Patrons copied to selected bucket`);
                }
            }

            this.grid.reload();
        } catch (error) {
            // Improved error handling for dialog dismissals
            const isDismissal = 
                error === 'dismiss' || // Direct dismiss string
                error === 'backdrop click' || // Click outside modal
                error === 'escape' || // ESC key pressed
                (error && error.name === 'EmptyError') || // RxJS EmptyError (from lastValueFrom)
                (typeof error === 'object' && error !== null && 'type' in error && error.type === 'dismiss');
            
            if (!isDismissal) {
                console.error('Error in add to bucket dialog:', error);
                this.toast.danger($localize`Error processing bucket operation: ${error.message || error}`);
            } else {
                // User canceled the operation - this is normal, just log it
                console.debug('Dialog dismissed by user:', error);
            }
        }
    }

    openAddPatronDialog() {
        if (!this.addPatronDialog) {
            const modalRef = this.modal.open(PatronBucketAddDialogComponent, {
                size: 'xl',
                windowClass: 'patron-bucket-dialog-wide'
            });
            const dialog = modalRef.componentInstance as PatronBucketAddDialogComponent;
            dialog.bucketId = this.bucketId;
            
            modalRef.result.then(result => {
                if (result) {
                    this.grid.reload();
                }
            }, () => {
            });
        } else {
            this.addPatronDialog.bucketId = this.bucketId;
            this.addPatronDialog.open({size: 'xl'}).subscribe(result => {
                if (result) {
                    this.grid.reload();
                }
            });
        }
    }

    // Update this method to open the barcode upload dialog properly
    openBarcodeUploadDialog() {
        try {
            if (!this.uploadBarcodeDialog) {
                console.warn('Upload dialog component reference not found, creating programmatically');
                // Fallback to creating the dialog programmatically
                const modalRef = this.modal.open(PatronBarcodeUploadComponent, {
                    size: 'lg',
                    backdrop: 'static', // Prevent closing on backdrop click
                    keyboard: true      // Allow ESC to close
                });
                const dialog = modalRef.componentInstance as PatronBarcodeUploadComponent;
                dialog.bucketId = this.bucketId;
                
                modalRef.result.then(result => {
                    if (result && result.success) {
                        console.debug('Upload dialog returned success:', result);
                        this.refreshGridData();
                    }
                }, reason => {
                    console.debug('Upload dialog dismissed:', reason);
                });
            } else {
                console.debug('Using existing upload dialog reference');
                // Set bucketId before opening
                this.uploadBarcodeDialog.bucketId = this.bucketId;
                
                // Open the dialog with improved error handling
                try {
                    this.uploadBarcodeDialog.open({
                        size: 'lg',
                        backdrop: 'static',
                        keyboard: true
                    }).subscribe({
                        next: (result) => {
                            if (result && result.success) {
                                console.debug('Upload dialog returned success:', result);
                                this.refreshGridData();
                            }
                        },
                        error: (err) => {
                            console.error('Error from upload dialog:', err);
                        }
                    });
                } catch (innerError) {
                    console.error('Error opening dialog through reference:', innerError);
                    // Fallback to programmatic approach
                    this.uploadBarcodeDialog = null;
                    this.openBarcodeUploadDialog();
                }
            }
        } catch (error) {
            console.error('Error opening patron barcode upload dialog:', error);
            this.toast.danger($localize`Error opening upload dialog: ${error.message || error}`);
        }
    }

    updateAllPatrons() {
        try {
            if (!this.batchEditDialog) {
                console.debug('Creating batch edit dialog programmatically');
                // Create dialog programmatically if not available via ViewChild
                const modalRef = this.modal.open(PatronBucketBatchEditComponent, {
                    size: 'lg',
                    backdrop: 'static'
                });
                
                const dialog = modalRef.componentInstance as PatronBucketBatchEditComponent;
                dialog.bucketId = this.bucketId;
                
                modalRef.result.then(result => {
                    if (result && result.success) {
                        console.debug('Batch edit completed successfully');
                        this.refreshGridData();
                    }
                }, () => {
                    // Dialog dismissed
                    console.debug('Batch edit dialog dismissed');
                });
            } else {
                console.debug('Using existing batch edit dialog reference');
                this.batchEditDialog.bucketId = this.bucketId;
                this.batchEditDialog.open({size: 'lg'}).subscribe({
                    next: (result) => {
                        if (result && result.success) {
                            console.debug('Batch edit completed successfully');
                            this.refreshGridData();
                        }
                    },
                    error: (err) => {
                        console.error('Error from batch edit dialog:', err);
                    }
                });
            }
        } catch (error) {
            console.error('Error opening batch edit dialog:', error);
            this.toast.danger($localize`Error opening batch edit dialog: ${error.message || error}`);
        }
    }

    modifyStatcats() {
        this.alertDialog.dialogTitle = $localize`Not Implemented`;
        this.alertDialog.dialogBody = $localize`Modify Statistical Categories functionality is not implemented yet.`;
        this.alertDialog.open();
    }

    viewChangeset() {
        try {
            const modalRef = this.modal.open(PatronBucketChangesetsComponent, {
                size: 'lg',
                backdrop: 'static'
            });
            
            const dialog = modalRef.componentInstance as PatronBucketChangesetsComponent;
            dialog.bucketId = this.bucketId;
            
            modalRef.result.then(
                () => {
                    // Dialog closed normally
                    console.debug('Changesets dialog closed');
                }, 
                () => {
                    // Dialog dismissed
                    console.debug('Changesets dialog dismissed');
                }
            );
        } catch (error) {
            console.error('Error opening changesets dialog:', error);
            this.toast.danger($localize`Error opening changesets dialog: ${error.message || error}`);
        }
    }

    applyRollback() {
        this.alertDialog.dialogTitle = $localize`Not Implemented`;
        this.alertDialog.dialogBody = $localize`Apply Rollback functionality is not implemented yet.`;
        this.alertDialog.open();
    }

    deleteAllPatrons() {
        this.alertDialog.dialogTitle = $localize`Not Implemented`;
        this.alertDialog.dialogBody = $localize`Delete All Patrons functionality is not implemented yet.`;
        this.alertDialog.open();
    }

    openBarcodesPasteDialog() {
        this.alertDialog.dialogTitle = $localize`Not Implemented`;
        this.alertDialog.dialogBody = $localize`Paste Barcodes functionality is not implemented yet.`;
        this.alertDialog.open();
    }

    onPatronAdded() {
        this.refreshGridData();
    }

    refreshGridData() {
        if (!this.grid) {
            console.warn('Grid component not available for refresh');
            return;
        }
        
        console.debug('Forcing grid data refresh');
        
        try {
            if (this.flatData['clearGridCache']) {
                this.flatData['clearGridCache'](this.grid.context);
            }
        } catch (e) {
            console.warn('Failed to clear grid cache:', e);
        }
        
        this.grid.reload();
    }
}
