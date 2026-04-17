import {Component, OnInit, Input, ViewChild} from '@angular/core';
import {throwError, switchMap} from 'rxjs';
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
import {RecordBucketService} from '@eg/staff/cat/bucket/record/record-bucket.service';
import {BucketIdlClass, ContainerType} from './bucket-types';

/**
 * Dialog for adding items to new and existing buckets.
 */

@Component({
    selector: 'eg-bucket-dialog',
    templateUrl: 'bucket-dialog.component.html'
})

export class BucketDialogComponent extends DialogComponent implements OnInit {

    activeTabId = 1; // Existing Buckets tab
    selectedBucket: number;
    sharedBucketId: number;
    sharedBucketName: string;
    newBucketName: string;
    newBucketDesc: string;
    newBucketPublic = false;
    buckets: any[];
    showExistingBuckets = true;

    @Input() containerType: ContainerType = 'biblio';
    @Input() bucketSubtype: string; // bucket.btype(), e.g. staff_client

    // ID's of items to add to the bucket
    @Input() itemIds: number[];

    // If set, itemIds will be derived from the records in a bib queue
    @Input() fromBibQueue: number;

    // Fieldmapper class for the bucket record.
    bucketIdlClass: BucketIdlClass;
    targetField: string;

    @ViewChild('confirmAddToShared') confirmAddToShared: ConfirmDialogComponent;
    @ViewChild('successString') successString: StringComponent;

    constructor(
        private modal: NgbModal, // required for passing to parent
        private toast: ToastService,
        private idl: IdlService,
        private net: NetService,
        private recordBucketService: RecordBucketService,
        private evt: EventService,
        private auth: AuthService) {
        super(modal); // required for subclassing
        this.buckets = [];
        this.itemIds = [];
        this.fromBibQueue = null;
    }

    ngOnInit() {
        this.onOpen$.subscribe(ok => {
            this.reset(); // Reset data on dialog open
            if (this.showExistingBuckets) {
                this.net.request(
                    'open-ils.actor',
                    'open-ils.actor.container.retrieve_by_class.authoritative',
                    this.auth.token(), this.auth.user().id(),
                    this.containerType, this.bucketSubtype
                // eslint-disable-next-line rxjs-x/no-nested-subscribe
                ).subscribe(buckets => this.buckets = buckets);
            } else {
                this.activeTabId = 2; // New Bucket tab
            }
        });
    }

    reset() {
        this.selectedBucket = null;
        this.sharedBucketId = null;
        this.sharedBucketName = '';
        this.newBucketName = '';
        this.newBucketDesc = '';
        this.newBucketPublic = false;

        switch (this.containerType) {
            case 'biblio':
                if (this.fromBibQueue) {
                    this.bucketSubtype = 'vandelay_queue';
                }
                this.bucketIdlClass = 'cbreb';
                this.targetField = 'target_biblio_record_entry';
                break;
            case 'copy':
                this.bucketIdlClass = 'ccb';
                this.targetField = 'target_copy';
                break;
            case 'callnumber':
                this.bucketIdlClass = 'ccnb';
                this.targetField = 'target_call_number';
                break;
            case 'user':
                this.bucketIdlClass = 'cub';
                this.targetField = 'target_user';
        }

        if (!this.bucketSubtype) {
            this.bucketSubtype = 'staff_client';
        }

        this.showExistingBuckets = this.itemIds.length > 0 || Boolean(this.fromBibQueue);
        this.activeTabId = this.showExistingBuckets ? 1 : 2;
    }

    addToSelected() {
        this.addToBucket(this.selectedBucket);
    }

