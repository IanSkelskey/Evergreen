import {Component, OnInit, OnDestroy, ViewChild} from '@angular/core';
import {Router, ActivatedRoute} from '@angular/router';
import {firstValueFrom, lastValueFrom, EMPTY, Subject} from 'rxjs';
import {catchError, takeUntil} from 'rxjs/operators';
import {AuthService} from '@eg/core/auth.service';
import {IdlObject} from '@eg/core/idl.service';
import {NetService} from '@eg/core/net.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {EventService} from '@eg/core/event.service';
import {OrgService} from '@eg/core/org.service';
import {PermService} from '@eg/core/perm.service';
import {GridComponent} from '@eg/share/grid/grid.component';
import {GridDataSource, GridCellTextGenerator} from '@eg/share/grid/grid';
import {GridFlatDataService} from '@eg/share/grid/grid-flat-data.service';
import {ToastService} from '@eg/share/toast/toast.service';
import {ConfirmDialogComponent} from '@eg/share/dialog/confirm.component';
import {AlertDialogComponent} from '@eg/share/dialog/alert.component';
import {ProgressDialogComponent} from '@eg/share/dialog/progress.component';
import {DialogComponent} from '@eg/share/dialog/dialog.component';
import {PatronBucketService} from './patron-bucket.service';
import {PatronBucketUpdateService} from './patron-bucket-update.service';
import {BucketDialogComponent} from '@eg/staff/share/buckets/bucket-dialog.component';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {Pager} from '@eg/share/util/pager';

@Component({
    selector: 'eg-patron-bucket-item',
    templateUrl: 'patron-bucket-item.component.html',
    styleUrls: ['patron-bucket-item.component.css']
})

export class PatronBucketItemComponent implements OnInit, OnDestroy {
    bucketId: number;
    bucket: IdlObject;
    returnTo: string;
    dataSource: GridDataSource = new GridDataSource();
    cellTextGenerator: GridCellTextGenerator;
    noSelectedRows = true;
    oneSelectedRow = false;
    hasUpdatePerm = false;
    hasDeletePerm = false;

    @ViewChild('grid', { static: true }) grid: GridComponent;
    @ViewChild('confirmDialog') confirmDialog: ConfirmDialogComponent;
    @ViewChild('alertDialog') alertDialog: AlertDialogComponent;
    @ViewChild('addToBucketDialog') addToBucketDialog: BucketDialogComponent;
    @ViewChild('progressDialog') progressDialog: ProgressDialogComponent;
    
    private destroy$ = new Subject<void>();
    
    constructor(
        private router: Router,
        private route: ActivatedRoute,
        private auth: AuthService,
        private net: NetService,
        private evt: EventService,
        private pcrud: PcrudService,
        private org: OrgService,
        private toast: ToastService,
        private flatData: GridFlatDataService,
        private bucketService: PatronBucketService,
        private updateService: PatronBucketUpdateService,
        private modal: NgbModal,
        private perm: PermService
    ) {}

