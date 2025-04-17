import {Component, OnInit, OnDestroy, ViewChild} from '@angular/core';
import {Router, ActivatedRoute} from '@angular/router';
import {Observable, Subject, from, lastValueFrom, EMPTY, of} from 'rxjs';
import {takeUntil, filter, catchError, switchMap, map} from 'rxjs/operators';
import {AuthService} from '@eg/core/auth.service';
import {IdlObject} from '@eg/core/idl.service';
import {NetService} from '@eg/core/net.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {EventService} from '@eg/core/event.service';
import {GridComponent} from '@eg/share/grid/grid.component';
import {GridDataSource, GridCellTextGenerator} from '@eg/share/grid/grid';
import {Pager} from '@eg/share/util/pager';
import {ToastService} from '@eg/share/toast/toast.service';
import {DialogComponent} from '@eg/share/dialog/dialog.component';
import {ConfirmDialogComponent} from '@eg/share/dialog/confirm.component';
import {AlertDialogComponent} from '@eg/share/dialog/alert.component';
import {PromptDialogComponent} from '@eg/share/dialog/prompt.component';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {BucketDialogComponent} from '@eg/staff/share/buckets/bucket-dialog.component';
import {BucketTransferDialogComponent} from '@eg/staff/share/buckets/bucket-transfer-dialog.component';
import {BucketShareDialogComponent} from '@eg/staff/share/buckets/bucket-share-dialog.component';
import {FmRecordEditorComponent} from '@eg/share/fm-editor/fm-editor.component';
import {PatronBucketService} from './patron-bucket.service';
import {DatePipe} from '@angular/common';
import {OrgService} from '@eg/core/org.service';

interface GridColumnSort {
    name: string;
    dir: string;
}

interface BucketQueryResult {
    bucketIds: number[];
    count: number;
}

interface BucketView {
    label: string | null;
    sort_key: number | null;
    count: number | null;
    bucketIdQuery: (pager: Pager, sort: GridColumnSort[], justCount: boolean) => Promise<BucketQueryResult>;
}

@Component({
    selector: 'eg-patron-bucket',
    templateUrl: 'patron-bucket.component.html',
    styleUrls: ['./patron-bucket.component.css']
})

export class PatronBucketComponent implements OnInit, OnDestroy {
    currentView: string;
    views: {[name: string]: BucketView} = {};
    dataSource: GridDataSource = new GridDataSource();
    cellTextGenerator: GridCellTextGenerator;
    bucketIdToRetrieve: number;
    bucketId: number;
    userId: number;
    countInProgress = false;
    noSelectedRows = true;
    oneSelectedRow = false;

    @ViewChild('grid', { static: false }) grid: GridComponent;
    @ViewChild('newBucketDialog') private newBucketDialog: BucketDialogComponent;
    @ViewChild('editDialog') private editDialog: FmRecordEditorComponent;
    @ViewChild('deleteDialog') private deleteDialog: ConfirmDialogComponent;
    @ViewChild('deleteFail') private deleteFail: AlertDialogComponent;
    @ViewChild('retrieveByIdFail') private retrieveByIdFail: AlertDialogComponent;
    @ViewChild('results') private results: DialogComponent;
    @ViewChild('transferDialog') private transferDialog: BucketTransferDialogComponent;
    @ViewChild('shareBucketDialog') private shareBucketDialog: BucketShareDialogComponent;

    private destroy$ = new Subject<void>();

    constructor(
        private router: Router,
        private route: ActivatedRoute,
        private auth: AuthService,
        private net: NetService,
        private pcrud: PcrudService,
        private evt: EventService,
        private toast: ToastService,
        private org: OrgService,
        private bucketService: PatronBucketService,
        private modal: NgbModal,
        private datePipe: DatePipe
    ) {}

