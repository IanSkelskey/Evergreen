import {Component, OnInit, Input, Output, ViewChild, EventEmitter, OnDestroy, AfterViewInit, ChangeDetectorRef} from '@angular/core';
import {switchMap} from 'rxjs/operators';
import {NetService} from '@eg/core/net.service';
import {IdlService} from '@eg/core/idl.service';
import {EventService} from '@eg/core/event.service';
import {ToastService} from '@eg/share/toast/toast.service';
import {AuthService} from '@eg/core/auth.service';
import {DialogComponent} from '@eg/share/dialog/dialog.component';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {ConfirmDialogComponent} from '@eg/share/dialog/confirm.component';
import {ComboboxEntry} from '@eg/share/combobox/combobox.component';
import {StringComponent} from '@eg/share/string/string.component';
import {BucketService} from './bucket.service';
import {BucketFormComponent} from './bucket-form.component';

/**
 * Generic dialog for transferring items to buckets.
 * Works with any bucket type (biblio, user, callnumber, copy).
 */
@Component({
    selector: 'eg-bucket-item-transfer-dialog',
    templateUrl: 'item-transfer-dialog.component.html',
    styleUrls: ['item-transfer-dialog.component.css',
    './bucket.module.css']
})
export class BucketItemTransferDialogComponent extends DialogComponent implements OnInit, OnDestroy, AfterViewInit {

    activeTabId = 1; // Existing Buckets tab
    selectedBucket: number;
    sharedBucketId: number;
    sharedBucketName: string;
    buckets: any[] = [];
    showExistingBuckets = true;
    pendingOperation = false;

    // Inputs for configuration
    @Input() bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy';
    @Input() bucketType: string = 'staff_client';
    @Input() itemIds: number[] = [];
    @Input() dialogTitle: string;
    @Input() dialogIcon: string = 'folder';
    
    // Optional event listeners for specialized bucket handling
    @Output() addSucceeded = new EventEmitter<{bucketId: number}>();
    @Output() createSucceeded = new EventEmitter<{bucketId: number}>();

    @ViewChild('confirmAddToShared') confirmAddToShared: ConfirmDialogComponent;
    @ViewChild('successString') successString: StringComponent;
    // Use a setter to always get the latest reference
    private _bucketFormComponent: BucketFormComponent;
    @ViewChild('bucketForm', { static: false })
    set bucketFormComponentSetter(component: BucketFormComponent) {
        this._bucketFormComponent = component;
    }
    get bucketFormComponent(): BucketFormComponent {
        return this._bucketFormComponent;
    }
    
    // Track if the dialog has been initialized
    private dialogInitialized = false;
    bucketFormValid = false;

    constructor(
        private modal: NgbModal,
        private toast: ToastService,
        private idl: IdlService,
        private net: NetService,
        private bucketService: BucketService,
        private evt: EventService,
        private auth: AuthService,
        private cdr: ChangeDetectorRef // <-- add this
    ) {
        super(modal);
    }

    ngOnInit() {
        this.onOpen$.subscribe(ok => {
            this.reset(); // Reset data on dialog open
            this.dialogInitialized = true;
            
            if (this.showExistingBuckets) {
                // Use the bucket service to get the buckets
                this.bucketService.retrieveUserBuckets(
                    this.bucketClass, 
                    this.bucketType
                ).subscribe(buckets => this.buckets = buckets);
            } else {
                this.activeTabId = 2; // New Bucket tab
            }
        });
    }
    
    ngAfterViewInit() {
        // No need for logging here
    }
    
    ngOnDestroy() {
        // Cleanup if needed
    }

    reset() {
        // Reset form state
        this.selectedBucket = null;
        this.sharedBucketId = null;
        this.sharedBucketName = '';
        this.pendingOperation = false;

        // Set defaults if not provided
        if (!this.bucketClass) {
            this.bucketClass = 'biblio';
        }

        if (!this.bucketType) {
            this.bucketType = 'staff_client';
        }

        // Show existing buckets tab if we have items to add
        this.showExistingBuckets = this.itemIds.length > 0;
    }

