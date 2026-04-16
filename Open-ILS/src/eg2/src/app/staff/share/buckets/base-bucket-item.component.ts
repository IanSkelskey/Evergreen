import {OnInit, ViewChild, Input, Directive} from '@angular/core';
import {Router, ActivatedRoute, ParamMap} from '@angular/router';
import {from, firstValueFrom, lastValueFrom, EMPTY, map, switchMap, catchError} from 'rxjs';
import {AuthService} from '@eg/core/auth.service';
import {StoreService} from '@eg/core/store.service';
import {IdlObject, IdlService} from '@eg/core/idl.service';
import {NetService} from '@eg/core/net.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {EventService} from '@eg/core/event.service';
import {GridComponent} from '@eg/share/grid/grid.component';
import {GridDataSource, GridCellTextGenerator} from '@eg/share/grid/grid';
import {GridFlatDataService} from '@eg/share/grid/grid-flat-data.service';
import {Pager} from '@eg/share/util/pager';
import {ConfirmDialogComponent} from '@eg/share/dialog/confirm.component';
import {AlertDialogComponent} from '@eg/share/dialog/alert.component';
import {BucketDialogComponent} from '@eg/staff/share/buckets/bucket-dialog.component';
import {BaseBucketService} from './base-bucket.service';
import {BucketTypeConfig} from './bucket-types';

@Directive()
export abstract class BaseBucketItemComponent implements OnInit {

    abstract get config(): BucketTypeConfig;
    abstract get bucketService(): BaseBucketService;

    @Input() bucketId: number;

    @ViewChild('grid', { static: true }) grid: GridComponent;
    @ViewChild('confirmDialog') confirmDialog: ConfirmDialogComponent;
    @ViewChild('alertDialog') alertDialog: AlertDialogComponent;
    @ViewChild('addToBucketDialog') addToBucketDialog: BucketDialogComponent;

    dataSource: GridDataSource = new GridDataSource();
    cellTextGenerator: GridCellTextGenerator;
    noSelectedRows: boolean;
    oneSelectedRow: boolean;
    bucket: IdlObject;
    returnTo: string;
    accessDenied = false;

    constructor(
        protected router: Router,
        protected route: ActivatedRoute,
        protected auth: AuthService,
        protected net: NetService,
        protected evt: EventService,
        protected idl: IdlService,
        protected store: StoreService,
        protected pcrud: PcrudService,
        protected flatData: GridFlatDataService,
    ) {}

    ngOnInit() {
        this.initCellTextGenerator();

        this.route.paramMap.pipe(
            switchMap((params: ParamMap) => {
                this.bucketId = +params.get('id');
                this.accessDenied = false;
                return from(this.bucketService.checkBucketAccess(this.bucketId));
            })
        ).subscribe({
            next: fleshedBucket => {
                if (fleshedBucket) {
                    this.bucket = fleshedBucket;
                    this.onBucketLoaded(fleshedBucket);
                    this.initDataSource(this.bucketId);
                    this.gridSelectionChange([]);
                } else {
                    this.accessDenied = true;
                }
            },
            error: (err: unknown) => {
                console.error('Error checking bucket access', err);
                this.accessDenied = true;
            }
        });

        this.route.queryParams.subscribe(params => {
            this.returnTo = params.returnTo;
        });
    }

    protected initCellTextGenerator() {
        this.cellTextGenerator = {};
    }

    protected onBucketLoaded(bucket: IdlObject) {
        // Override in subclasses for type-specific post-load behavior
    }

    gridSelectionChange(keys: string[]) {
        this.updateSelectionState(keys);
    }

    updateSelectionState(keys: string[]) {
        this.noSelectedRows = (keys.length === 0);
        this.oneSelectedRow = (keys.length === 1);
    }

    initDataSource(bucketId) {
        this.dataSource.getRows = (pager: Pager, sort: any[]) => {
            const query: any = {};
            query['bucket'] = bucketId;

            let query_filters = [];
            Object.keys(this.dataSource.filters).forEach(key => {
                query_filters = query_filters.concat(this.dataSource.filters[key]);
            });

            if (query_filters.length > 0) {
                query['-and'] = query_filters;
            }

            return this.flatData.getRows(this.grid.context, query, pager, sort).pipe(map(row => {
                try {
                    const hash = this.idl.toHash(row, true);
                    return hash;
                } catch (E) {
                    console.debug('Error with idl.toHash: row, error', row, E);
                    return row;
                }
            }));
        };
    }

    async removeFromBucket(rows: any[]): Promise<boolean> {
        if (!rows.length) { return false; }
        const targetIds = rows.map(row => row[this.config.targetField + '.id']);
        try {
            const response = await firstValueFrom(this.net.request(
                'open-ils.actor',
                'open-ils.actor.container.item.delete.batch',
                this.auth.token(), this.config.containerItemType,
                this.bucket.id(), targetIds
            ));
            const evt = this.evt.parse(response);
            if (evt) {
                console.error(evt.toString());
                this.alertDialog.dialogTitle = $localize`Error removing entry from bucket.`;
                this.alertDialog.dialogBody = evt.toString();
                await this.alertDialog.open();
                return false;
            }
            return true;
        } catch (err) {
            console.debug('removeFromBucket, error', err);
            return false;
        } finally {
            setTimeout(() => {
                this.grid.reload();
            }, 1000);
        }
    }

    openAddToBucketDialog = async (rows: any[]): Promise<boolean> => {
        if (!rows.length) { return false; }
        this.addToBucketDialog.containerType = this.config.containerType;
        this.addToBucketDialog.itemIds = rows.map(r => r[this.config.targetField + '.id']);
        try {
            const dialogObservable = this.addToBucketDialog.open({size: 'lg'}).pipe(
                catchError((error: unknown) => {
                    console.error('Error in dialog observable; this can happen if we close() with no arguments:', error);
                    return EMPTY;
                })
            );
            const results = await lastValueFrom(dialogObservable, { defaultValue: null });
            this.grid.reload();
            return results !== null;
        } catch (error) {
            console.error('Error in add to bucket dialog:', error);
            return false;
        }
    };

    async moveToBucket(rows: any[]): Promise<void> {
        if (!rows.length) { return; }
        try {
            const addResult = await this.openAddToBucketDialog(rows);
            if (addResult) {
                await this.removeFromBucket(rows);
            }
        } catch (error) {
            console.error('moveToBucket, error', error);
        }
    }
}
