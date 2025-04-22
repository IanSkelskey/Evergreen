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
    quickAddBarcode: string = '';
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

    async quickAddPatron(): Promise<void> {
        if (!this.quickAddBarcode || this.quickAddBarcode.trim() === '') {
            return;
        }

        try {
            this.progressDialog.open();
            
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
                const expectedErrors = ['ACTOR_CARD_NOT_FOUND', 'ACTOR_USER_NOT_FOUND', 'ACTOR_CARD_INACTIVE'];
                
                if (!expectedErrors.includes(evt.textcode)) {
                    console.error('Error retrieving patron:', evt);
                }
                
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
                
                try {
                    const addResult = await this.bucketService.addPatronsToPatronBucket(
                        this.bucketId, 
                        [patron.id()]
                    );
                    
                    const addEvt = this.evt.parse(addResult);
                    if (addEvt) {
                        console.error('Error adding patron to bucket:', addEvt);
                        this.alertDialog.dialogTitle = $localize`Error Adding Patron`;
                        this.alertDialog.dialogBody = addEvt.toString();
                        await this.alertDialog.open();
                        return;
                    }
                    
                    this.quickAddCount++;
                    const patronName = patron.family_name() + ', ' + patron.first_given_name();
                    this.toast.success($localize`Added patron "${patronName}" to bucket`);
                    
                    this.quickAddBarcode = '';
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
            
            setTimeout(() => {
                if (this.barcodeInput) {
                    this.barcodeInput.nativeElement.focus();
                }
            }, 100);
        }
    }

    async handleBarcodeFileUpload(event: any): Promise<void> {
        if (!event.target.files || event.target.files.length === 0) {
            return;
        }
        
        const file = event.target.files[0];
        try {
            this.progressDialog.open();
            
            const fileContent = await this.readFileContents(file);
            
            const barcodes = fileContent
                .split(/[\r\n]+/)
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
                    
                    const evt = this.evt.parse(response);
                    if (evt) {
                        console.warn(`Error for barcode ${barcode}:`, evt);
                        errors++;
                        continue;
                    }
                    
                    if (response && response.id()) {
                        const existingItems = await lastValueFrom(
                            this.pcrud.search('cubi', {
                                bucket: this.bucketId,
                                target_user: response.id()
                            })
                        );
                        
                        if (existingItems && existingItems.length > 0) {
                            duplicates++;
                            continue;
                        }
                        
                        const addResult = await this.bucketService.addPatronsToPatronBucket(
                            this.bucketId, 
                            [response.id()]
                        );
                        
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
            
            event.target.value = '';
            
            this.fileUploadCount += added;
            this.duplicatesFound += duplicates;
            
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
            
            this.grid.reload();
            
        } catch (error) {
            this.progressDialog.close();
            console.error('Error processing barcode file:', error);
            this.toast.danger($localize`Error processing barcode file: ${error.message || error}`);
            
            event.target.value = '';
        }
    }

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
        this.alertDialog.dialogTitle = $localize`Feature Not Available`;
        this.alertDialog.dialogBody = $localize`The "Paste Barcodes" feature is coming soon and is not yet implemented. Please use the "Upload Barcode File" option instead.`;
        this.alertDialog.open();
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