    ngOnInit() {
        // Initialize views first so they're available when needed
        this.initViews();
        
        // Initialize grid-related objects
        this.initCellTextGenerator();
        this.initDataSource();

        this.userId = this.auth.user().id();
        
        // Initialize with user buckets as default view
        this.currentView = 'user';
        
        // Handle route parameters for bucket ID
        this.route.paramMap.pipe(
            takeUntil(this.destroy$)
        ).subscribe(params => {
            const id = params.get('id');
            if (id) {
                this.bucketIdToRetrieve = Number(id);
                this.currentView = 'retrieved_by_id';
                this.grid?.reload();
            }
        });

        // Handle URL path for switching views
        this.route.url.pipe(
            takeUntil(this.destroy$)
        ).subscribe(segments => {
            const path = segments[0]?.path;
            if (path && this.views[path]) {
                this.currentView = path;
                this.grid?.reload();
            }
        });

        // Listen for bucket refresh requests
        this.bucketService.patronBucketsRefreshRequested$.pipe(
            takeUntil(this.destroy$)
        ).subscribe(() => {
            this.grid?.reload();
            this.updateCounts();
        });

        // Get initial counts for all views
        this.updateCounts();
        
        // Initial grid load with a small delay to ensure everything is ready
        setTimeout(() => {
            if (this.grid) {
                this.grid.reload();
            }
        }, 100);
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }

    initDataSource() {
        this.dataSource = new GridDataSource();
        this.dataSource.getRows = (pager: Pager, sort: GridColumnSort[]): Observable<any> => {
            if (!this.currentView) {
                return of({count: 0, items: []});
            }
            
            const viewDef = this.views[this.currentView];
            if (!viewDef) {
                return of({count: 0, items: []});
            }
            
            return from(viewDef.bucketIdQuery(pager, sort, false)).pipe(
                switchMap(result => {
                    let ids = result.bucketIds;
                    if (typeof ids === 'number') ids = [ids];
                    if (!Array.isArray(ids)) ids = [];
                    if (!ids.length) {
                        return of({count: result.count || 0, items: []});
                    }
                    return this.pcrud.search('cub', 
                        {id: ids}, 
                        { flesh: 1, flesh_fields: {cub: ['owner']} }
                    ).pipe(
                        map(buckets => {
                            // Defensive: ensure buckets is always an array
                            const bucketArray = Array.isArray(buckets) ? buckets : [buckets];
                            const items = bucketArray.map(bucket => ({
                                id: bucket.id(),
                                name: bucket.name(),
                                description: bucket.description(),
                                btype: bucket.btype(),
                                'owner.usrname': bucket.owner() ? bucket.owner().usrname() : '',
                                create_time: bucket.create_time() ? new Date(bucket.create_time()) : null,
                                bucket: bucket  // Store the original bucket object for later use
                            }));
                            return {
                                count: typeof result.count === 'number' && !isNaN(result.count) ? result.count : items.length,
                                items
                            };
                        })
                    );
                }),
                catchError(error => {
                    console.error('Error in bucketIdQuery:', error);
                    return of({count: 0, items: []});
                })
            );
        };
    }

    initCellTextGenerator() {
        this.cellTextGenerator = {
            id: (row: any) => row.id != null ? String(row.id) : '',
            name: (row: any) => row.name != null ? String(row.name) : '',
            description: (row: any) => row.description != null ? String(row.description) : '',
            btype: (row: any) => row.btype != null ? String(row.btype) : '',
            'owner.usrname': (row: any) => row['owner.usrname'] != null ? String(row['owner.usrname']) : '',
            create_time: (row: any) =>
                row.create_time ? this.datePipe.transform(row.create_time, 'medium') || '' : ''
        };
    }

    isCurrentView(view: string): boolean {
        return this.currentView === view;
    }

    getViewKeys(): string[] {
        return Object.keys(this.views)
            .filter(key => this.views[key].label !== null)
            .sort((a, b) => {
                const sortA = this.views[a].sort_key;
                const sortB = this.views[b].sort_key;
                if (sortA === null || sortB === null) {
                    return 0;
                }
                return sortA - sortB;
            });
    }

    switchTo(view: string) {
        this.currentView = view;
        if (this.grid) {
            this.grid.reload();
        }
    }

