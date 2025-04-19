import {Component, ViewChild, Input} from '@angular/core';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {IdlObject} from '@eg/core/idl.service';
import {ToastService} from '@eg/share/toast/toast.service';
import {NetService} from '@eg/core/net.service';
import {AuthService} from '@eg/core/auth.service';
import {EventService} from '@eg/core/event.service';
import {PatronSearchDialogComponent} from '@eg/staff/share/patron/search-dialog.component';
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
    patronSearch: PatronSearchDialogComponent;

    @ViewChild('progressDialog', { static: true })
    progressDialog: ProgressDialogComponent;

    selectedPatrons: IdlObject[] = [];

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

    // Called when patron search dialog selects patrons
    patronsSelected(patrons: IdlObject[]) {
        this.selectedPatrons = patrons;
        this.addSelectedPatronsToBucket();
    }

    async addSelectedPatronsToBucket() {
        if (!this.selectedPatrons.length) {
            return;
        }

        this.progressDialog.open();
        const userIds = this.selectedPatrons.map(patron => patron.id());

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
}
