import {Component, Input, ViewChild} from '@angular/core';
import {AlertDialogComponent} from '@eg/share/dialog/alert.component';

@Component({
    selector: 'eg-bucket-action-summary-dialog',
    template: `
  <eg-alert-dialog #actionSummaryDialog
    dialogTitle="{{dialogTitle}}"
    [dialogBodyTemplate]="actionResults">
  </eg-alert-dialog>
  <ng-template #actionResults>
    <div class="bucket-action-summary">
      <div class="alert alert-info d-flex align-items-center mb-3" *ngIf="containers?.length">
        <span class="material-icons me-2" aria-hidden="true">info</span>
        <span i18n>
          {containers.length, plural, 
            =1 {Results for 1 bucket} 
            other {Results for {{containers.length}} buckets}
          }
        </span>
      </div>
      <div class="table-responsive">
        <table class="table table-sm">
          <thead>
            <tr>
              <th i18n>Bucket ID</th>
              <th i18n>Result</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let container of containers" 
                [ngClass]="{'table-success': containerActionResultMap[container.id] === 'Success', 
                           'table-danger': containerActionResultMap[container.id] !== 'Success'}">
              <td>
                <div class="d-flex align-items-center">
                  <span class="material-icons bucket-icon me-1" *ngIf="containerActionResultMap[container.id] === 'Success'" 
                        aria-hidden="true">check_circle</span>
                  <span class="material-icons bucket-icon me-1 text-danger" *ngIf="containerActionResultMap[container.id] !== 'Success'" 
                        aria-hidden="true">error</span>
                  <span>{{container.id}}</span>
                </div>
              </td>
              <td>{{containerActionResultMap[container.id]}}</td>
            </tr>
            <tr *ngIf="!containers?.length">
              <td colspan="2" class="text-center" i18n>No results to display</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </ng-template>
  `,
  styleUrls: ['./buckets.css']
})

export class BucketActionSummaryDialogComponent {
    @Input() dialogTitle = $localize`Bucket Action Summary`;
    containers: any[] = [];
    containerActionResultMap: any = {};

    @ViewChild('actionSummaryDialog', { static: true })
    private actionSummaryDialog: AlertDialogComponent;

    constructor() {}

    open(containers: any[], containerActionResultMap: any) {
        this.containers = containers || [];
        this.containerActionResultMap = containerActionResultMap || {};
        return this.actionSummaryDialog.open();
    }
}