    initViews() {
        this.views = {
            user: {
                label: $localize`My buckets`,
                sort_key: 1,
                count: -1,
                bucketIdQuery: async (pager, sort, justCount) => {
                    try {
                        let options: any = {};
                        if (pager && !justCount) {
                            options.limit = pager.limit;
                            options.offset = pager.offset;
                        }
                        if (sort && sort.length && !justCount) {
                            options.order_by = {
                                cub: sort.map(s => ({
                                    field: s.name,
                                    direction: s.dir.toUpperCase()
                                }))
                            };
                        }
                        const search = { 
                            owner: this.userId || this.auth.user().id(), 
                            btype: 'staff_client' 
                        };
                        if (justCount) {
                            const count = await this.pcrud.search('cub', search, {count: true}).toPromise();
                            const numericCount = Number(count);
                            this.views.user.count = isNaN(numericCount) ? 0 : numericCount;
                            return { bucketIds: [], count: this.views.user.count };
                        } else {
                            let ids = await this.pcrud.search('cub', search, options, {idlist: true}).toPromise();
                            if (typeof ids === 'number') ids = [ids];
                            if (!Array.isArray(ids)) ids = [];
                            // Always update count to reflect the current number of buckets
                            this.views.user.count = ids.length;
                            // Also, if count is 0, force update
                            if (this.views.user.count === 0) this.views.user.count = 0;
                            return { bucketIds: ids, count: ids.length };
                        }
                    } catch (error) {
                        console.error('Error in user bucketIdQuery:', error);
                        this.views.user.count = 0;
                        return { bucketIds: [], count: 0 };
                    }
                }
            },
            recent: {
                label: $localize`Recent`,
                sort_key: 2,
                count: -1,
                bucketIdQuery: async (pager, sort, justCount) => {
                    try {
                        const recentBucketIds = this.bucketService.recentPatronBucketIds();
                        
                        if (!recentBucketIds || !recentBucketIds.length) {
                            this.views.recent.count = 0;
                            return { bucketIds: [], count: 0 };
                        }
                        
                        if (justCount) {
                            this.views.recent.count = recentBucketIds.length;
                            return { bucketIds: [], count: recentBucketIds.length };
                        } else {
                            // Apply paging if needed
                            let idsToUse = recentBucketIds;
                            if (pager) {
                                const start = pager.offset;
                                const end = Math.min(start + pager.limit, recentBucketIds.length);
                                idsToUse = recentBucketIds.slice(start, end);
                            }
                            
                            return { bucketIds: idsToUse, count: recentBucketIds.length };
                        }
                    } catch (error) {
                        console.error('Error in recent bucketIdQuery:', error);
                        return { bucketIds: [], count: 0 };
                    }
                }
            },
            retrieved_by_id: {
                label: null,
                sort_key: null,
                count: null,
                bucketIdQuery: async (pager, sort, justCount) => {
                    if (!this.bucketIdToRetrieve) {
                        return { bucketIds: [], count: 0 };
                    }
                    
                    const bucketIds = [this.bucketIdToRetrieve];
                    return { bucketIds: bucketIds, count: bucketIds.length };
                }
            }
        };
    }

    updateCounts() {
        this.countInProgress = true;
        
        const promises = this.getViewKeys().map(viewKey => {
            return this.views[viewKey].bucketIdQuery(null, null, true)
                .then(result => {
                    this.views[viewKey].count = result.count;
                })
                .catch(error => {
                    console.error(`Error getting count for view ${viewKey}:`, error);
                    this.views[viewKey].count = 0;
                });
        });

        Promise.all(promises).finally(() => {
            this.countInProgress = false;
        });
    }

    gridSelectionChange(selected: any[]) {
        this.noSelectedRows = selected.length === 0;
        this.oneSelectedRow = selected.length === 1;
    }

    retrieveBucketById() {
        if (!this.bucketIdToRetrieve) return;
        
        this.testReferencedBucket(this.bucketIdToRetrieve, (bucket: IdlObject) => {
            this.jumpToBucketContent(this.bucketIdToRetrieve);
        });
    }

