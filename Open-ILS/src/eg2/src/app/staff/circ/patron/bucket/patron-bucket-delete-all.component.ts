import {Component, OnInit, Input, Output, EventEmitter, ViewChild, TemplateRef} from '@angular/core';
import {FormGroup, FormBuilder, Validators} from '@angular/forms';
import {lastValueFrom, Observable, of} from 'rxjs';
import {catchError, map, tap} from 'rxjs/operators';
import {NgbModal, NgbModalRef} from '@ng-bootstrap/ng-bootstrap';
import {DialogComponent} from '@eg/share/dialog/dialog.component';
import { NetService } from '@eg/core/net.service';
import {AuthService} from '@eg/core/auth.service';
import {PermService} from '@eg/core/perm.service';
import {ToastService} from '@eg/share/toast/toast.service';
import {PatronBucketService} from './patron-bucket.service';
import {ProgressDialogComponent} from '@eg/share/dialog/progress.component';
import {ɵ$localize as $localize} from '@angular/localize';

/**
 * Component for deleting all patrons in a bucket
 * Similar to the AngularJS implementation in t_delete_all.tt2
 */
@Component({
  selector: 'eg-patron-bucket-delete-all',
  templateUrl: './patron-bucket-delete-all.component.html',
  styleUrls: ['./patron-bucket-delete-all.component.css']
})
export class PatronBucketDeleteAllComponent extends DialogComponent implements OnInit {
  @Input() bucketId: number;
  @Output() deleteCompleted = new EventEmitter<boolean>();

  @ViewChild('dialogContent', { static: true })
  dialogContent: TemplateRef<any>;

  @ViewChild('progressDialog') 
  progressDialog: ProgressDialogComponent;

  deleteForm: FormGroup;
  isProcessing = false;
  
  // For the progress bar
  progressValue = 0;
  progressMax = 100;
  progressStage = '';
  progressError = '';

  // Permission flags
  hasDeletePerm = false;
  
  constructor(
    private modal: NgbModal,
    private fb: FormBuilder,
    private auth: AuthService,
    private net: NetService,
    private toast: ToastService,
    private bucketService: PatronBucketService,
    private perm: PermService
  ) {
    super(modal);
  }

  ngOnInit(): void {
    this.createForm();
    this.checkPermissions();
  }

  /**
   * Check if the user has permissions needed for deleting
   */
  checkPermissions(): void {
    // Check for UPDATE_USER and DELETE_USER permissions
    this.perm.hasWorkPermAt(['UPDATE_USER', 'DELETE_USER']).then(result => {
      this.hasDeletePerm = !!result;
    });
  }

  /**
   * Initialize the form
   */
  createForm(): void {
    this.deleteForm = this.fb.group({
      deleteName: ['', Validators.required]
    });
  }
  
  /**
   * Run the delete operation
   */
  async deleteAllPatrons(): Promise<void> {
    if (!this.deleteForm.valid) {
      this.toast.danger($localize`Please enter a name for this delete set.`);
      return;
    }
    
    if (!this.hasDeletePerm) {
      this.toast.danger($localize`You do not have permission to delete patrons.`);
      return;
    }
    
    const formValues = this.deleteForm.value;
    
    // Prepare the delete parameters
    const deleteParams: any = {
      name: formValues.deleteName,
      deleted: 't' // Mark as deleted
    };
    
    this.isProcessing = true;
    this.progressValue = 0;
    this.progressMax = 100;
    this.progressStage = $localize`Preparing to delete patrons`;
    this.progressError = '';
    
    try {
      // Open the progress dialog
      if (this.progressDialog) {
        this.progressDialog.open();
      }
      
      // Call the service method to perform the delete
      const result = await this.performDeleteOperation(
        this.bucketId, 
        deleteParams.name,
        deleteParams
      );
      
      // Close progress dialog
      if (this.progressDialog) {
        this.progressDialog.close();
      }
      
      if (result && result.success) {
        this.toast.success($localize`Successfully deleted patrons in bucket.`);
        this.deleteCompleted.emit(true);
        this.close({success: true});
      } else {
        this.toast.danger($localize`Error deleting patrons: ${result?.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Delete operation error:', error);
      
      if (this.progressDialog) {
        this.progressDialog.close();
      }
      
      this.toast.danger($localize`Error deleting patrons: ${error.message || error}`);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Perform the actual delete operation via the API
   */
  private async performDeleteOperation(
    bucketId: number,
    deleteName: string,
    params: any
  ): Promise<any> {
    try {
      return await lastValueFrom(
        this.net.request(
          'open-ils.actor',
          'open-ils.actor.container.user.batch_delete',
          this.auth.token(),
          bucketId,
          deleteName,
          params
        ).pipe(
          // Handle progress updates
          tap(progress => {
            if (progress.stage) {
              // Update progress information
              switch (progress.stage) {
                case 'CONTAINER_BATCH_UPDATE_PERM_CHECK':
                  progress.label = $localize`Checking permissions`;
                  break;
                case 'CONTAINER_PERM_CHECK':
                  progress.label = $localize`Verifying bucket access`;
                  break;
                case 'ITEM_PERM_CHECK':
                  progress.label = $localize`Checking item permissions`;
                  break;
                case 'PREPARING_USERS':
                  progress.label = $localize`Preparing users for deletion`;
                  break;
                case 'DELETING_USERS':
                  progress.label = $localize`Deleting users`;
                  break;
                case 'COMPLETE':
                  progress.label = $localize`Complete`;
                  break;
                default:
                  progress.label = progress.stage;
              }
            }
            
            // Update progress bar values
            if (progress.max) {
              this.progressMax = progress.max;
              this.progressValue = progress.count || 0;
            } else {
              this.progressMax = 1;
              this.progressValue = 1;
            }
            
            this.progressStage = progress.label || $localize`Processing`;
            
            if (progress.error) {
              this.progressError = progress.error;
            }
          }),
          // Return final result
          map(progress => {
            if (progress.stage === 'COMPLETE') {
              return { success: true };
            }
            
            if (progress.error) {
              return { 
                success: false, 
                error: progress.error 
              };
            }
            
            return null;
          }),
          // Handle errors
          catchError(error => {
            console.error('Delete operation error:', error);
            return of({ 
              success: false, 
              error: error.message || error 
            });
          })
        )
      );
    } catch (error) {
      console.error('Error in performDeleteOperation:', error);
      throw error;
    }
  }

  /**
   * Override the open method to reset form state
   */
  override open(options?: any): Observable<any> {
    // Reset form state
    this.deleteForm.reset({
      deleteName: ''
    });
    
    this.isProcessing = false;
    this.progressError = '';
    
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
