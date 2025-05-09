import {Component, OnInit, Input, Output, EventEmitter, ViewChild, ElementRef} from '@angular/core';
import {lastValueFrom, of} from 'rxjs';
import {catchError, toArray, defaultIfEmpty} from 'rxjs/operators';
import {AuthService} from '@eg/core/auth.service';
import {NetService} from '@eg/core/net.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {EventService} from '@eg/core/event.service';
import {ToastService} from '@eg/share/toast/toast.service';
import {AlertDialogComponent} from '@eg/share/dialog/alert.component';
import {ProgressDialogComponent} from '@eg/share/dialog/progress.component';
import {PatronBucketService} from './bucket.service';
import {ɵ$localize as $localize} from '@angular/localize';

@Component({
    selector: 'eg-patron-bucket-quick-add',
    templateUrl: 'quick-add.component.html',
    styleUrls: ['quick-add.component.css']
})
export class PatronBucketQuickAddComponent implements OnInit {
    @Input() bucketId: number;
    @Output() patronAdded = new EventEmitter<boolean>();
    
    quickAddBarcode: string = '';
    quickAddCount = 0;
    fileUploadCount = 0;
    duplicatesFound = 0;
    
    @ViewChild('barcodeInput') barcodeInput: ElementRef;
    @ViewChild('alertDialog') alertDialog: AlertDialogComponent;
    @ViewChild('progressDialog') progressDialog: ProgressDialogComponent;

    constructor(
        private auth: AuthService,
        private net: NetService,
        private evt: EventService,
        private pcrud: PcrudService,
        private toast: ToastService,
        private bucketService: PatronBucketService
    ) {}

    ngOnInit() {}

    // New public method to trigger file upload dialog
    openFileUploadDialog(): void {
        setTimeout(() => {
            if (this.barcodeInput) {
                this.barcodeInput.nativeElement.click();
            }
        }, 0);
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
                // Check if patron already exists in the bucket
                const existingItems = await this.bucketService.checkPatronInBucket(this.bucketId, patron.id());
                
                if (existingItems && existingItems.length > 0) {
                    this.duplicatesFound++;
                    this.toast.warning($localize`Patron with barcode "${this.quickAddBarcode}" is already in this bucket`);
                    this.quickAddBarcode = '';
                    this.focusBarcodeInput();
                    return;
                }
                
                // Add patron to the bucket
                const addResult = await this.bucketService.addPatronsToPatronBucket(
                    this.bucketId, 
                    [patron.id()]
                );
                
                if (addResult.added > 0) {
                    this.quickAddCount++;
                    const patronName = patron.family_name() + ', ' + patron.first_given_name();
                    this.toast.success($localize`Added patron "${patronName}" to bucket`);
                    
                    this.quickAddBarcode = '';
                    this.patronAdded.emit(true);
                } else if (addResult.alreadyInBucket > 0) {
                    this.duplicatesFound++;
                    this.toast.warning($localize`Patron with barcode "${this.quickAddBarcode}" is already in this bucket`);
                }
                
            } catch (innerError) {
                console.error('Error in bucket operations:', innerError);
                this.toast.danger($localize`Error processing request: ${innerError.message || innerError}`);
            }
            
            this.focusBarcodeInput();
            
        } catch (error) {
            console.error('Error in quick add patron:', error);
            this.toast.danger($localize`Error adding patron: ${error.message || error}`);
        } finally {
            this.progressDialog.close();
            this.focusBarcodeInput();
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
                        // Fix: Use toArray and defaultIfEmpty to handle empty results
                        const existingItems = await lastValueFrom(
                            this.pcrud.search('cubi', {
                                bucket: this.bucketId,
                                target_user: response.id()
                            }).pipe(
                                toArray(),
                                defaultIfEmpty([]),
                                catchError(err => {
                                    console.error(`Error checking if patron with barcode ${barcode} is in bucket:`, err);
                                    return of([]);
                                })
                            )
                        );
                        
                        if (existingItems && existingItems.length > 0) {
                            duplicates++;
                            continue;
                        }
                        
                        // FIX: Use bucket service instead of direct API call
                        try {
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
                        } catch (err) {
                            console.error(`Error adding patron with barcode ${barcode}:`, err);
                            errors++;
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
                this.patronAdded.emit(true);
            }
            
            if (duplicates > 0) {
                this.toast.info($localize`${duplicates} patron(s) were already in the bucket.`);
            }
            
            if (errors > 0) {
                this.toast.warning($localize`${errors} barcode(s) could not be processed.`);
            }
            
        } catch (error) {
            this.progressDialog.close();
            console.error('Error processing barcode file:', error);
            this.toast.danger($localize`Error processing barcode file: ${error.message || error}`);
            
            event.target.value = '';
        }
    }
    
    openBarcodesPasteDialog() {
        this.alertDialog.dialogTitle = $localize`Feature Not Available`;
        this.alertDialog.dialogBody = $localize`The "Paste Barcodes" feature is coming soon and is not yet implemented. Please use the "Upload Barcode File" option instead.`;
        this.alertDialog.open();
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

    private focusBarcodeInput(): void {
        setTimeout(() => {
            if (this.barcodeInput) {
                this.barcodeInput.nativeElement.focus();
            }
        }, 100);
    }
}
