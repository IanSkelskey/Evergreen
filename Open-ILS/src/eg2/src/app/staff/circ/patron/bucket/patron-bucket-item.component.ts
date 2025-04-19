import {Component, OnInit, OnDestroy, ViewChild, ElementRef} from '@angular/core';
import {Router, ActivatedRoute} from '@angular/router';
import {firstValueFrom, lastValueFrom, EMPTY, Subject} from 'rxjs';
import {catchError, takeUntil} from 'rxjs/operators';
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
import {PatronBucketService} from './patron-bucket.service';
import {PatronBucketAddDialogComponent} from './patron-bucket-add-dialog.component';
import {BucketDialogComponent} from '@eg/staff/share/buckets/bucket-dialog.component';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {Pager} from '@eg/share/util/pager';

@Component({
    selector: 'eg-patron-bucket-item',
    templateUrl: 'patron-bucket-item.component.html',
    styleUrls: ['patron-bucket-item.component.css']
})

export class PatronBucketItemComponent implements OnInit, OnDestroy {
    bucketId: number;
    bucket: IdlObject;
    returnTo: string;
    dataSource: GridDataSource = new GridDataSource();
    cellTextGenerator: GridCellTextGenerator;
    noSelectedRows = true;
    oneSelectedRow = false;
    hasUpdatePerm = false;
    hasDeletePerm = false;
    quickAddBarcode: string = '';
    @ViewChild('barcodeInput') barcodeInput: ElementRef;

    @ViewChild('grid', { static: true }) grid: GridComponent;
    @ViewChild('confirmDialog') confirmDialog: ConfirmDialogComponent;
    @ViewChild('alertDialog') alertDialog: AlertDialogComponent;
    @ViewChild('addToBucketDialog') addToBucketDialog: BucketDialogComponent;
    @ViewChild('progressDialog') progressDialog: ProgressDialogComponent;
    @ViewChild('addPatronDialog') private addPatronDialog: PatronBucketAddDialogComponent;
    
