import {Component, OnInit, Input, Output, EventEmitter, ViewChild, TemplateRef} from '@angular/core';
import {FormGroup, FormBuilder, Validators} from '@angular/forms';
import {lastValueFrom, Observable, of} from 'rxjs';
import {catchError, map, tap} from 'rxjs/operators';
import {NgbModal, NgbModalRef} from '@ng-bootstrap/ng-bootstrap';
import {DialogComponent} from '@eg/share/dialog/dialog.component';
import {IdlObject} from '@eg/core/idl.service';
import {AuthService} from '@eg/core/auth.service';
import {OrgService} from '@eg/core/org.service';
import {NetService} from '@eg/core/net.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {EventService} from '@eg/core/event.service';
import {ToastService} from '@eg/share/toast/toast.service';
import {PatronBucketService} from './patron-bucket.service';
import {ProgressDialogComponent} from '@eg/share/dialog/progress.component';
import {ɵ$localize as $localize} from '@angular/localize';

/**
 * Component for batch editing patrons in a bucket
 * Similar to the AngularJS implementation in t_update_all.tt2
 */
@Component({
  selector: 'eg-patron-bucket-batch-edit',
  templateUrl: './patron-bucket-batch-edit.component.html',
  styleUrls: ['./patron-bucket-batch-edit.component.css']
})
export class PatronBucketBatchEditComponent extends DialogComponent implements OnInit {
  @Input() bucketId: number;
  @Output() batchEditCompleted = new EventEmitter<boolean>();

  @ViewChild('dialogContent', { static: true })
  dialogContent: TemplateRef<any>;

  @ViewChild('progressDialog') 
  progressDialog: ProgressDialogComponent;

  editForm: FormGroup;
  editName: string = '';
  
  homeOu: IdlObject = null;
  profile: IdlObject = null;
  netAccessLevel: IdlObject = null;
  expireDate: Date = null;
  barred: string = '';
  active: string = '';
  juvenile: string = '';
  
  profiles: IdlObject[] = [];
  netAccessLevels: IdlObject[] = [];
  
  // Track which fields have been modified
  modifiedFields: Set<string> = new Set();
  isProcessing = false;
  
  // For the progress bar
  progressValue = 0;
  progressMax = 100;
  progressStage = '';
  
  constructor(
    private modal: NgbModal,
    private fb: FormBuilder,
    private auth: AuthService,
    private org: OrgService,
    private net: NetService,
    private pcrud: PcrudService,
    private evt: EventService,
    private toast: ToastService,
    private bucketService: PatronBucketService
  ) {
    super(modal);
  }

  ngOnInit(): void {
    this.createForm();
    this.loadLookupData();
  }

  /**
   * Initialize the form
   */
  createForm(): void {
    this.editForm = this.fb.group({
      editName: ['', Validators.required],
      homeOu: [null],
      profile: [null],
      netAccessLevel: [null],
      barred: [''],
      active: [''],
      juvenile: [''],
      expireDate: [null]
    });
    
    // Listen for changes to track modified fields
    this.editForm.valueChanges.subscribe(() => this.updateModifiedFields());
  }

  /**
   * Load reference data for dropdowns
   */
  loadLookupData(): void {
    // Load permission groups (profiles)
    this.pcrud.search('pgt', {parent: null}, 
      {flesh: -1, flesh_fields: {pgt: ['children']}}
    ).subscribe({
      next: (tree) => {
        this.flattenGroups(tree);
      },
      error: (err) => {
        console.error('Error loading permission groups:', err);
        this.toast.danger($localize`Error loading permission groups: ${err.message || err}`);
      }
    });
    
    // Load net access levels
    this.pcrud.retrieveAll('cnal', {}, {atomic: true})
      .subscribe({
        next: (levels) => {
          this.netAccessLevels = levels;
        },
        error: (err) => {
          console.error('Error loading net access levels:', err);
          this.toast.danger($localize`Error loading net access levels: ${err.message || err}`);
        }
      });
  }
  
  /**
   * Flatten the permission group tree for display in a dropdown
   */
  private flattenGroups(root: IdlObject, depth: number = 0): void {
    if (!root) return;
    
    // Set depth attribute for UI indentation
    root['_depth'] = depth;
    
    // Add to the list
    this.profiles.push(root);
    
    // Process children if any
    if (root.children() && root.children().length) {
      root.children().forEach(child => {
        this.flattenGroups(child, depth + 1);
      });
    }
  }
  
