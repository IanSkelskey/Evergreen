import {Component, Input, Output, OnInit, OnDestroy, ViewChild, EventEmitter} from '@angular/core';
import {Subscription, Observable, of, tap} from 'rxjs';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {AuthService} from '@eg/core/auth.service';
import {NetService} from '@eg/core/net.service';
import {EventService} from '@eg/core/event.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {DialogComponent} from '@eg/share/dialog/dialog.component';
import {PatronBarcodeValidator} from '@eg/share/validators/patron_barcode_validator.directive';
import {ToastService} from '@eg/share/toast/toast.service';
import {AlertDialogComponent} from '@eg/share/dialog/alert.component';
import {BucketActionSummaryDialogComponent} from './bucket-action-summary-dialog.component';
import {BucketDialogService} from './bucket-dialog.service';

@Component({
    selector: 'eg-bucket-transfer-dialog',
    templateUrl: './bucket-transfer-dialog.component.html',
    styleUrls: ['./bucket-transfer-dialog.component.css', './buckets.css']
})

export class BucketTransferDialogComponent
    extends DialogComponent implements OnInit, OnDestroy {

    subscriptions: Subscription[] = []; // unsubscribed from in ngOnDestroy

    @Input() patronId: number;
    destinationPatronId: number;
    @Input() containerType = 'biblio';
    @Input() containerObjects: any[] = [];
    @Output() transferRequestCompleted: EventEmitter<boolean> = new EventEmitter<boolean>();
    containerTransferResultMap = {};
    processing = false;

    patron$: Observable<{first_given_name: string, second_given_name: string, family_name: string}>;

    @ViewChild('fail', { static: true }) fail: AlertDialogComponent;
    @ViewChild('results', { static: true }) results: BucketActionSummaryDialogComponent;

    constructor(
        private auth: AuthService,
        private net: NetService,
        private evt: EventService,
        private pcrud: PcrudService,
        private modal: NgbModal,
        private pbv: PatronBarcodeValidator,
        private toast: ToastService,
        private bucketDialogService: BucketDialogService
    ) {
        super(modal);
    }

    ngOnInit() {
        if (this.patronId) {
            this.pcrud.search('au', {id: this.patronId}, {
                flesh: 1,
                flesh_fields: {'au': ['card']}
            }).subscribe((usr) => {
                this.destinationPatronId = usr.id();
                this.patron$ = of({
                    first_given_name: usr.first_given_name(),
                    second_given_name: usr.second_given_name(), 
                    family_name: usr.family_name()
                });
            });
        } else {
            this.patron$ = of({first_given_name: '', second_given_name: '', family_name: ''});
        }
    }

    ngOnDestroy() {
        this.subscriptions.forEach((subscription) => {
            subscription.unsubscribe();
        });
    }

    transferOwner$ = () => {
        this.containerTransferResultMap = {};
        this.processing = true;
        
        // Safely extract IDs, ensuring we don't try to access id on undefined objects
        const bucketIds = this.containerObjects
            .filter(o => o && o.id !== undefined)
            .map(o => typeof o.id === 'function' ? o.id() : o.id);
        
        return this.net.request(
            'open-ils.actor',
            'open-ils.actor.containers.transfer',
            this.auth.token(),
            this.destinationPatronId,
            this.containerType,
            bucketIds
        ).pipe(
            tap({
                next: (response) => {
                    this.processing = false;
                    const evt = this.evt.parse(response);
                    if (evt) {
                        console.error(evt.toString());
                        this.fail.dialogBody = evt.toString();
                        this.fail.open();
                    } else {
                        Object.entries(response).map(([id, result]) => {
                            let pass_or_fail = $localize`Success`;
                            const evt2 = this.evt.parse(result);
                            if (evt2) {
                                pass_or_fail = evt2.toString();
                            }
                            this.containerTransferResultMap[id] = pass_or_fail;
                        });

                        // Show results dialog and close this dialog when results dialog is closed
                        this.results.open(this.containerObjects, this.containerTransferResultMap).subscribe({ 
                            complete: () => {
                                this.close({
                                    success: true, 
                                    results: this.containerTransferResultMap
                                });
                            }
                        });
                    }
                },
                error: (response: unknown) => {
                    this.processing = false;
                    console.error(response);
                    this.fail.open();
                    this.transferRequestCompleted.emit(false);
                },
                complete: () => {
                    this.transferRequestCompleted.emit(true);
                }
            })
        );
    };

    transferBucketOwner() {
        if (!this.destinationPatronId) {
            this.toast.danger($localize`Please select a destination user first`);
            return;
        }
        
        this.subscriptions.push(this.transferOwner$().subscribe());
    }

    searchPatrons() {
        const patronSearch = this.bucketDialogService.getPatronSearchDialog();
        if (!patronSearch) {
            console.error('Patron search dialog not available');
            this.toast.danger($localize`Patron search dialog not available`);
            return;
        }
        
        patronSearch.open({size: 'xl'}).toPromise().then(
            patrons => {
                if (!patrons || patrons.length === 0) { return; }
                const usr = patrons[0];
                this.destinationPatronId = usr.id();
                this.patron$ = of({
                    first_given_name: usr.first_given_name(),
                    second_given_name: usr.second_given_name(), 
                    family_name: usr.family_name()
                });
            }
        );
    }
}