    private destroy$ = new Subject<void>();
    
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
            'barcode': row => row['target_user']?.card()?.barcode() // Correctly access barcode
        };

        // Check permissions
        this.perm.hasWorkPermAt(['UPDATE_USER']).then(result => this.hasUpdatePerm = !!result);
        this.perm.hasWorkPermAt(['DELETE_USER']).then(result => this.hasDeletePerm = !!result);

        this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
            this.bucketId = +params.get('id');
            this.bucketService.logPatronBucket(this.bucketId);
            this.initDataSource(this.bucketId);
            this.gridSelectionChange([]);
            
            // Fetch bucket with owner information
            this.pcrud.retrieve('cub', this.bucketId, 
                {flesh: 1, flesh_fields: {cub: ['owner']}}
            ).subscribe({
                next: bucket => { 
                    console.debug('Retrieved bucket with owner:', bucket);
                    this.bucket = bucket; 
                },
                error: err => {
                    console.error('Error loading bucket:', err);
                    this.toast.danger($localize`Error loading bucket: ${err.message || err}`);
                }
            });
        });

        this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
            this.returnTo = params.returnTo;
        });
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
        this.dataSource.getRows = (pager: Pager, sort: any[]) => {
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

            return this.flatData.getRows(this.grid.context, query, pager, sort);
        };
    }

    async removeFromBucket(rows: any[]): Promise<boolean> {
        if (!rows.length) return false;
        
        try {
            // Extract the bucket item IDs from the rows
            const itemIds = rows.map(row => row.id);
            console.debug('Attempting to remove items from bucket:', itemIds);
            
            // Use the service's method which handles the delete operation properly
            const result = await this.bucketService.removePatronsFromPatronBucket(this.bucketId, itemIds);
            
            // Handle success
            console.debug('Remove operation result:', result);
            this.toast.success($localize`${rows.length} patron(s) removed from bucket`);
            this.grid.reload();
            return true;
        } catch (err) {
            console.error('Error removing patrons from bucket:', err);
            
            // Special handling for "item not found" errors - treat as success if some were removed
            if (err.message && err.message.includes('CONTAINER_USER_BUCKET_ITEM_NOT_FOUND')) {
                console.log('Some items were not found in bucket. They may have been already removed.');
                this.toast.success($localize`Patrons removed from bucket`);
                this.grid.reload();
                return true;
            }
            
            this.toast.danger($localize`Error removing patrons: ${err.message || err}`);
            return false;
        } finally {
            // Force reload of the grid to reflect changes
            setTimeout(() => this.grid.reload(), 100);
        }
    }

    async editSelectedPatrons(rows: any[]): Promise<void> {
        if (!rows.length || !this.hasUpdatePerm) return;

        if (rows.length === 1) {
            // Open single patron edit in a new tab
            const row = rows[0];
            const url = `/eg2/staff/circ/patron/${row.target_user.id()}/edit`;
            window.open(url, '_blank');
        } else {
            // Attempt to open multiple patron edit pages in new windows
            // Note: Browser pop-up blockers might prevent multiple windows from opening.
            rows.forEach((row, index) => {
                const url = `/eg2/staff/circ/patron/${row.target_user.id()}/edit`;
                // Use unique names and features to encourage opening in new windows
                const windowName = `edit_patron_${row.target_user.id()}_${index}`;
                const windowFeatures = 'width=1024,height=768,resizable=yes,scrollbars=yes';
                window.open(url, windowName, windowFeatures);
            });
        }
    }

    async moveAddToBucket(rows: any[], remove = false): Promise<void> {
        if (!rows.length) return;
        
        this.addToBucketDialog.bucketClass = 'user';
        this.addToBucketDialog.itemIds = rows.map(row => row['target_user']);
        
        try {
            const dialogObservable = this.addToBucketDialog.open({size: 'lg'}).pipe(
                catchError((error: unknown) => {
                    console.error('Error in dialog observable:', error);
                    return EMPTY;
                })
            );
            
            const results = await lastValueFrom(dialogObservable, { defaultValue: null });
            if (results) {
                if (remove) {
                    await this.removeFromBucket(rows);
                }
                this.grid.reload();
            }
        } catch (error) {
            console.error('Error in add to bucket dialog:', error);
        }
    }

    // Add a new method to open the add patron dialog
    openAddPatronDialog() {
        if (!this.addPatronDialog) {
            // Create dialog programmatically if ViewChild not available
            const modalRef = this.modal.open(PatronBucketAddDialogComponent, {
                size: 'xl', // Changed from 'lg' to 'xl'
                windowClass: 'patron-bucket-dialog-wide'
            });
            const dialog = modalRef.componentInstance as PatronBucketAddDialogComponent;
            dialog.bucketId = this.bucketId;
            
            modalRef.result.then(result => {
                if (result) {
                    this.grid.reload();
                }
            }, () => {
                // Dialog dismissed
            });
        } else {
            // Use ViewChild reference
            this.addPatronDialog.bucketId = this.bucketId;
            this.addPatronDialog.open({size: 'xl'}).subscribe(result => {
                if (result) {
                    this.grid.reload();
                }
            });
        }
    }

    /**
     * Quickly add a patron to the bucket by barcode
     */
    async quickAddPatron(): Promise<void> {
        if (!this.quickAddBarcode || this.quickAddBarcode.trim() === '') {
            return;
        }

        try {
            this.progressDialog.open();
            
            // First get the patron by barcode
            const response = await lastValueFrom(
                this.net.request(
                    'open-ils.actor',
                    'open-ils.actor.user.fleshed.retrieve_by_barcode',
                    this.auth.token(),
                    this.quickAddBarcode.trim()
                ).pipe(
                    catchError(err => {
                        console.error('Error fetching patron:', err);
                        return [null];
                    })
                )
            );

            if (!response) {
                this.alertDialog.dialogTitle = $localize`Patron Not Found`;
                this.alertDialog.dialogBody = $localize`No patron found with barcode "${this.quickAddBarcode}"`;
                await this.alertDialog.open();
                return;
            }

            const evt = this.evt.parse(response);
            if (evt) {
                console.error('Error retrieving patron:', evt);
                this.alertDialog.dialogTitle = $localize`Error Finding Patron`;
                this.alertDialog.dialogBody = evt.toString();
                await this.alertDialog.open();
                return;
            }

            const patron = response;
            
            try {
                // Check if patron is already in bucket using pcrud
                // This replaces the call to the non-existent open-ils.actor.container.item.retrieve
                const existingItems = await lastValueFrom(
                    this.pcrud.search('cubi', {
                        bucket: this.bucketId,
                        target_user: patron.id()
                    }).pipe(
                        catchError(err => {
                            console.error('Error checking if patron is in bucket:', err);
                            return [null];
                        })
                    )
                );

                if (existingItems && existingItems.length > 0) {
                    this.toast.warning($localize`Patron with barcode "${this.quickAddBarcode}" is already in this bucket`);
                    this.quickAddBarcode = '';
                    setTimeout(() => {
                        if (this.barcodeInput) {
                            this.barcodeInput.nativeElement.focus();
                        }
                    }, 100);
                    return;
                }
                
                // Use the bucket service to add the patron
                try {
                    const addResult = await this.bucketService.addPatronsToPatronBucket(
                        this.bucketId, 
                        [patron.id()]
                    );
                    
                    // Check for error response
                    const addEvt = this.evt.parse(addResult);
                    if (addEvt) {
                        console.error('Error adding patron to bucket:', addEvt);
                        this.alertDialog.dialogTitle = $localize`Error Adding Patron`;
                        this.alertDialog.dialogBody = addEvt.toString();
                        await this.alertDialog.open();
                        return;
                    }
                    
                    this.toast.success($localize`Added patron "${patron.family_name()}, ${patron.first_given_name()}" to bucket`);
                    this.quickAddBarcode = ''; // Clear the input
                    this.grid.reload();
                } catch (error) {
                    console.error('Error adding patron to bucket:', error);
                    this.alertDialog.dialogTitle = $localize`Error Adding Patron`;
                    this.alertDialog.dialogBody = error.message || String(error);
                    await this.alertDialog.open();
                    return;
                }
                
            } catch (innerError) {
                console.error('Error in bucket operations:', innerError);
                this.toast.danger($localize`Error processing request: ${innerError.message || innerError}`);
            }
            
            // Focus back on the input field for the next scan
            setTimeout(() => {
                if (this.barcodeInput) {
                    this.barcodeInput.nativeElement.focus();
                }
            }, 100);
            
        } catch (error) {
            console.error('Error in quick add patron:', error);
            this.toast.danger($localize`Error adding patron: ${error.message || error}`);
            
            // Still focus back on input for next attempt
            setTimeout(() => {
                if (this.barcodeInput) {
                    this.barcodeInput.nativeElement.focus();
                }
            }, 100);
        } finally {
            this.progressDialog.close();
        }
    }

    // Bulk action methods
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
}
