import { Component, Input, OnInit } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Observable, lastValueFrom, of } from 'rxjs';
import { map, switchMap, catchError } from 'rxjs/operators';
import { IdlService, IdlObject } from '@eg/core/idl.service';
import { PcrudService } from '@eg/core/pcrud.service';
import { EventService } from '@eg/core/event.service';
import { ToastService } from '@eg/share/toast/toast.service';
import { ConfirmDialogComponent } from '@eg/share/dialog/confirm.component';
import { ɵ$localize as $localize } from '@angular/localize';

/**
 * Component for viewing and managing patron bucket changesets
 */
@Component({
  selector: 'eg-patron-bucket-changesets',
  templateUrl: './patron-bucket-changesets.component.html',
  styleUrls: ['./patron-bucket-changesets.component.css']
})
export class PatronBucketChangesetsComponent implements OnInit {
  @Input() bucketId: number;
  
  fieldsetGroups: IdlObject[] = [];
  isLoading = false;
  
  // Format options for date display
  dateFormat: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric'
  };
  
  // Date format without time for medium screens
  dateOnlyFormat: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  };
  
  constructor(
    private pcrud: PcrudService,
    private idl: IdlService,
    private evt: EventService,
    private toast: ToastService,
    public modal: NgbActiveModal
  ) {}
  
  ngOnInit() {
    if (this.bucketId) {
      this.refreshGroups();
    } else {
      this.toast.danger($localize`No bucket ID provided`);
      this.modal.dismiss();
    }
  }
  
  /**
   * Load changeset groups from the server
   */
  refreshGroups() {
    this.isLoading = true;
    this.fieldsetGroups = [];
    
    this.pcrud.search('afsg', {
      container: this.bucketId,
      container_type: 'user',
      // Only include original changesets, not the rollback changesets themselves
      // Original changesets have a non-zero rollback_group value
      rollback_group: {'!=' : 0}
    }).subscribe({
      next: (group: IdlObject) => {
        this.fieldsetGroups.push(group);
      },
      error: (error: any) => {
        this.isLoading = false;
        console.error('Error loading fieldset groups:', error);
        this.toast.danger($localize`Error loading changeset data: ${error.message || error}`);
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }
  
  /**
   * Format date for display using browser's locale
   */
  formatDate(dateString: string, dateOnly: boolean = false): string {
    if (!dateString) return '';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleString(undefined, 
        dateOnly ? this.dateOnlyFormat : this.dateFormat);
    } catch (e) {
      return dateString;
    }
  }
  
  /**
   * Delete a changeset group
   */
  async deleteChangeset(group: IdlObject) {
    if (!group) return;
    
    try {
      await lastValueFrom(this.pcrud.remove(group));
      
      // If there's a rollback group, delete that too
      if (group.rollback_group()) {
        const rollbackGroup = await lastValueFrom(
          this.pcrud.retrieve('afsg', group.rollback_group())
        );
        
        if (rollbackGroup) {
          await lastValueFrom(this.pcrud.remove(rollbackGroup));
        }
      }
      
      this.toast.success($localize`Changeset "${group.name()}" deleted successfully`);
      this.refreshGroups();
    } catch (error) {
      console.error('Error deleting changeset:', error);
      this.toast.danger($localize`Error deleting changeset: ${error.message || error}`);
    }
  }
  
  /**
   * Close the dialog
   */
  close() {
    this.modal.close();
  }
}