    addToSelected() {
        this.addToBucket(this.selectedBucket);
    }

    addToShared() {
        this.bucketService.retrieveSharedBucket(
            this.bucketClass,
            this.sharedBucketId
        ).pipe(
            switchMap((bucket) => {
                this.sharedBucketName = bucket.name();
                return this.confirmAddToShared.open();
            })
        ).subscribe(() => {
            this.addToBucket(this.sharedBucketId);
        }, error => {
            this.toast.danger(error);
        });
    }

    bucketChanged(entry: ComboboxEntry) {
        if (entry) {
            this.selectedBucket = entry.id;
        } else {
            this.selectedBucket = null;
        }
    }

    formatBucketEntries(): ComboboxEntry[] {
        return this.buckets.map(b => ({id: b.id(), label: b.name()}));
    }

    // Handle bucket creation via the form component
    onBucketFormSubmit(bucket: any) {
        console.log('onBucketFormSubmit called', bucket); // debug
        this.pendingOperation = true;
        // bucketFormComponent creates the bucket object, but we still need
        // to save it to the server
        this.net.request(
            'open-ils.actor',
            'open-ils.actor.container.create',
            this.auth.token(), this.bucketClass, bucket
        ).subscribe(bktId => {
            const evt = this.evt.parse(bktId);
            if (evt) {
                this.toast.danger(evt.desc);
                this.pendingOperation = false;
                if (this.bucketFormComponent) {
                    this.bucketFormComponent.pending = false;
                }
            } else {
                // make it find-able
                bucket.id(bktId);
                this.buckets.push(bucket);
                if (this.showExistingBuckets) {
                    this.addToBucket(bktId);
                } else {
                    this.bucketService.logBucket(bktId);
                    this.bucketService.requestBucketsRefresh(this.bucketClass);
                    this.createSucceeded.emit({bucketId: bktId});
                    this.pendingOperation = false; // <-- ensure pending is reset
                    if (this.bucketFormComponent) {
                        this.bucketFormComponent.pending = false;
                    }
                    this.close({success: true, bucket: bktId});
                }
            }
        }, error => {
            this.toast.danger(error);
            this.pendingOperation = false;
            if (this.bucketFormComponent) {
                this.bucketFormComponent.pending = false;
            }
        });
    }

    addToBucket(bucketId: number) {
        if (this.itemIds.length === 0) {
            // Nothing to add
            return;
        }

        this.pendingOperation = true;
        this.bucketService.logBucket(bucketId);
        
        // Use bucket service to add items
        this.bucketService.addItemsToBucket(
            this.bucketClass,
            bucketId,
            this.itemIds
        ).subscribe(
            result => {
                this.toast.success(this.successString.text);
                this.bucketService.requestBucketsRefresh(this.bucketClass);
                this.addSucceeded.emit({bucketId: bucketId});
                this.close({success: true, bucket: bucketId});
            },
            error => {
                this.pendingOperation = false;
                this.toast.danger(error);
            }
        );
    }

    onBucketFormCancel() {
        // If we're in create-only mode, close the dialog
        if (!this.showExistingBuckets) {
            this.close();
        } else {
            // Otherwise just switch to the first tab
            this.activeTabId = 1;
        }
    }

    // Listen for validity changes from the form
    onBucketFormValidity(valid: boolean) {
        this.bucketFormValid = valid;
    }

    // Track tab changes - reset pending and validity
    onTabChange(tabId: number) {
        this.activeTabId = tabId;
        this.pendingOperation = false;
        this.bucketFormValid = false;
        // Force change detection to ensure ViewChild is updated
        if (tabId === 2) {
            setTimeout(() => this.cdr.detectChanges());
        }
    }
}




