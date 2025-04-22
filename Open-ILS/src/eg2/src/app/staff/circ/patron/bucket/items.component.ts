import {Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit} from '@angular/core';
import {Router, ActivatedRoute, NavigationEnd} from '@angular/router';
import {lastValueFrom, EMPTY, Subject} from 'rxjs';
import {catchError, takeUntil, filter} from 'rxjs/operators';
import {AuthService} from '@eg/core/auth.service';
import {IdlObject} from '@eg/core/idl.service';
import {NetService} from '@eg/core/net.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {OrgService} from '@eg/core/org.service';
import {EventService} from '@eg/core/event.service';
import {PermService} from '@eg/core/perm.service';
import {GridComponent} from '@eg/share/grid/grid.component';
import {GridDataSource, GridCellTextGenerator} from '@eg/share/grid/grid';
import {GridFlatDataService} from '@eg/share/grid/grid-flat-data.service';
import {ToastService} from '@eg/share/toast/toast.service';
import {ConfirmDialogComponent} from '@eg/share/dialog/confirm.component';
import {AlertDialogComponent} from '@eg/share/dialog/alert.component';
import {ProgressDialogComponent} from '@eg/share/dialog/progress.component';
import {PatronBucketService} from './bucket.service';
import {PatronBucketAddDialogComponent} from './add-dialog.component';
import {BucketDialogComponent} from '@eg/staff/share/buckets/bucket-dialog.component';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {Pager} from '@eg/share/util/pager';
import {PatronBarcodeUploadComponent} from './patron-barcode-upload.component';
import {ɵ$localize as $localize} from '@angular/localize';

@Component({
    selector: 'eg-patron-bucket-item',
    templateUrl: 'items.component.html',
    styleUrls: ['items.component.css']
})

export class PatronBucketItemComponent implements OnInit, OnDestroy, AfterViewInit {
    bucketId: number;
    bucket: IdlObject;
    returnTo: string;
    dataSource: GridDataSource = new GridDataSource();
    cellTextGenerator: GridCellTextGenerator;
    noSelectedRows = true;
    oneSelectedRow = false;
    hasUpdatePerm = false;
    hasDeletePerm = false;
    
    @ViewChild('grid', { static: true }) grid: GridComponent;
    @ViewChild('confirmDialog') confirmDialog: ConfirmDialogComponent;
    @ViewChild('alertDialog') alertDialog: AlertDialogComponent;
    @ViewChild('addToBucketDialog') addToBucketDialog: BucketDialogComponent;
    @ViewChild('progressDialog') progressDialog: ProgressDialogComponent;
    @ViewChild('addPatronDialog') private addPatronDialog: PatronBucketAddDialogComponent;
    @ViewChild('uploadBarcodeDialog') private uploadBarcodeDialog: PatronBarcodeUploadComponent;
    
