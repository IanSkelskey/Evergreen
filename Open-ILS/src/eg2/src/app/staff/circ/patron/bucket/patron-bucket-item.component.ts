import {Component, OnInit, OnDestroy, ViewChild, ElementRef} from '@angular/core';
import {Router, ActivatedRoute} from '@angular/router';
import {lastValueFrom, EMPTY, Subject} from 'rxjs';
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
import {NgbModal, NgbTooltipModule} from '@ng-bootstrap/ng-bootstrap';
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
    // Add counters for the current session
    quickAddCount = 0;
    fileUploadCount = 0;
    duplicatesFound = 0;
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
            const itemIds = rows.map(row => {
                // Ensure we have a valid ID - it should be a number
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
        
        // Extract the numeric user IDs instead of passing the whole user object
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

    /**
     * Open the patron search dialog for adding patrons to the bucket.
     * This method allows adding multiple patrons at once directly from search results.
     * It's the primary recommended way to add patrons to a bucket.
     */
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
     * Quickly add a single patron to the bucket by barcode.
     * This method is ideal for scanning physical patron cards one at a time.
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
                // Define expected/common errors that don't need to be logged to console
                const expectedErrors = ['ACTOR_CARD_NOT_FOUND', 'ACTOR_USER_NOT_FOUND', 'ACTOR_CARD_INACTIVE'];
                
                // Only log to console if it's not an expected error
                if (!expectedErrors.includes(evt.textcode)) {
                    console.error('Error retrieving patron:', evt);
                }
                
                // Provide user-friendly messages based on specific error codes
                let errorTitle = $localize`Error Finding Patron`;
                let errorMessage: string;
                
                switch(evt.textcode) {
                    case 'ACTOR_CARD_NOT_FOUND':
                        errorMessage = $localize`No patron found with barcode "${this.quickAddBarcode}".`;
                        break;
                    case 'ACTOR_USER_NOT_FOUND':
                        errorMessage = $localize`The patron associated with barcode "${this.quickAddBarcode}" could not be found.`;
                        break;
                    case 'NO_SESSION':
                        errorTitle = $localize`Session Expired`;
                        errorMessage = $localize`Your session has expired. Please log in again.`;
                        break;
                    case 'ACTOR_USER_BARRED':
                        errorMessage = $localize`This patron account is barred. Barcode: ${this.quickAddBarcode}`;
                        break;
                    case 'ACTOR_CARD_INACTIVE':
                        errorMessage = $localize`This patron card is marked as inactive. Barcode: ${this.quickAddBarcode}`;
                        break;
                    default:
                        errorMessage = $localize`Unable to retrieve patron with barcode "${this.quickAddBarcode}". Error: ${evt.desc || evt.textcode}`;
                }
                
                this.alertDialog.dialogTitle = errorTitle;
                this.alertDialog.dialogBody = errorMessage;
                await this.alertDialog.open();
                return;
            }

            const patron = response;
            
            try {
                // Check if patron is already in bucket using pcrud
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
                    this.duplicatesFound++;
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
                    
                    // Update count and show success message
                    this.quickAddCount++;
                    const patronName = patron.family_name() + ', ' + patron.first_given_name();
                    this.toast.success($localize`Added patron "${patronName}" to bucket`);
                    
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
        } finally {
            this.progressDialog.close();
            
            // Always focus back on the input field, regardless of success or failure
            setTimeout(() => {
                if (this.barcodeInput) {
                    this.barcodeInput.nativeElement.focus();
                }
            }, 100);
        }
    }

    /**
     * Handle the barcode file upload.
     * This method allows processing multiple barcodes at once from a text file.
     * Each line in the file should contain a single barcode.
     */
    async handleBarcodeFileUpload(event: any): Promise<void> {
        if (!event.target.files || event.target.files.length === 0) {
            return;
        }
        
        const file = event.target.files[0];
        try {
            this.progressDialog.open();
            
            // Read the file
            const fileContent = await this.readFileContents(file);
            
            // Process the barcodes
            const barcodes = fileContent
                .split(/[\r\n]+/) // Split by line breaks (handles both CRLF and LF)
                .map(line => line.trim())
                .filter(line => line.length > 0);
            
            if (barcodes.length === 0) {
                this.toast.warning($localize`No barcodes found in the uploaded file.`);
                this.progressDialog.close();
                return;
            }
            
            let processed = 0;
            let added = 0;
            let errors = 0;
            let duplicates = 0;
            
            this.progressDialog.dialogTitle = $localize`Processing Barcodes`;
            
            // Process barcodes one by one
            for (const barcode of barcodes) {
                try {
                    const response = await lastValueFrom(this.net.request(
                        'open-ils.actor',
                        'open-ils.actor.user.fleshed.retrieve_by_barcode',
                        this.auth.token(),
                        barcode
                    ));
                    
                    processed++;
                    this.progressDialog.update({
                        value: processed,
                        max: barcodes.length,
                    });
                    
                    // Check for API error
                    const evt = this.evt.parse(response);
                    if (evt) {
                        console.warn(`Error for barcode ${barcode}:`, evt);
                        errors++;
                        continue;
                    }
                    
                    // Response should be the patron
                    if (response && response.id()) {
                        // Check if patron is already in bucket
                        const existingItems = await lastValueFrom(
                            this.pcrud.search('cubi', {
                                bucket: this.bucketId,
                                target_user: response.id()
                            })
                        );
                        
                        if (existingItems && existingItems.length > 0) {
                            // Count duplicates but don't treat as error
                            duplicates++;
                            continue;
                        }
                        
                        // Add to bucket
                        const addResult = await this.bucketService.addPatronsToPatronBucket(
                            this.bucketId, 
                            [response.id()]
                        );
                        
                        // Check for error
                        const addEvt = this.evt.parse(addResult);
                        if (addEvt) {
                            console.warn(`Error adding patron with barcode ${barcode}:`, addEvt);
                            errors++;
                        } else {
                            added++;
                        }
                    }
                } catch (error) {
                    console.error(`Error processing barcode ${barcode}:`, error);
                    errors++;
                }
            }
            
            // Reset the file input
            event.target.value = '';
            
            // Update counters
            this.fileUploadCount += added;
            this.duplicatesFound += duplicates;
            
            // Show results
            this.progressDialog.close();
            if (added > 0) {
                this.toast.success($localize`Added ${added} patron(s) to bucket from file.`);
            }
            
            if (duplicates > 0) {
                this.toast.info($localize`${duplicates} patron(s) were already in the bucket.`);
            }
            
            if (errors > 0) {
                this.toast.warning($localize`${errors} barcode(s) could not be processed.`);
            }
            
            // Reload the grid
            this.grid.reload();
            
        } catch (error) {
            this.progressDialog.close();
            console.error('Error processing barcode file:', error);
            this.toast.danger($localize`Error processing barcode file: ${error.message || error}`);
            
            // Reset the file input
            event.target.value = '';
        }
    }

    /**
     * Helper function to read file contents
     */
    private readFileContents(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const contents = e.target.result as string;
                    resolve(contents);
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = (e) => {
                reject(new Error('Error reading file'));
            };
            
            reader.readAsText(file);
        });
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

    /**
     * Opens a dialog to allow pasting multiple patron barcodes.
     * This replaces the multi-barcode feature from the pending component.
     */
    openBarcodesPasteDialog() {
        // Show "not yet implemented" message
        this.alertDialog.dialogTitle = $localize`Feature Not Available`;
        this.alertDialog.dialogBody = $localize`The "Paste Barcodes" feature is coming soon and is not yet implemented. Please use the "Upload Barcode File" option instead.`;
        this.alertDialog.open();
    }
}
