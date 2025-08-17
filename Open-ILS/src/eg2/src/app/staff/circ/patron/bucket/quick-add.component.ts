import {Component, OnInit, Input, Output, EventEmitter, ViewChild, ElementRef} from '@angular/core';
import {ToastService} from '@eg/share/toast/toast.service';
import {AlertDialogComponent} from '@eg/share/dialog/alert.component';
import {ProgressDialogComponent} from '@eg/share/dialog/progress.component';
import {PatronBucketService} from './patron-bucket.service';
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
            
            const result = await this.bucketService.addPatronByBarcode(
                this.bucketId, 
                this.quickAddBarcode.trim()
            );
            
            if (!result.success) {
                this.alertDialog.dialogTitle = result.errorTitle || $localize`Error`;
                this.alertDialog.dialogBody = result.error;
                await this.alertDialog.open();
                return;
            }
            
            if (result.duplicate) {
                this.duplicatesFound++;
                this.toast.warning($localize`Patron with barcode "${this.quickAddBarcode}" is already in this bucket`);
            } else if (result.added) {
                this.quickAddCount++;
                this.toast.success($localize`Added patron "${result.patronName}" to bucket`);
                this.patronAdded.emit(true);
            }
            
            this.quickAddBarcode = '';
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
            this.progressDialog.dialogTitle = $localize`Processing Barcodes`;
            
            const fileContent = await this.readFileContents(file);
            
            const result = await this.bucketService.processBarcodeFile(
                this.bucketId,
                fileContent,
                (progress) => {
                    this.progressDialog.update({
                        value: progress.value,
                        max: progress.max,
                    });
                }
            );
            
            event.target.value = '';
            
            this.fileUploadCount += result.added;
            this.duplicatesFound += result.duplicates;
            
            this.progressDialog.close();
            
            if (result.added > 0) {
                this.toast.success($localize`Added ${result.added} patron(s) to bucket from file.`);
                this.patronAdded.emit(true);
            }
            
            if (result.duplicates > 0) {
                this.toast.info($localize`${result.duplicates} patron(s) were already in the bucket.`);
            }
            
            if (result.errors > 0) {
                this.toast.warning($localize`${result.errors} barcode(s) could not be processed.`);
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