import { Component, ViewChild, Input, OnInit } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { DialogComponent } from '@eg/share/dialog/dialog.component';
import { ProgressDialogComponent } from '@eg/share/dialog/progress.component';
import { BucketService } from './bucket.service';
import { ToastService } from '@eg/share/toast/toast.service';
import { BucketFormComponent } from './bucket-form.component';

/**
 * Reusable dialog component for creating and editing buckets of any type
 * (biblio, user, callnumber, copy)
 */
@Component({
  selector: 'eg-bucket-dialog',
  templateUrl: './bucket-dialog.component.html',
  styleUrls: [
    './bucket-dialog.component.css',
    './buckets.css'
  ]
})
export class BucketDialogComponent extends DialogComponent implements OnInit {
  @ViewChild('progressDialog') private progressDialog: ProgressDialogComponent;
  @ViewChild('bucketForm') private bucketForm: BucketFormComponent;
  
  // Configuration inputs
  @Input() bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy' = 'biblio';
  @Input() editMode = false;
  @Input() bucketId: number;
  @Input() bucketData: any;
  @Input() showPublicOption = true;
  @Input() bucketTypes = [
    { value: 'staff_client', label: $localize`Staff Client` },
    { value: 'vandelay_queue', label: $localize`Import Queue` },
    { value: 'hold_subscription', label: $localize`Hold Subscription` }
  ];
  
  pending = false;
  errorMessage: string = null;
  formValid = false;

  // Bucket type labels for display
  private bucketClassLabels = {
    'biblio': $localize`Bibliographic Record`,
    'user': $localize`Patron`, 
    'callnumber': $localize`Call Number`,
    'copy': $localize`Item`
  };

  constructor(
    modalService: NgbModal,
    private bucketService: BucketService,
    private toast: ToastService
  ) {
    super(modalService);
  }

  ngOnInit() {
    // Initialization is handled by open() for proper timing
  }

  // Reset when dialog opens
  override open(options?: any) {
    this.errorMessage = null;
    this.pending = false;
    
    return super.open(options);
  }

  // Get the appropriate bucket type label for display
  getBucketClassLabel(): string {
    return this.bucketClassLabels[this.bucketClass] || this.bucketClass;
  }

  // Handle form validity changes
  onFormValidityChange(isValid: boolean) {
    this.formValid = isValid;
  }

  // Process the form submission
  async createOrUpdateBucket() {
    // If the form isn't valid or we're already processing, don't proceed
    if (!this.formValid || this.pending) {
      return;
    }
    
    // Use validateAndSubmit to handle form validation and get the bucket data
    const formValid = this.bucketForm.validateAndSubmit();
    if (!formValid) {
      return;
    }
    
    this.pending = true;
    this.errorMessage = null;
    
    if (this.progressDialog) {
      this.progressDialog.open();
    }
  }

  // Handle the form submission event
  async onFormSubmit(formData: any) {
    try {
      let result;
      
      if (this.editMode && this.bucketId) {
        console.log('Updating bucket:', formData);
        result = await this.bucketService.updateBucket(this.bucketClass, formData).toPromise();
      } else {
        console.log('Creating bucket:', formData);
        const name = typeof formData.name === 'function' ? formData.name() : formData.name;
        const description = typeof formData.description === 'function' ? 
                            formData.description() : formData.description || '';
        const bucketType = typeof formData.btype === 'function' ? 
                           formData.btype() : formData.btype || 'staff_client';
        const isPublic = typeof formData.pub === 'function' ? 
                         formData.pub() === 't' : formData.pub === 't';
                         
        result = await this.bucketService.createBucket(
          this.bucketClass, name, description, bucketType, isPublic
        ).toPromise();
      }
      
      if (this.progressDialog) {
        this.progressDialog.close();
      }
      
      this.pending = false;
      this.close(result);
      
      // Display success message
      const actionText = this.editMode ? $localize`updated` : $localize`created`;
      this.toast.success($localize`${this.getBucketClassLabel()} bucket ${actionText} successfully`);
    } catch (error) {
      if (this.progressDialog) {
        this.progressDialog.close();
      }
      
      this.pending = false;
      this.errorMessage = error.message || 
        $localize`Error ${this.editMode ? 'updating' : 'creating'} ${this.getBucketClassLabel()} bucket`;
    }
  }

  onFormCancel() {
    this.close();
  }

  // Prevent "no elements in sequence" error
  override close(result?: any) {
    return super.close(result || null);
  }
}
