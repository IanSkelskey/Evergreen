import {Component, OnInit, ViewChild} from '@angular/core';
import {Router, ActivatedRoute} from '@angular/router';
import {firstValueFrom, lastValueFrom, EMPTY} from 'rxjs';
import {catchError} from 'rxjs/operators';
import {AuthService} from '@eg/core/auth.service';
import {IdlObject} from '@eg/core/idl.service';
import {NetService} from '@eg/core/net.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {EventService} from '@eg/core/event.service';
import {OrgService} from '@eg/core/org.service';
import {GridComponent} from '@eg/share/grid/grid.component';
import {GridDataSource, GridCellTextGenerator} from '@eg/share/grid/grid';
import {GridFlatDataService} from '@eg/share/grid/grid-flat-data.service';
import {ToastService} from '@eg/share/toast/toast.service';
import {ConfirmDialogComponent} from '@eg/share/dialog/confirm.component';
import {AlertDialogComponent} from '@eg/share/dialog/alert.component';
import {PatronBucketService} from './patron-bucket.service';
import {DialogComponent} from '@eg/share/dialog/dialog.component';
import {Pager} from '@eg/share/util/pager';
import {BucketDialogComponent} from '@eg/staff/share/buckets/bucket-dialog.component';

@Component({
    selector: 'eg-patron-bucket-item',
    templateUrl: 'patron-bucket-item.component.html',
    styleUrls: ['patron-bucket-item.component.css']
})

export class PatronBucketItemComponent implements OnInit {
    bucketId: number;
    bucket: IdlObject;
    returnTo: string;
    dataSource: GridDataSource = new GridDataSource();
    cellTextGenerator: GridCellTextGenerator;
    noSelectedRows = true;
    oneSelectedRow = false;

    @ViewChild('grid', { static: true }) grid: GridComponent;
    @ViewChild('confirmDialog') confirmDialog: ConfirmDialogComponent;
    @ViewChild('alertDialog') alertDialog: AlertDialogComponent;
    @ViewChild('addToBucketDialog') addToBucketDialog: BucketDialogComponent;
    
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
        private bucketService: PatronBucketService
    ) {}

    ngOnInit() {
        this.cellTextGenerator = {
            'family_name': row => row['family_name'],
            'first_given_name': row => row['first_given_name'],
            'barcode': row => row['barcode']
        };

        this.route.paramMap.subscribe(params => {
            this.bucketId = +params.get('id');
            this.bucketService.logPatronBucket(this.bucketId);
            this.initDataSource(this.bucketId);
            this.gridSelectionChange([]);

            this.pcrud.retrieve('cub', this.bucketId).subscribe(bucket => {
                this.bucket = bucket;
            });
        });

        this.route.queryParams.subscribe(params => {
            this.returnTo = params.returnTo;
        });
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
                console.error(evt.toString());
                this.alertDialog.dialogTitle = $localize`Error removing patron from bucket`;
                this.alertDialog.dialogBody = evt.toString();
                await this.alertDialog.open();
                return false;
            }
            
            return true;
        } catch (err) {
            console.debug('removeFromBucket, error', err);
            return false;
        } finally {
            this.grid.reload();
        }
    }

    async editSelectedPatrons(rows: any[]): Promise<void> {
        if (!rows.length) return;
        
        rows.forEach(row => {
            const url = `/eg2/staff/circ/patron/${row['target_user']}/edit`;
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
}