  /**
   * Track which fields have been modified by the user
   */
  updateModifiedFields(): void {
    this.modifiedFields.clear();
    
    const form = this.editForm.value;
    
    if (form.homeOu) this.modifiedFields.add('homeOu');
    if (form.profile) this.modifiedFields.add('profile');
    if (form.netAccessLevel) this.modifiedFields.add('netAccessLevel');
    if (form.barred !== '') this.modifiedFields.add('barred');
    if (form.active !== '') this.modifiedFields.add('active');
    if (form.juvenile !== '') this.modifiedFields.add('juvenile');
    if (form.expireDate) this.modifiedFields.add('expireDate');
  }
  
  /**
   * Check if the form has at least one modified field
   */
  hasModifiedFields(): boolean {
    return this.modifiedFields.size > 0;
  }
  
  /**
   * Get display depth padding for permission groups
   */
  getDepthPadding(group: IdlObject): string {
    return group['_depth'] ? `${group['_depth'] * 10 + 5}px` : '5px';
  }
  
  /**
   * Reset a field to null/empty
   */
  unsetField(field: string): void {
    this.editForm.get(field)?.setValue(null);
    if (field === 'barred' || field === 'active' || field === 'juvenile') {
      this.editForm.get(field)?.setValue('');
    }
  }
  
  /**
   * Check if an org unit can have users
   */
  disableHomeOrg(orgId: number): boolean {
    if (!orgId) return false;
    
    const org = this.org.get(orgId);
    if (!org) return false;
    
    try {
      return org.ou_type().can_have_users() === 'f';
    } catch (e) {
      return false;
    }
  }
  
  /**
   * Run the batch edit operation
   */
  async batchEdit(): Promise<void> {
    if (!this.editForm.valid || !this.hasModifiedFields()) {
      this.toast.danger($localize`Please enter a name for this edit set and modify at least one field.`);
      return;
    }
    
    const formValues = this.editForm.value;
    
    // Prepare the edit parameters
    const editParams: any = {
      name: formValues.editName
    };
    
    // Only include fields that have been modified
    if (this.modifiedFields.has('homeOu') && formValues.homeOu) {
      editParams.home_ou = typeof formValues.homeOu === 'object' ? 
        formValues.homeOu.id() : formValues.homeOu;
    }
    
    if (this.modifiedFields.has('profile') && formValues.profile) {
      editParams.profile = typeof formValues.profile === 'object' ? 
        formValues.profile.id() : formValues.profile;
    }
    
    if (this.modifiedFields.has('netAccessLevel') && formValues.netAccessLevel) {
      editParams.net_access_level = typeof formValues.netAccessLevel === 'object' ? 
        formValues.netAccessLevel.id() : formValues.netAccessLevel;
    }
    
    if (this.modifiedFields.has('barred') && formValues.barred !== '') {
      editParams.barred = formValues.barred;
    }
    
    if (this.modifiedFields.has('active') && formValues.active !== '') {
      editParams.active = formValues.active;
    }
    
    if (this.modifiedFields.has('juvenile') && formValues.juvenile !== '') {
      editParams.juvenile = formValues.juvenile;
    }
    
    if (this.modifiedFields.has('expireDate') && formValues.expireDate) {
      // Format the date as YYYY-MM-DD
      const date = new Date(formValues.expireDate);
      editParams.expire_date = date.toISOString().substring(0, 10);
    }
    
    this.isProcessing = true;
    this.progressValue = 0;
    this.progressMax = 100;
    this.progressStage = $localize`Preparing to update patrons`;
    
    try {
      // Open the progress dialog
      if (this.progressDialog) {
        this.progressDialog.open();
      }
      
      // Call the service method to perform the batch edit
      const result = await this.bucketService.batchEditPatrons(
        this.bucketId, 
        editParams,
        (progress) => {
          // Update progress during the operation
          this.progressValue = progress.count || 0;
          this.progressMax = progress.max || 100;
          this.progressStage = progress.label || $localize`Processing`;
        }
      );
      
      // Close progress dialog
      if (this.progressDialog) {
        this.progressDialog.close();
      }
      
      if (result && result.success) {
        this.toast.success($localize`Successfully applied changes to patrons in bucket.`);
        this.batchEditCompleted.emit(true);
        this.close({success: true});
      } else {
        this.toast.danger($localize`Error applying changes: ${result?.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Batch edit error:', error);
      
      if (this.progressDialog) {
        this.progressDialog.close();
      }
      
      this.toast.danger($localize`Error updating patrons: ${error.message || error}`);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Override the open method to reset form state
   */
  override open(options?: any): Observable<any> {
    // Reset form state
    this.editForm.reset({
      editName: '',
      homeOu: null,
      profile: null,
      netAccessLevel: null,
      barred: '',
      active: '',
      juvenile: '',
      expireDate: null
    });
    
    this.modifiedFields.clear();
    this.isProcessing = false;
    
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