    addToShared() {
        this.net.request('open-ils.actor',
            'open-ils.actor.container.flesh',
            this.auth.token(), this.containerType,
            this.sharedBucketId)
            .pipe(switchMap((resp) => {
                const evt = this.evt.parse(resp);
                if (evt) {
                    this.toast.danger(evt.toString());
                    return throwError(evt);
                } else {
                    this.sharedBucketName = resp.name();
                    return this.confirmAddToShared.open();
                }
            })).subscribe(() => {
                this.addToBucket(this.sharedBucketId);
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

    // Create a new bucket then add the record
    addToNew() {
        const bucket = this.idl.create(this.bucketIdlClass);

        bucket.owner(this.auth.user().id());
        bucket.name(this.newBucketName);
        bucket.description(this.newBucketDesc);
        bucket.pub(this.newBucketPublic ? 't' : 'f');
        bucket.btype(this.bucketSubtype);

        this.net.request(
            'open-ils.actor',
            'open-ils.actor.container.create',
            this.auth.token(), this.containerType, bucket
        ).subscribe(bktId => {
            const evt = this.evt.parse(bktId);
            if (evt) {
                this.toast.danger(evt.desc);
            } else {
                // make it find-able to the queue-add method which
                // requires the bucket name.
                bucket.id(bktId);
                this.buckets.push(bucket);
                if (this.showExistingBuckets) { // aka, in a "add to bucket" context
                    this.addToBucket(bktId);
                } else {
                    if (this.containerType === 'biblio') {
                        this.recordBucketService.logRecordBucket(bktId);
                        this.recordBucketService.requestBibBucketsRefresh();
                    }
                    this.close({success: true, bucket: bktId}); // we're done
                }
            }
        });
    }

    addToBucket(id: number) {
        if (this.itemIds.length > 0) {
            this.addRecordToBucket(id);
        } else if (this.fromBibQueue) {
            this.addBibQueueToBucket(id);
        }
    }

    // Add the record(s) to the bucket with provided ID.
    addRecordToBucket(bucketId: number) {
        if (this.containerType === 'biblio') {
            this.recordBucketService.logRecordBucket(bucketId);
        }
        const items = [];
        this.itemIds.forEach(itemId => {
            const item = this.idl.create(this.bucketIdlClass + 'i');
            item.bucket(bucketId);
            item[this.targetField](itemId);
            items.push(item);
        });

        this.net.request(
            'open-ils.actor',
            'open-ils.actor.container.item.create',
            this.auth.token(), this.containerType, items
        ).subscribe(resp => {
            const evt = this.evt.parse(resp);
            if (evt) {
                this.toast.danger(evt.toString());
            } else {
                this.toast.success(this.successString.text);
                if (this.containerType === 'biblio') {
                    this.recordBucketService.requestBibBucketsRefresh();
                }
                this.close({success: true, bucket: bucketId}); // we're done
            }
        });
    }

    addBibQueueToBucket(bucketId: number) {
        const bucket = this.buckets.filter(b => b.id() === bucketId)[0];
        if (!bucket) { return; }
        this.recordBucketService.logRecordBucket(bucketId);

        this.net.request(
            'open-ils.vandelay',
            'open-ils.vandelay.bib_queue.to_bucket',
            this.auth.token(), this.fromBibQueue, bucket.name()
        ).toPromise().then(resp => {
            const evt = this.evt.parse(resp);
            if (evt) {
                this.toast.danger(evt.toString());
            } else {
                this.recordBucketService.requestBibBucketsRefresh();
                this.close({success: true, bucket: bucketId}); // we're done
            }
        });
    }

    get bucketKindLabel(): string {
        switch (this.containerType) {
            case 'biblio':
                return $localize`Record Bucket`;
            case 'user':
                return $localize`Patron Bucket`;
            case 'copy':
                return $localize`Item Bucket`;
            case 'callnumber':
                return $localize`Call Number Bucket`;
            default:
                return $localize`Bucket`;
        }
    }

    get bucketMemberLabelPlural(): string {
        switch (this.containerType) {
            case 'biblio':
                return $localize`records`;
            case 'user':
                return $localize`patrons`;
            case 'copy':
                return $localize`items`;
            case 'callnumber':
                return $localize`call numbers`;
            default:
                return $localize`items`;
        }
    }

    get bucketMemberLabelSingular(): string {
        switch (this.containerType) {
            case 'biblio':
                return $localize`record`;
            case 'user':
                return $localize`patron`;
            case 'copy':
                return $localize`item`;
            case 'callnumber':
                return $localize`call number`;
            default:
                return $localize`item`;
        }
    }

    get bucketDialogTitle(): string {
        if (!this.showExistingBuckets) {
            return $localize`Create New ${this.bucketKindLabel}:bucketKind:`;
        }

        if (this.fromBibQueue) {
            return $localize`Add ${this.bucketMemberLabelPlural}:memberType: from Queue #${this.fromBibQueue}:queueId: to a ${this.bucketKindLabel}:bucketKind:`;
        }

        if (this.itemIds.length === 1) {
            return $localize`Add ${this.bucketMemberLabelSingular}:memberType: #${this.itemIds[0]}:itemId: to a ${this.bucketKindLabel}:bucketKind:`;
        }

        return $localize`Add ${this.itemIds.length}:itemCount: ${this.bucketMemberLabelPlural}:memberType: to a ${this.bucketKindLabel}:bucketKind:`;
    }

    get bucketDialogContextLabel(): string {
        if (this.showExistingBuckets) {
            return $localize`Working with ${this.bucketKindLabel}:bucketKind:`;
        }
        return $localize`Create and configure a ${this.bucketKindLabel}:bucketKind:`;
    }

    get createButtonLabel(): string {
        if (this.showExistingBuckets) {
            return $localize`Create Bucket and Add`;
        }
        return $localize`Create Bucket`;
    }
}

