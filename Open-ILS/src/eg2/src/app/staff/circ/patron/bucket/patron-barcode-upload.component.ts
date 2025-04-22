import {Component, OnInit, Input, Output, EventEmitter, ViewChild, TemplateRef, ElementRef} from '@angular/core';
import {Observable, lastValueFrom, of} from 'rxjs';
import {catchError, toArray, defaultIfEmpty} from 'rxjs/operators';
import {AuthService} from '@eg/core/auth.service';
import {NetService} from '@eg/core/net.service';
import {EventService} from '@eg/core/event.service';
import {ToastService} from '@eg/share/toast/toast.service';
import {NgbModal, NgbModalRef} from '@ng-bootstrap/ng-bootstrap';
import {DialogComponent} from '@eg/share/dialog/dialog.component';
import {PatronBucketService} from './bucket.service';
import {ɵ$localize as $localize} from '@angular/localize';

interface PatronPreview {
  id: number;
  barcode: string;
  name: string;
  isDuplicate: boolean;
  error?: string;
  selected?: boolean; // New property for checkbox selection
}

@Component({
  selector: 'eg-patron-barcode-upload',
  templateUrl: './patron-barcode-upload.component.html',
  styleUrls: ['./patron-barcode-upload.component.css']
})
export class PatronBarcodeUploadComponent extends DialogComponent implements OnInit {
  @Input() bucketId: number;
  @Output() patronsAdded = new EventEmitter<{added: number, duplicates: number}>();
  
  @ViewChild('dialogContent') 
  dialogContent: TemplateRef<any>;
  
  @ViewChild('barcodeFileInput') 
  barcodeFileInput: ElementRef<HTMLInputElement>;
  
  selectedFile: File | null = null;
  fileContent: string = '';
  barcodes: string[] = [];
  patrons: PatronPreview[] = [];
  
  isLoading: boolean = false;
  loadingStep: string = '';
  progressValue: number = 0;
  progressMax: number = 100;
  
  hasPreviewedPatrons: boolean = false;
  fileHasChanged: boolean = true;
  
  stats = {
    totalBarcodes: 0,
    validBarcodes: 0,
    invalidBarcodes: 0,
    duplicates: 0,
    toBeAdded: 0
  };

  // New properties to support improved UI
  patronFilter: 'all' | 'valid' | 'duplicate' | 'invalid' = 'all';
  
  // Enhanced error message mapping with more user-friendly text
  private errorMessageMap: {[key: string]: string} = {
    'ACTOR_CARD_NOT_FOUND': $localize`No patron found with this barcode`,
    'NO_PATRON': $localize`Patron record not found`,
    'INVALID_BARCODE': $localize`Invalid barcode format`,
    'PERMISSION_DENIED': $localize`You don't have permission to access this patron`,
    'DATABASE_ERROR': $localize`Database error occurred`,
    'ACTOR_USER_NOT_FOUND': $localize`Patron account not found`,
    'DEFAULT': $localize`Could not process this barcode`
  };

  constructor(
    private modal: NgbModal,
    private auth: AuthService,
    private net: NetService,
    private evt: EventService,
    private toast: ToastService,
    private bucketService: PatronBucketService
  ) {
    super(modal);
  }

  ngOnInit(): void {
    // The DialogComponent parent class will automatically 
    // find the dialogContent ViewChild and use it
  }

  // Override the open method with correct return type - matching DialogComponent
  override open(options?: any) {
    this.resetPatronList();

    const dialogOptions = {
      ...options,
      size: 'lg',
      windowClass: 'patron-barcode-upload-dialog'
    };

    return super.open(dialogOptions);
  }

  onFileSelected(event: any): void {
    const files = event.target.files;
    if (files && files.length > 0) {
      this.selectedFile = files[0];
      this.resetPatronList();
      this.fileHasChanged = true;
      
      // Auto-preview the file immediately
      setTimeout(() => this.previewFile(), 0);
    } else {
      this.selectedFile = null;
      this.resetPatronList();
    }
  }
  
