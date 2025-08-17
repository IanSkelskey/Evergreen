import {Component, OnInit, Input, ViewChild, TemplateRef} from '@angular/core';
import {FormGroup, FormBuilder, Validators} from '@angular/forms';
import {lastValueFrom, Observable} from 'rxjs';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {DialogComponent} from '@eg/share/dialog/dialog.component';
import {IdlObject} from '@eg/core/idl.service';
import {AuthService} from '@eg/core/auth.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {ToastService} from '@eg/share/toast/toast.service';
import {PatronBucketService} from './patron-bucket.service';
import {ɵ$localize as $localize} from '@angular/localize';

/**
 * Component for rolling back batch edits of patrons in a bucket
 * Follows the same pattern as other bucket dialog components
 */
@Component({
  selector: 'eg-patron-bucket-rollback',
  templateUrl: './patron-bucket-rollback.component.html',
  styleUrls: ['./patron-bucket-rollback.component.css']
})
export class PatronBucketRollbackComponent extends DialogComponent implements OnInit {
  @Input() bucketId: number;
  
  @ViewChild('dialogContent', { static: true })
  dialogContent: TemplateRef<any>;

  rollbackForm: FormGroup;
  revertableFieldsetGroups: IdlObject[] = [];
  selectedFieldsetGroup: IdlObject = null;
  
  // For the progress tracking
  isProcessing = false;
  progressValue = 0;
  progressMax = 100;
  progressStage = '';
  progressError = '';

  constructor(
    private modal: NgbModal,
    private fb: FormBuilder,
    private auth: AuthService,
    private pcrud: PcrudService,
    private toast: ToastService,
    private bucketService: PatronBucketService
  ) {
    super(modal);
  }

  ngOnInit(): void {
    this.createForm();
  }

  /**
   * Initialize the form
   */
  createForm(): void {
    this.rollbackForm = this.fb.group({
      revertGroup: [null, Validators.required]
    });
  }

  /**
   * Load available fieldset groups that can be rolled back
   */
  loadRevertableFieldsetGroups(): void {
    if (!this.bucketId) return;
    
    this.revertableFieldsetGroups = [];
    
    this.pcrud.search('afsg', {
      rollback_group: {'>' : 0},
      rollback_time: null,
      container: this.bucketId,
      container_type: 'user'
    }).subscribe({
      next: (group) => {
        this.revertableFieldsetGroups.push(group);
      },
      error: (err) => {
        console.error('Error loading revertable fieldset groups:', err);
        this.toast.danger($localize`Error loading available rollbacks: ${err.message || err}`);
      }
    });
  }

  /**
   * Apply the rollback to the selected fieldset group
   */
  applyRollback(): void {
    if (!this.rollbackForm.valid) {
      this.toast.danger($localize`Please select an edit to roll back.`);
      return;
    }
    
    const selectedGroup = this.rollbackForm.get('revertGroup').value;
    if (!selectedGroup) {
      this.toast.danger($localize`No valid rollback target selected.`);
      return;
    }
    
    this.isProcessing = true;
    this.progressValue = 0;
    this.progressMax = 100;
    this.progressStage = $localize`Preparing to roll back changes`;
    this.progressError = '';
    
    // Call the service method to perform the rollback
    this.bucketService.applyRollbackToPatronBucket(
      this.bucketId, 
      selectedGroup.id(),
      (progress) => {
        // Update progress during the operation
        this.progressValue = progress.count || 0;
        this.progressMax = progress.max || 100;
        this.progressStage = progress.label || $localize`Processing`;
        
        if (progress.error) {
          this.progressError = progress.error;
        }
      }
    ).then(result => {
      if (result && result.success) {
        this.toast.success($localize`Successfully rolled back changes.`);
        this.close({success: true});
      } else {
        this.toast.danger($localize`Error rolling back changes: ${result?.error || 'Unknown error'}`);
      }
    }).catch(error => {
      console.error('Rollback error:', error);
      this.toast.danger($localize`Error rolling back changes: ${error.message || error}`);
    }).finally(() => {
      this.isProcessing = false;
    });
  }

  /**
   * Override the open method to reset form state and load data
   */
  override open(options?: any): Observable<any> {
    // Reset form state
    this.rollbackForm.reset();
    this.revertableFieldsetGroups = [];
    this.selectedFieldsetGroup = null;
    this.isProcessing = false;
    this.progressError = '';
    
    // Load available fieldset groups for rollback
    this.loadRevertableFieldsetGroups();
    
    // Apply dialog options with defaults
    const dialogOptions = {
      ...options,
      size: options?.size || 'lg',
      backdrop: 'static',
      keyboard: true
    };
    
    return super.open(dialogOptions);
  }
}
