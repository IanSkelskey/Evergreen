import {Component, ViewChild, Input} from '@angular/core';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {IdlObject} from '@eg/core/idl.service';
import {ToastService} from '@eg/share/toast/toast.service';
import {NetService} from '@eg/core/net.service';
import {AuthService} from '@eg/core/auth.service';
import {EventService} from '@eg/core/event.service';
import {PatronSearchComponent} from '@eg/staff/share/patron/search.component';
import {DialogComponent} from '@eg/share/dialog/dialog.component';
import {PatronBucketService} from './bucket.service';
import {ProgressDialogComponent} from '@eg/share/dialog/progress.component';
import {firstValueFrom} from 'rxjs';

@Component({
    selector: 'eg-patron-bucket-add-dialog',
    templateUrl: './add-dialog.component.html',
    styleUrls: ['./add-dialog.component.css']
})
export class PatronBucketAddDialogComponent extends DialogComponent {
    @Input() bucketId: number;

    @ViewChild('patronSearch', { static: false })
    patronSearch: PatronSearchComponent;

    @ViewChild('progressDialog', { static: true })
    progressDialog: ProgressDialogComponent;

    selectedPatrons: IdlObject[] = [];
    selectedPatronIds: number[] = [];
    addedPatronCount = 0;
    
    // Track which patrons have already been added to avoid duplicates
    private addedPatronIds: Set<number> = new Set();

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
            this.addSelectedPatronsToBucket(false);
        }
    }

    // Called when patron selection changes in grid
    patronSelectionChange(patronIds: number[]) {
        this.selectedPatronIds = patronIds || [];
    }

    async addSelectedPatronsToBucket(keepDialogOpen: boolean = false) {
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

        // Filter out IDs that have already been added in this session
        const newUserIds = userIds.filter(id => !this.addedPatronIds.has(id));
        
        // If no new patrons, show a message and clear selection
        if (newUserIds.length === 0) {
            this.toast.warning($localize`All selected patrons have already been added to this bucket in this session`);
            if (keepDialogOpen) {
                this.clearSelections();
            }
            return;
        }

        this.progressDialog.open();

        try {
            const response = await firstValueFrom(this.net.request(
                'open-ils.actor',
                'open-ils.actor.container.item.create.batch',
                this.auth.token(), 'user', this.bucketId, newUserIds
            ));
            
            const evt = this.evt.parse(response);
            if (evt) {
                this.progressDialog.close();
                this.toast.danger(evt.toString());
                return;
            }
            
            this.progressDialog.close();
            
            // Add the successful IDs to our tracking set
            newUserIds.forEach(id => this.addedPatronIds.add(id));
            
            this.addedPatronCount += newUserIds.length;
            this.toast.success(
                $localize`${newUserIds.length} patron(s) added to bucket`
            );
            this.bucketService.requestPatronBucketsRefresh();
            
            if (keepDialogOpen) {
                // Reset selections but keep dialog open
                this.clearSelections();
            } else {
                this.close(true);
            }
        } catch (error) {
            this.progressDialog.close();
            this.toast.danger(
                $localize`Error adding patrons to bucket: ${error.message || error}`
            );
        }
    }
    
    // Clear selections properly
    private clearSelections() {
        // First check if patronSearch exists
        if (this.patronSearch) {
            try {
                // Then fallback to clear method (older versions)
                if (typeof this.patronSearch.clear === 'function') {
                    this.patronSearch.clear();
                }
            } catch (e) {
                console.warn('Error clearing patron search selections:', e);
            }
        }
        
        this.selectedPatrons = [];
        this.selectedPatronIds = [];
    }

    // Add method to check if a patron is already added
    isPatronAlreadyAdded(patronId: number): boolean {
        return this.addedPatronIds.has(patronId);
    }

    // Override the dialog open method to reset selections and set dialog size/class
    override open(options?: any) {
        this.selectedPatrons = [];
        this.selectedPatronIds = [];
        this.addedPatronCount = 0;
        this.addedPatronIds = new Set();
        
        const dialogOptions = {
            ...options,
            size: 'xl', 
            windowClass: 'patron-bucket-dialog-wide'
        };
        return super.open(dialogOptions);
    }
}
