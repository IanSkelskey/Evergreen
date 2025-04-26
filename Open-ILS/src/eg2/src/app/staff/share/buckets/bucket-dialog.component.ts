import { Component, ViewChild, Input, OnInit } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { DialogComponent } from '@eg/share/dialog/dialog.component';
import { ProgressDialogComponent } from '@eg/share/dialog/progress.component';
import { BucketService } from './bucket.service';
import { ToastService } from '@eg/share/toast/toast.service';
import { BucketFormComponent } from './bucket-form.component';

@Component({
  selector: 'eg-bucket-dialog',
  templateUrl: './bucket-dialog.component.html',
  styleUrls: ['./bucket-dialog.component.css', './buckets.css']
})
export class BucketDialogComponent extends DialogComponent implements OnInit {
  @ViewChild('progressDialog') private progressDialog: ProgressDialogComponent;

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
    // Defer initialization to open()
  }

  override open(options?: any) {
    this.errorMessage = null;
    this.pending = false;
    return super.open(options);
  }

  getBucketClassLabel(): string {
    return this.bucketClassLabels[this.bucketClass] || this.bucketClass;
  }

  async onFormSubmit(formData: any) {
    try {
      this.pending = true;
      this.errorMessage = null;
      if (this.progressDialog) {
        this.progressDialog.open();
      }

      let result;
      if (this.editMode && this.bucketId) {
        result = await this.bucketService.updateBucket(this.bucketClass, formData).toPromise();
      } else {
        const name = typeof formData.name === 'function' ? formData.name() : formData.name;
        const description = typeof formData.description === 'function' ? formData.description() : formData.description || '';
        const bucketType = typeof formData.btype === 'function' ? formData.btype() : formData.btype || 'staff_client';
        const isPublic = typeof formData.pub === 'function' ? formData.pub() === 't' : formData.pub === 't';

        result = await this.bucketService.createBucket(
          this.bucketClass, name, description, bucketType, isPublic
        ).toPromise();
      }

      if (this.progressDialog) this.progressDialog.close();
      this.pending = false;
      this.close(result);

      const actionText = this.editMode ? $localize`updated` : $localize`created`;
      this.toast.success($localize`${this.getBucketClassLabel()} bucket ${actionText} successfully`);
    } catch (error) {
      if (this.progressDialog) this.progressDialog.close();
      this.pending = false;
      this.errorMessage = error.message || 
        $localize`Error ${this.editMode ? 'updating' : 'creating'} ${this.getBucketClassLabel()} bucket`;
    }
  }

  onFormCancel() {
    this.close();
  }

  override close(result?: any) {
    return super.close(result || null);
  }
}