    ngOnInit() {
        this.cellTextGenerator = {
            'family_name': row => row['family_name'],
            'first_given_name': row => row['first_given_name'],
            'barcode': row => row['barcode']
        };

        // Check permissions
        this.perm.hasWorkPermAt(['UPDATE_USER']).then(result => this.hasUpdatePerm = !!result);
        this.perm.hasWorkPermAt(['DELETE_USER']).then(result => this.hasDeletePerm = !!result);

        this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
            this.bucketId = +params.get('id');
            this.bucketService.logPatronBucket(this.bucketId);
            this.initDataSource(this.bucketId);
            this.gridSelectionChange([]);
            this.pcrud.retrieve('cub', this.bucketId).subscribe({
                next: bucket => { this.bucket = bucket; },
                error: err => {
                    console.error('Error loading bucket:', err);
                    this.toast.danger($localize`Error loading bucket: ${err.message || err}`);
                }
            });
        });

        this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
            this.returnTo = params.returnTo;
        });
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }

    gridSelectionChange(keys: string[]) {
        this.noSelectedRows = keys.length === 0;
        this.oneSelectedRow = keys.length === 1;
    }

    initDataSource(bucketId: number) {
        this.dataSource.getRows = (pager: Pager, sort: any[]) => {
            const query: any = {
                bucket: bucketId
            };

            let queryFilters = [];
            if (this.dataSource.filters) {
                Object.keys(this.dataSource.filters).forEach(key => {
                    queryFilters = queryFilters.concat(this.dataSource.filters[key]);
                });

                if (queryFilters.length > 0) {
                    query['-and'] = queryFilters;
                }
            }

            return this.flatData.getRows(this.grid.context, query, pager, sort);
        };
    }

    async removeFromBucket(rows: any[]): Promise<boolean> {
        if (!rows.length) return false;
        const patronIds = rows.map(row => row['target_user']);
        try {
            const response = await firstValueFrom(this.net.request(
                'open-ils.actor',
                'open-ils.actor.container.item.delete.batch',
                this.auth.token(), 'user',
                this.bucketId, patronIds
            ));
            const evt = this.evt.parse(response);
            if (evt) {
                this.alertDialog.dialogTitle = $localize`Error removing patron from bucket`;
                this.alertDialog.dialogBody = evt.toString();
                await this.alertDialog.open();
                return false;
            }
            this.toast.success($localize`${rows.length} patron(s) removed from bucket`);
            return true;
        } catch (err) {
            this.toast.danger($localize`Error removing patrons: ${err.message || err}`);
            return false;
        } finally {
            this.grid.reload();
        }
    }

    async editSelectedPatrons(rows: any[]): Promise<void> {
        if (!rows.length) return;
        
        rows.forEach(row => {
            const url = `/staff/circ/patron/${row['target_user']}/edit`;
            window.open(url, '_blank');
        });
    }

    async moveAddToBucket(rows: any[], remove = false): Promise<void> {
        if (!rows.length) return;
        
        this.addToBucketDialog.bucketClass = 'user';
        this.addToBucketDialog.itemIds = rows.map(row => row['target_user']);
        
        try {
            const dialogObservable = this.addToBucketDialog.open({size: 'lg'}).pipe(
                catchError((error: unknown) => {
                    console.error('Error in dialog observable:', error);
                    return EMPTY;
                })
            );
            
            const results = await lastValueFrom(dialogObservable, { defaultValue: null });
            if (results) {
                if (remove) {
                    await this.removeFromBucket(rows);
                }
                this.grid.reload();
            }
        } catch (error) {
            console.error('Error in add to bucket dialog:', error);
        }
    }

    // New bulk operation methods
    updateAllPatrons() {
        if (!this.hasUpdatePerm) {
            this.toast.danger($localize`You do not have permission to update users`);
            return;
        }

        const modalRef = this.modal.open({
            component: DialogComponent,
            size: 'lg'
        });
        modalRef.componentInstance.content = $localize`<div class="modal-header">
            <h4 class="modal-title" i18n>Update All Patrons</h4>
            <button type="button" class="btn-close" aria-label="Close" (click)="close()"></button>
        </div>
        <div class="modal-body">
            <form>
                <div class="mb-3">
                    <label for="changeset-name" class="form-label" i18n>Changeset Name</label>
                    <input type="text" class="form-control" id="changeset-name" [(ngModel)]="name" name="name" required>
                </div>
                <!-- Add fields for profile, expire date, etc. -->
                <div class="alert alert-info" i18n>This will update all patrons in the current bucket.</div>
            </form>
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary" (click)="close()" i18n>Cancel</button>
            <button type="button" class="btn btn-primary" (click)="ok()" [disabled]="!name" i18n>Update</button>
        </div>`;

        modalRef.componentInstance.name = '';

        modalRef.result.then(result => {
            if (result && result.name) {
                this.progressDialog.open();
                
                this.updateService.batchUpdateUsers(this.bucketId, result.name, result.fields || {})
                    .subscribe({
                        next: progress => {
                            if (progress.error) {
                                this.toast.danger(progress.error);
                            }
                            this.progressDialog.update({
                                value: progress.count,
                                max: progress.max
                            });
                            // Handle the label separately if needed
                            // this.progressDialog.setLabel(progress.label || $localize`Processing patrons...`);
                        },
                        error: err => {
                            console.error('Error updating patrons', err);
                            this.progressDialog.close();
                            this.toast.danger($localize`Error updating patrons: ${err.message || err}`);
                        },
                        complete: () => {
                            this.progressDialog.close();
                            this.toast.success($localize`Patrons updated successfully`);
                            this.grid.reload();
                        }
                    });
            }
        });
    }

    deleteAllPatrons() {
        if (!this.hasDeletePerm) {
            this.toast.danger($localize`You do not have permission to delete users`);
            return;
        }

        this.confirmDialog.dialogTitle = $localize`Delete All Patrons`;
        this.confirmDialog.dialogBody = $localize`Are you sure you want to delete all patrons in this bucket? This cannot be undone.`;
        
        this.confirmDialog.open().toPromise().then(confirmed => {
            if (confirmed) {
                const modalRef = this.modal.open({
                    component: DialogComponent,
                    size: 'sm'
                });
                modalRef.componentInstance.content = $localize`<div class="modal-header">
                    <h4 class="modal-title" i18n>Confirm Deletion</h4>
                    <button type="button" class="btn-close" aria-label="Close" (click)="close()"></button>
                </div>
                <div class="modal-body">
                    <form>
                        <div class="mb-3">
                            <label for="changeset-name" class="form-label" i18n>Changeset Name</label>
                            <input type="text" class="form-control" id="changeset-name" [(ngModel)]="name" name="name" required>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" (click)="close()" i18n>Cancel</button>
                    <button type="button" class="btn btn-danger" (click)="ok()" [disabled]="!name" i18n>Delete All</button>
                </div>`;

                modalRef.componentInstance.name = '';

                modalRef.result.then(result => {
                    if (result && result.name) {
                        this.progressDialog.open();
                        
                        this.updateService.batchDeleteUsers(this.bucketId, result.name)
                            .subscribe({
                                next: progress => {
                                    if (progress.error) {
                                        this.toast.danger(progress.error);
                                    }
                                    this.progressDialog.update({
                                        value: progress.count,
                                        max: progress.max,
                                    });
                                },
                                error: err => {
                                    console.error('Error deleting patrons', err);
                                    this.progressDialog.close();
                                    this.toast.danger($localize`Error deleting patrons: ${err.message || err}`);
                                },
                                complete: () => {
                                    this.progressDialog.close();
                                    this.toast.success($localize`Patrons deleted successfully`);
                                    this.grid.reload();
                                }
                            });
                    }
                });
            }
        });
    }

    modifyStatcats() {
        if (!this.hasUpdatePerm) {
            this.toast.danger($localize`You do not have permission to update users`);
            return;
        }

        const modalRef = this.modal.open({
            component: DialogComponent,
            size: 'lg'
        });

        // Fetch stat cats to populate the dialog
        this.pcrud.search('asc', {owner: this.auth.user().ws_ou()}, {flesh: 1, flesh_fields: {asc: ['entries']}})
            .subscribe({
                next: statCat => {
                    // Add UI handling for stat cats
                },
                error: err => {
                    console.error('Error fetching stat cats', err);
                    this.toast.danger($localize`Error fetching statistical categories: ${err.message || err}`);
                }
            });
    }

    viewChangesets() {
        // Implement view changesets dialog
    }

    applyRollback() {
        // Implement rollback dialog
    }
}