  resetPatronList(): void {
    this.fileContent = '';
    this.barcodes = [];
    this.patrons = [];
    this.hasPreviewedPatrons = false;
    this.stats = {
      totalBarcodes: 0,
      validBarcodes: 0,
      invalidBarcodes: 0,
      duplicates: 0,
      toBeAdded: 0
    };
    // Reset filter to 'all' when list is reset
    this.patronFilter = 'all';
  }

  async previewFile(): Promise<void> {
    if (!this.selectedFile) {
      this.toast.danger($localize`No file selected`);
      return;
    }

    // If we've already previewed this file and nothing has changed, don't preview again
    if (this.hasPreviewedPatrons && !this.fileHasChanged) {
      this.toast.info($localize`File has already been previewed. Select a different file to preview new patrons.`);
      return;
    }

    this.isLoading = true;
    this.loadingStep = $localize`Reading file`;
    this.progressValue = 0;
    this.progressMax = 100;
    
    // Reset the patron list before previewing to prevent duplicates
    this.resetPatronList();
    
    try {
      // Read the file content
      this.fileContent = await this.readFileContents(this.selectedFile);
      
      // Extract barcodes
      this.barcodes = this.fileContent
        .split(/[\r\n]+/)
        .map(line => line.trim())
        .filter(line => line.length > 0);

      this.stats.totalBarcodes = this.barcodes.length;
      
      if (this.barcodes.length === 0) {
        this.toast.warning($localize`No barcodes found in the selected file.`);
        this.isLoading = false;
        return;
      }
      
      // Lookup patrons
      this.loadingStep = $localize`Looking up patrons`;
      this.patrons = [];
      let processed = 0;
      
      // Set to track patron IDs we've already seen in this upload
      const processedPatronIds = new Set<number>();
      
      for (const barcode of this.barcodes) {
        try {
          processed++;
          this.progressValue = processed;
          this.progressMax = this.barcodes.length;
          
          const response = await lastValueFrom(this.net.request(
            'open-ils.actor',
            'open-ils.actor.user.fleshed.retrieve_by_barcode',
            this.auth.token(),
            barcode
          ));
          
          const evt = this.evt.parse(response);
          if (evt) {
            this.stats.invalidBarcodes++;
            this.patrons.push({
              id: 0,
              barcode: barcode,
              name: `Error: ${evt.textcode}`,
              isDuplicate: false,
              error: evt.desc || evt.textcode,
              selected: false // Initialize as not selected
            });
            continue;
          }
          
          if (response && response.id()) {
            const patronId = response.id();
            const patron: PatronPreview = {
              id: patronId,
              barcode: barcode,
              name: `${response.family_name()}, ${response.first_given_name()}`,
              isDuplicate: false,
              selected: true // Initialize valid patrons as selected by default
            };
            
            // Check for internal duplicates in the current upload
            const isInternalDuplicate = processedPatronIds.has(patronId);
            
            // Check if patron is already in the bucket
            const isExternalDuplicate = await this.checkPatronInBucket(patronId);
            
            // Mark as duplicate if it's either an internal or external duplicate
            patron.isDuplicate = isInternalDuplicate || isExternalDuplicate;
            
            if (patron.isDuplicate) {
              patron.selected = false; // Duplicates should not be selected
              // Add a more specific message for internal duplicates
              if (isInternalDuplicate) {
                patron.error = $localize`Duplicate patron in this upload`;
              }
            } else {
              this.stats.validBarcodes++;
              this.stats.toBeAdded++;
              
              // Add this patron ID to our processed set to catch future duplicates
              processedPatronIds.add(patronId);
            }
            
            this.patrons.push(patron);
          } else {
            this.stats.invalidBarcodes++;
            this.patrons.push({
              id: 0,
              barcode: barcode,
              name: 'Invalid patron',
              isDuplicate: false,
              error: 'Could not retrieve patron information',
              selected: false
            });
          }
        } catch (error) {
          console.error(`Error processing barcode ${barcode}:`, error);
          this.stats.invalidBarcodes++;
          this.patrons.push({
            id: 0,
            barcode: barcode,
            name: 'Error',
            isDuplicate: false,
            error: error.message || String(error),
            selected: false
          });
        }
      }
      
      this.hasPreviewedPatrons = true;
      this.fileHasChanged = false;
      
    } catch (error) {
      console.error('Error processing file:', error);
      this.toast.danger($localize`Error processing file: ${error.message || error}`);
    } finally {
      this.isLoading = false;
    }
  }
  