    private destroy$ = new Subject<void>();
    isLoading = true;
    private currentUrl: string;
    private previousBucketId: number;

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
        private modal: NgbModal,
        private perm: PermService
    ) {}

    ngOnInit() {
        this.cellTextGenerator = {
            'family_name': row => row['family_name'],
            'first_given_name': row => row['first_given_name'],
            'barcode': row => row['target_user']?.card()?.barcode()
        };

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
            this.initDataSource(this.bucketId);
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

    initDataSource(bucketId: number) {
        console.debug('Initializing datasource for bucket ID:', bucketId);
        
        this.dataSource.getRows = (pager: Pager, sort: any[]) => {
            console.debug(`Grid getRows called - pager:`, pager, 'sort:', sort);
            
            const query: any = {
                bucket: bucketId
            };

            let queryFilters = [];
            if (this.dataSource.filters) {
                Object.keys(this.dataSource.filters).forEach(key => {
                    queryFilters = queryFilters.concat(this.dataSource.filters[key]);
                });

                if (queryFilters.length > 0) {
                    query['-and'] = queryFilters;
                }
            }

            console.debug('Grid query:', query);
            
            return this.flatData.getRows(this.grid.context, query, pager, sort)
                .pipe(
                    catchError(err => {
                        console.error('Error fetching bucket items:', err);
                        return [];
                    })
                );
        };
    }

    async removeFromBucket(rows: any[]): Promise<boolean> {
        if (!rows.length) return false;
        
        try {
            const itemIds = rows.map(row => {
                if (row.id === undefined || row.id === null) {
                    console.warn('Row missing id property:', row);
                    return null;
                }
                return Number(row.id);
            }).filter(id => id !== null);
            
            if (itemIds.length === 0) {
                this.toast.danger($localize`Unable to remove patrons - no valid item IDs found`);
                return false;
            }
            
            console.debug('Attempting to remove items from bucket:', itemIds);
            
            const result = await this.bucketService.removePatronsFromPatronBucket(this.bucketId, itemIds);
            
            console.debug('Remove operation result:', result);
            this.toast.success($localize`${rows.length} patron(s) removed from bucket`);
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

    async editSelectedPatrons(rows: any[]): Promise<void> {
        if (!rows.length || !this.hasUpdatePerm) return;

        if (rows.length === 1) {
            const row = rows[0];
            const url = `/eg2/staff/circ/patron/${row.target_user.id()}/edit`;
            window.open(url, '_blank');
        } else {
            rows.forEach((row, index) => {
                const url = `/eg2/staff/circ/patron/${row.target_user.id()}/edit`;
                const windowName = `edit_patron_${row.target_user.id()}_${index}`;
                const windowFeatures = 'width=1024,height=768,resizable=yes,scrollbars=yes';
                window.open(url, windowName, windowFeatures);
            });
        }
    }

    async moveAddToBucket(rows: any[], remove = false): Promise<void> {
        if (!rows.length) return;
        
        const userIds = rows.map(row => {
            if (row.target_user && typeof row.target_user.id === 'function') {
                return row.target_user.id();
            } else {
                console.warn('Invalid user object in row:', row);
                return null;
            }
        }).filter(id => id !== null);
        
        if (userIds.length === 0) {
            this.toast.danger($localize`Unable to add patrons - no valid IDs found`);
            return;
        }
        
        console.debug('Adding users to bucket with IDs:', userIds);
        
        this.addToBucketDialog.bucketClass = 'user';
        this.addToBucketDialog.itemIds = userIds;
        
        try {
            const dialogObservable = this.addToBucketDialog.open({
                size: 'lg'
            }).pipe(
                catchError((error: unknown) => {
                    console.error('Error in dialog observable:', error);
                    return EMPTY;
                })
            );
            
            const results = await lastValueFrom(dialogObservable, { defaultValue: null });
            if (results) {
                console.debug('Dialog returned success:', results);
                
                if (remove) {
                    console.debug('Attempting to remove patrons from source bucket...');
                    const removeResult = await this.removeFromBucket(rows);
                    console.debug('Remove result:', removeResult);
                    
                    if (removeResult) {
                        this.toast.success(
                            $localize`Patrons successfully moved to another bucket`
                        );
                    } else {
                        this.toast.warning(
                            $localize`Patrons were copied to the destination bucket but could not be removed from the source bucket`
                        );
                    }
                } else {
                    this.toast.success($localize`Patrons copied to selected bucket`);
                }
                this.grid.reload();
            }
        } catch (error) {
            console.error('Error in add to bucket dialog:', error);
            this.toast.danger($localize`Error processing bucket operation: ${error.message || error}`);
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
                // If the ViewChild reference doesn't exist yet, create it with the modal service
                const modalRef = this.modal.open(PatronBarcodeUploadComponent, {
                    size: 'lg'
                });
                const dialog = modalRef.componentInstance as PatronBarcodeUploadComponent;
                dialog.bucketId = this.bucketId;
                
                modalRef.result.then(result => {
                    if (result && result.success) {
                        console.debug('Upload dialog returned success:', result);
                        // Refresh the grid to show newly added patrons
                        this.refreshGridData();
                    }
                }, () => {
                    console.debug('Upload dialog dismissed');
                    // Dialog dismissed, no action needed
                });
            } else {
                // Use the existing reference, similar to how addPatronDialog is used
                this.uploadBarcodeDialog.bucketId = this.bucketId;
                this.uploadBarcodeDialog.open({size: 'lg'}).subscribe(result => {
                    if (result && result.success) {
                        console.debug('Upload dialog returned success:', result);
                        this.refreshGridData();
                    }
                });
            }
        } catch (error) {
            console.error('Error opening patron barcode upload dialog:', error);
            this.toast.danger($localize`Error opening upload dialog: ${error.message || error}`);
        }
    }

    updateAllPatrons() {
        this.alertDialog.dialogTitle = $localize`Not Implemented`;
        this.alertDialog.dialogBody = $localize`Update All Patrons functionality is not implemented yet.`;
        this.alertDialog.open();
    }

    modifyStatcats() {
        this.alertDialog.dialogTitle = $localize`Not Implemented`;
        this.alertDialog.dialogBody = $localize`Modify Statistical Categories functionality is not implemented yet.`;
        this.alertDialog.open();
    }

    viewChangesets() {
        this.alertDialog.dialogTitle = $localize`Not Implemented`;
        this.alertDialog.dialogBody = $localize`View Changesets functionality is not implemented yet.`;
        this.alertDialog.open();
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
