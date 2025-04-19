import {Component, ViewChild, Input} from '@angular/core';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {IdlObject} from '@eg/core/idl.service';
import {ToastService} from '@eg/share/toast/toast.service';
import {NetService} from '@eg/core/net.service';
import {AuthService} from '@eg/core/auth.service';
import {EventService} from '@eg/core/event.service';
import {PatronSearchComponent} from '@eg/staff/share/patron/search.component';
import {DialogComponent} from '@eg/share/dialog/dialog.component';
import {PatronBucketService} from './patron-bucket.service';
import {ProgressDialogComponent} from '@eg/share/dialog/progress.component';
import {firstValueFrom} from 'rxjs';

@Component({
    selector: 'eg-patron-bucket-add-dialog',
    templateUrl: './patron-bucket-add-dialog.component.html'
})
export class PatronBucketAddDialogComponent extends DialogComponent {
    @Input() bucketId: number;

    @ViewChild('patronSearch', { static: false })
    patronSearch: PatronSearchComponent;

    @ViewChild('progressDialog', { static: true })
    progressDialog: ProgressDialogComponent;

    selectedPatrons: IdlObject[] = [];
    selectedPatronIds: number[] = [];

    constructor(
        private modal: NgbModal,
        private toast: ToastService,
        private net: NetService,
        private auth: AuthService,
        private evt: EventService,
        private bucketService: PatronBucketService
    ) {
        super(modal);
    }

    // Called when a patron is double-clicked or activated
    patronsActivated(patrons: IdlObject[]) {
        if (patrons && patrons.length) {
            this.selectedPatrons = patrons;
            this.addSelectedPatronsToBucket();
        }
    }

    // Called when patron selection changes in grid
    patronSelectionChange(patronIds: number[]) {
        this.selectedPatronIds = patronIds || [];
    }

    async addSelectedPatronsToBucket() {
        // If activated with specific patrons, use those
        let userIds: number[] = [];
        
        if (this.selectedPatrons.length > 0) {
            userIds = this.selectedPatrons.map(patron => patron.id());
        } else if (this.selectedPatronIds.length > 0) {
            userIds = this.selectedPatronIds;
        }
        
        if (!userIds.length) {
            return;
        }

        this.progressDialog.open();

        try {
            const response = await firstValueFrom(this.net.request(
                'open-ils.actor',
                'open-ils.actor.container.item.create.batch',
                this.auth.token(), 'user', this.bucketId, userIds
            ));
            
            const evt = this.evt.parse(response);
            if (evt) {
                this.progressDialog.close();
                this.toast.danger(evt.toString());
                return;
            }
            
            this.progressDialog.close();
            this.toast.success(
                $localize`${userIds.length} patron(s) added to bucket`
            );
            this.bucketService.requestPatronBucketsRefresh();
            this.close(true);
        } catch (error) {
            this.progressDialog.close();
            this.toast.danger(
                $localize`Error adding patrons to bucket: ${error.message || error}`
            );
        }
    }

    // Override the dialog open method to reset selections
    override open(options?: any) {
        this.selectedPatrons = [];
        this.selectedPatronIds = [];
        return super.open(options);
    }
}