  async checkPatronInBucket(patronId: number): Promise<boolean> {
    try {
      // Use the bucket service to check if patron exists
      const items = await this.bucketService.checkPatronInBucket(this.bucketId, patronId);
      return items && items.length > 0;
    } catch (err) {
      console.error('Error checking if patron exists in bucket:', err);
      return false;
    }
  }

  async addPatronsToBucket(): Promise<void> {
    if (!this.hasPreviewedPatrons || this.patrons.length === 0) {
      this.toast.danger($localize`No patrons to add. Please preview the file first.`);
      return;
    }
    
    const patronsToAdd = this.getPatronsToAdd();
    if (patronsToAdd.length === 0) {
      this.toast.warning($localize`No patrons selected to add. Please select at least one valid patron.`);
      return;
    }
    
    this.isLoading = true;
    this.loadingStep = $localize`Adding patrons`;
    this.progressValue = 0;
    this.progressMax = 100;
    
    try {
      // Get valid selected patron IDs not already in the bucket
      const patronIds = patronsToAdd.map(p => p.id);
      
      // Use the bulk add method from the bucket service
      const result = await this.bucketService.addPatronsToPatronBucket(
        this.bucketId,
        patronIds
      );
      
      // Show results
      if (result.added > 0) {
        this.toast.success($localize`Added ${result.added} patron(s) to bucket`);
      }
      
      if (result.duplicates > 0) {
        this.toast.info($localize`${result.duplicates} patron(s) were already in the bucket`);
      }
      
      if (result.errors > 0) {
        this.toast.warning($localize`${result.errors} patron(s) could not be added due to errors`);
      }
      
      // Emit the results to update the parent component
      this.patronsAdded.emit({
        added: result.added,
        duplicates: result.duplicates
      });
      
      // Close the dialog with success status
      this.close({
        success: true,
        added: result.added,
        duplicates: result.duplicates,
        errors: result.errors
      });
      
    } catch (error) {
      console.error('Error adding patrons to bucket:', error);
      this.toast.danger($localize`Error adding patrons to bucket: ${error.message || error}`);
    } finally {
      this.isLoading = false;
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
      
      reader.onerror = () => {
        reject(new Error('Error reading file'));
      };
      
      reader.readAsText(file);
    });
  }
  
  toggleAllPatrons(select: boolean): void {
    this.patrons.forEach(patron => {
      if (patron.id > 0 && !patron.isDuplicate) {
        // Only toggle valid patrons that aren't duplicates
        // Implementation for checkbox selection if needed
      }
    });
  }

  getProcessingStatus(): string {
    if (!this.hasPreviewedPatrons) {
      return '';
    }
    
    return $localize`Found ${this.stats.validBarcodes} valid patron(s), 
                    ${this.stats.duplicates} duplicate(s), and 
                    ${this.stats.invalidBarcodes} invalid barcode(s)`;
  }

  // Make sure removeSelectedFile is public and properly implemented
  removeSelectedFile(): void {
    this.selectedFile = null;
    this.resetPatronList();
    this.fileHasChanged = true;
    
    // Clear the file input value to allow selecting the same file again
    if (this.barcodeFileInput && this.barcodeFileInput.nativeElement) {
      try {
        // This is necessary for selecting the same file again
        this.barcodeFileInput.nativeElement.value = '';
        
        // For IE11 compatibility (in case it's ever needed)
        if (this.barcodeFileInput.nativeElement.value) {
          // If the value is still there, try this alternative method for IE
          const form = document.createElement('form');
          const parent = this.barcodeFileInput.nativeElement.parentNode;
          if (parent) {
            parent.insertBefore(form, this.barcodeFileInput.nativeElement);
            form.appendChild(this.barcodeFileInput.nativeElement);
            form.reset();
            parent.insertBefore(this.barcodeFileInput.nativeElement, form);
            form.remove();
          }
        }
      } catch (e) {
        console.error("Error resetting file input:", e);
      }
    }
  }

  // New methods to support the improved UI
  
  /**
   * Converts technical error codes to user-friendly messages
   */
  getFriendlyErrorMessage(error: string): string {
    if (!error) return this.errorMessageMap['DEFAULT'];
    
    // Check for known error codes and return friendly message
    for (const [code, message] of Object.entries(this.errorMessageMap)) {
      if (error.includes(code)) {
        return message;
      }
    }
    
    // For ACTOR_CARD_NOT_FOUND which is common
    if (error.includes('ACTOR_CARD_NOT_FOUND')) {
      return this.errorMessageMap['ACTOR_CARD_NOT_FOUND'];
    }
    
    // If no specific message found, return the default message
    return this.errorMessageMap['DEFAULT'];
  }
  
  /**
   * Filters patrons based on the selected filter type
   */
  filterPatrons(filter: 'all' | 'valid' | 'duplicate' | 'invalid'): void {
    this.patronFilter = filter;
  }
  
  /**
   * Returns filtered patrons based on the current filter selection
   */
  getFilteredPatrons(): PatronPreview[] {
    if (this.patronFilter === 'all') {
      return this.patrons;
    } else if (this.patronFilter === 'valid') {
      return this.patrons.filter(p => p.id > 0 && !p.isDuplicate && !p.error);
    } else if (this.patronFilter === 'duplicate') {
      return this.patrons.filter(p => p.isDuplicate);
    } else if (this.patronFilter === 'invalid') {
      return this.patrons.filter(p => p.error && !p.isDuplicate);
    }
    return this.patrons;
  }
  
  /**
   * Returns all valid patrons that can be added (not duplicates, no errors)
   */
  getFilteredValidPatrons(): PatronPreview[] {
    return this.getFilteredPatrons().filter(p => p.id > 0 && !p.isDuplicate && !p.error);
  }
  
  /**
   * Returns the patrons that are selected to be added
   */
  getPatronsToAdd(): PatronPreview[] {
    return this.patrons.filter(p => p.id > 0 && !p.isDuplicate && !p.error && p.selected);
  }
  
  /**
   * Toggles selection state for a specific patron
   * With added animation effect for the selection counter
   */
  togglePatronSelection(patron: PatronPreview): void {
    patron.selected = !patron.selected;
    // Update stats.toBeAdded based on selections
    this.updateToBeAddedCount();
  }
  
  /**
   * Updates the count of patrons to be added based on selections
   */
  private updateToBeAddedCount(): void {
    this.stats.toBeAdded = this.getPatronsToAdd().length;
  }
  
  /**
   * Toggles selection for all valid patrons
   * With updated counter
   */
  toggleSelectAllPatrons(selected: boolean): void {
    this.getFilteredValidPatrons().forEach(patron => {
      patron.selected = selected;
    });
    this.updateToBeAddedCount();
  }
  
  /**
   * Checks if all valid patrons are selected
   */
  areAllValidPatronsSelected(): boolean {
    const validPatrons = this.getFilteredValidPatrons();
    if (validPatrons.length === 0) return false;
    return validPatrons.every(p => p.selected);
  }
  
  /**
   * Checks if any patrons are selected
   */
  hasSelectedPatrons(): boolean {
    return this.patrons.some(p => p.selected);
  }
  
  /**
   * Returns the count of selected patrons
   */
  getSelectedCount(): number {
    return this.patrons.filter(p => p.selected).length;
  }
}
