import { Component, ViewChild, Input, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { DialogComponent } from '@eg/share/dialog/dialog.component';
import { ProgressDialogComponent } from '@eg/share/dialog/progress.component';
import { StringComponent } from '@eg/share/string/string.component';
import { PatronBucketService } from './bucket.service';
import { ToastService } from '@eg/share/toast/toast.service';
import { IdlService } from '@eg/core/idl.service'; // Fix import path from @eg/idle/idl.service
import { AuthService } from '@eg/core/auth.service';

@Component({
  selector: 'eg-patron-bucket-edit-dialog',
  templateUrl: './edit-dialog.component.html',
  styleUrls: ['./edit-dialog.component.css']
})
export class PatronBucketEditDialogComponent extends DialogComponent implements OnInit {
  @ViewChild('progressDialog') private progressDialog: ProgressDialogComponent;
  @ViewChild('successString') private successString: StringComponent;
  
  // New input property for edit mode
  @Input() editMode = false;
  @Input() bucketId: number;
  @Input() bucketData: any;
  
  bucketForm: FormGroup;
  pending = false;
  errorMessage: string = null;
  
  bucketTypes = [
    { value: 'staff_client', label: $localize`Staff Client` },
    { value: 'vandelay_queue', label: $localize`Import Queue` },
    { value: 'hold_subscription', label: $localize`Hold Subscription` }
  ];

  constructor(
    modalService: NgbModal,
    private formBuilder: FormBuilder,
    private bucketService: PatronBucketService,
    private toast: ToastService,
    private idl: IdlService, // Add this
    private auth: AuthService
  ) {
    super(modalService);
    this.initForm();
  }

  ngOnInit() {
    // This will now be handled in open() to ensure proper initialization timing
  }

  private initForm() {
    this.bucketForm = this.formBuilder.group({
      name: ['', [Validators.required, Validators.maxLength(70)]],
      description: ['', Validators.maxLength(140)],
      bucketType: ['staff_client', Validators.required],
      isPublic: [false]  // Add isPublic checkbox field with default false
    });
  }

  // Reset form when dialog opens
  override open(options?: any) {
    this.errorMessage = null;
    this.pending = false;
    
    // Reset the form with new values if in edit mode
    if (this.editMode && this.bucketData) {
      this.bucketForm.patchValue({
        name: this.bucketData.name || '',
        description: this.bucketData.description || '',
        bucketType: this.bucketData.btype || 'staff_client',
        isPublic: this.bucketData.pub || false  // Load public value from bucket data
      });
      
      // In edit mode, we might want to disable the bucket type field 
      // since changing it could cause issues
      this.bucketForm.get('bucketType').disable();
    } else {
      // Reset form for create mode
      this.initForm();
    }
    
    return super.open(options);
  }

  async createOrUpdateBucket() {
    if (this.bucketForm.invalid) {
      // Mark all fields as touched to trigger validation messages
      Object.keys(this.bucketForm.controls).forEach(key => {
        this.bucketForm.get(key).markAsTouched();
      });
      return;
    }

    const { name, description, bucketType, isPublic } = this.bucketForm.value;
    this.pending = true;
    this.errorMessage = null;
    
    if (this.progressDialog) {
        this.progressDialog.open();
    }

    try {
        let result;
        
        if (this.editMode && this.bucketId) {
            // First retrieve the existing bucket to ensure we have all fields
            let bucket;
            try {
                bucket = await this.bucketService.retrieveBucketById(this.bucketId);
                console.log('Retrieved existing bucket:', bucket);
            } catch (err) {
                console.error('Error retrieving bucket:', err);
                // Fall back to creating a new bucket object if retrieval fails
                bucket = this.idl.create('cub');
                bucket.id(this.bucketId);
                
                // Get owner from bucketData or use current user
                let owner;
                if (this.bucketData && (this.bucketData.owner_id || this.bucketData.owner)) {
                    owner = this.bucketData.owner_id || 
                           (typeof this.bucketData.owner === 'function' ? 
                            this.bucketData.owner() : this.bucketData.owner);
                } else {
                    owner = this.auth.user().id();
                }
                bucket.owner(owner);
                
                // Note: We don't need to set owning_lib here as the service will handle it
                // based on the owner's home_ou
            }
                
            // Now update only the fields that can change
            bucket.name(name);
            bucket.description(description || '');
            bucket.pub(isPublic ? 't' : 'f');  // Server expects 't' or 'f' string values
                
            // Don't change bucket type - it's typically fixed
            console.log('Updating bucket with data:', {
                id: bucket.id(),
                name: bucket.name(),
                description: bucket.description(),
                owner: bucket.owner(),
                btype: bucket.btype(),
                pub: bucket.pub(),
                owning_lib: bucket.owning_lib ? bucket.owning_lib() : 'not set'  // Log the owning_lib
            });
                
            result = await this.bucketService.updateBucket(bucket);
        } else {
            // Create new bucket logic remains the same
            // The service will handle setting the owning_lib
            result = await this.bucketService.createBucket(name, description, bucketType, isPublic);
        }
        
        if (this.progressDialog) {
          this.progressDialog.close();
        }
        
        this.pending = false;
        this.close(result);
        
        // Success message will be handled by the calling component
    } catch (error) {
        if (this.progressDialog) {
          this.progressDialog.close();
        }
        
        this.pending = false;
        this.errorMessage = error.message || $localize`Error ${this.editMode ? 'updating' : 'creating'} bucket`;
    }
  }

  // Form validation helpers
  get nameControl() { return this.bucketForm.get('name'); }
  get descriptionControl() { return this.bucketForm.get('description'); }

  hasError(controlName: string, errorType?: string): boolean {
    const control = this.bucketForm.get(controlName);
    if (!control) return false;
    return control.touched && (errorType ? control.hasError(errorType) : control.invalid);
  }

  // Override close to prevent error when closing without a result
  override close(result?: any) {
      // If there's no result when closing, pass null instead
      // to prevent "no elements in sequence" error
      return super.close(result || null);
  }
}
