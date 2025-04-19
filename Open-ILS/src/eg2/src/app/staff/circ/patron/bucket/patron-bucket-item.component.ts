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
import {PatronBucketAddDialogComponent} from './patron-bucket-add-dialog.component';
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
    @ViewChild('addPatronDialog') private addPatronDialog: PatronBucketAddDialogComponent;
    
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
            
            // Fetch bucket with owner information
            this.pcrud.retrieve('cub', this.bucketId, 
                {flesh: 1, flesh_fields: {cub: ['owner']}}
            ).subscribe({
                next: bucket => { 
                    console.debug('Retrieved bucket with owner:', bucket);
                    this.bucket = bucket; 
                },
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

    // Add a new method to open the add patron dialog
    openAddPatronDialog() {
        if (!this.addPatronDialog) {
            // Create dialog programmatically if ViewChild not available
            const modalRef = this.modal.open(PatronBucketAddDialogComponent, {
                size: 'xl', // Changed from 'lg' to 'xl'
                windowClass: 'patron-bucket-dialog-wide'
            });
            const dialog = modalRef.componentInstance as PatronBucketAddDialogComponent;
            dialog.bucketId = this.bucketId;
            
            modalRef.result.then(result => {
                if (result) {
                    this.grid.reload();
                }
            }, () => {
                // Dialog dismissed
            });
        } else {
            // Use ViewChild reference
            this.addPatronDialog.bucketId = this.bucketId;
            this.addPatronDialog.open({size: 'xl'}).subscribe(result => {
                if (result) {
                    this.grid.reload();
                }
            });
        }
    }
}
