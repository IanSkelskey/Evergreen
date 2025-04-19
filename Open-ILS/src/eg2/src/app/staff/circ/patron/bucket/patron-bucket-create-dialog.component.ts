import { Component, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { DialogComponent } from '@eg/share/dialog/dialog.component';
import { ProgressDialogComponent } from '@eg/share/dialog/progress.component';
import { StringComponent } from '@eg/share/string/string.component';
import { PatronBucketService } from './patron-bucket.service';
import { ToastService } from '@eg/share/toast/toast.service';

@Component({
  selector: 'eg-patron-bucket-create-dialog',
  templateUrl: './patron-bucket-create-dialog.component.html',
  styleUrls: ['./patron-bucket-create-dialog.component.css']
})
export class PatronBucketCreateDialogComponent extends DialogComponent {
  @ViewChild('progressDialog') private progressDialog: ProgressDialogComponent;
  @ViewChild('successString') private successString: StringComponent;

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
    private toast: ToastService
  ) {
    super(modalService);
    this.initForm();
  }

  private initForm() {
    this.bucketForm = this.formBuilder.group({
      name: ['', [Validators.required, Validators.maxLength(70)]],
      description: ['', Validators.maxLength(140)],
      bucketType: ['staff_client', Validators.required]
    });
  }

  // Reset form when dialog opens
  override open(options?: any) {
    this.errorMessage = null;
    this.pending = false;
    this.initForm();
    return super.open(options);
  }

  async createBucket() {
    if (this.bucketForm.invalid) {
      // Mark all fields as touched to trigger validation messages
      Object.keys(this.bucketForm.controls).forEach(key => {
        this.bucketForm.get(key).markAsTouched();
      });
      return;
    }

    const { name, description, bucketType } = this.bucketForm.value;
    this.pending = true;
    this.errorMessage = null;
    
    if (this.progressDialog) {
      this.progressDialog.open();
    }

    try {
      const result = await this.bucketService.createBucket(name, description, bucketType);
      
      if (this.progressDialog) {
        this.progressDialog.close();
      }
      
      this.pending = false;
      this.close(result);
      
      if (this.successString) {
        const successMsg = await this.successString.current();
        this.toast.success(successMsg);
      } else {
        this.toast.success($localize`Bucket "${name}" created successfully`);
      }
    } catch (error) {
      if (this.progressDialog) {
        this.progressDialog.close();
      }
      
      this.pending = false;
      this.errorMessage = error.message || $localize`Error creating bucket`;
      // Don't call this.error as it will close the dialog - just show the error in the UI
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
}