    testReferencedBucket(bucketId: number, callback: Function) {
        this.pcrud.retrieve('cub', bucketId).subscribe({
            next: (response) => {
                const evt = this.evt.parse(response);
                if (evt) {
                    console.error(evt.toString());
                    this.retrieveByIdFail.dialogBody = evt.toString();
                    this.retrieveByIdFail.open();
                } else {
                    callback(response);
                }
            },
            error: (response: unknown) => {
                console.error(response);
                this.retrieveByIdFail.open();
            }
        });
    }

    jumpToBucketContent(bucketId: number) {
        this.bucketService.logPatronBucket(bucketId);
        this.router.navigate(['/staff/circ/patron/bucket/content', bucketId]).catch(err => {
            this.toast.danger($localize`Navigation error: ${err.message || err}`);
        });
    }

    openNewBucketDialog = async () => {
        try {
            this.newBucketDialog.bucketClass = 'user';
            this.newBucketDialog.bucketType = 'staff_client';
            this.newBucketDialog.itemIds = [];
            const results = await lastValueFrom(this.newBucketDialog.open());
            this.bucketService.requestPatronBucketsRefresh();
            this.toast.success($localize`Bucket created successfully`);
        } catch (error) {
            this.toast.danger($localize`Error creating bucket: ${error.message || error}`);
        }
    }

    openEditBucketDialog = async (rows: any[]) => {
        if (!rows.length) return;
        try {
            const bucket = rows[0].bucket;
            const bucketId = bucket.id();
            this.editDialog.mode = 'update';
            this.editDialog.recordId = bucketId;
            this.editDialog.idlClass = 'cub';
            const editRef = this.editDialog.open();
            const result = await lastValueFrom(editRef);
            if (result) {
                this.bucketService.requestPatronBucketsRefresh();
                this.toast.success($localize`Bucket successfully updated`);
            }
        } catch (error) {
            this.toast.danger($localize`Error updating bucket: ${error.message || error}`);
        }
    }

    openDeleteBucketDialog = async (rows: any[]) => {
        if (!rows.length) return;
        try {
            const confirmation = await lastValueFrom(this.deleteDialog.open());
            if (!confirmation) return;
            const bucketIds = rows.map(row => row.bucket.id());
            const results = await Promise.all(bucketIds.map(id => this.deleteBucket(id)));
            const failures = results.filter(r => !r.success);
            if (failures.length > 0) {
                this.deleteFail.open();
            } else {
                this.toast.success($localize`Bucket(s) successfully deleted`);
            }
            this.bucketService.requestPatronBucketsRefresh();
        } catch (error) {
            this.toast.danger($localize`Error deleting bucket: ${error.message || error}`);
            this.deleteFail.open();
        }
    }

    private async deleteBucket(bucketId: number): Promise<{success: boolean, message?: string}> {
        try {
            const response = await lastValueFrom(
                this.net.request(
                    'open-ils.actor',
                    'open-ils.actor.container.full_delete',
                    this.auth.token(), 'user', bucketId
                )
            );
            
            const evt = this.evt.parse(response);
            if (evt) {
                console.error('Delete bucket error:', evt);
                return {success: false, message: evt.toString()};
            }
            
            return {success: true};
        } catch (error) {
            console.error('Error deleting bucket:', error);
            return {success: false, message: 'Unknown error'};
        }
    }

    openTransferDialog = async (rows: any[]) => {
        if (!rows.length) return;
        
        this.transferDialog.containerType = 'user';
        this.transferDialog.containerObjects = rows.map(row => row.bucket);
        
        try {
            const results = await lastValueFrom(this.transferDialog.open());
            if (results?.success) {
                this.bucketService.requestPatronBucketsRefresh();
                this.toast.success($localize`Bucket ownership transferred`);
            }
        } catch (error) {
            console.error('Error in transfer dialog:', error);
        }
    }

    openShareBucketDialog = async (rows: any[]) => {
        if (!rows.length) return;
        
        this.shareBucketDialog.containerObjects = rows.map(row => row.bucket);
        
        try {
            const results = await lastValueFrom(this.shareBucketDialog.open());
            if (results?.success) {
                this.bucketService.requestPatronBucketsRefresh();
                this.toast.success($localize`Bucket sharing updated`);
            }
        } catch (error) {
            console.error('Error in share dialog:', error);
        }
    }
}
