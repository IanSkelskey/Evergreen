import {Component, OnInit, OnDestroy, ViewChild} from '@angular/core';
import {Router, ActivatedRoute} from '@angular/router';
import {Observable, Subject, from, lastValueFrom, EMPTY} from 'rxjs';
import {takeUntil, filter, catchError} from 'rxjs/operators';
import {AuthService} from '@eg/core/auth.service';
import {IdlObject} from '@eg/core/idl.service';
import {NetService} from '@eg/core/net.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {EventService} from '@eg/core/event.service';
import {OrgService} from '@eg/core/org.service';
import {GridComponent} from '@eg/share/grid/grid.component';
import {GridDataSource, GridCellTextGenerator} from '@eg/share/grid/grid';
import {Pager} from '@eg/share/util/pager';
import {ToastService} from '@eg/share/toast/toast.service';
import {DialogComponent} from '@eg/share/dialog/dialog.component';
import {ConfirmDialogComponent} from '@eg/share/dialog/confirm.component';
import {AlertDialogComponent} from '@eg/share/dialog/alert.component';
import {PromptDialogComponent} from '@eg/share/dialog/prompt.component';
import {BucketDialogComponent} from '@eg/staff/share/buckets/bucket-dialog.component';
import {BucketTransferDialogComponent} from '@eg/staff/share/buckets/bucket-transfer-dialog.component';
import {BucketShareDialogComponent} from '@eg/staff/share/buckets/bucket-share-dialog.component';
import {PatronBucketService} from './patron-bucket.service';

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
    userId: number;
    countInProgress = false;
    favoriteIds: number[] = [];
    noSelectedRows = true;
    oneSelectedRow = false;

    @ViewChild('grid', {static: true}) private grid: GridComponent;
    @ViewChild('newBucketDialog') private newBucketDialog: BucketDialogComponent;
    @ViewChild('editDialog') private editDialog: DialogComponent;
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
        private bucketService: PatronBucketService
    ) {}

    ngOnInit() {
        console.log('PatronBucketComponent initialized');
        
        this.initCellTextGenerator();
        this.initDataSource();
        this.initViews();

        this.userId = this.auth.user().id();
        this.loadFavorites();

        this.route.paramMap.pipe(
            takeUntil(this.destroy$)
        ).subscribe(params => {
            const id = params.get('id');
            if (id) {
                console.log('Route param id:', id);
                this.bucketIdToRetrieve = Number(id);
                this.currentView = 'retrieved_by_id';
                this.grid.reload();
            }
        });

        this.route.url.pipe(
            takeUntil(this.destroy$)
        ).subscribe(segments => {
            console.log('Route segments:', segments);
            const path = segments[0]?.path;
            if (path && this.views[path]) {
                this.currentView = path;
                this.grid.reload();
            } else if (!this.currentView) {
                this.currentView = 'user';
                this.grid.reload();
            }
        });

        this.bucketService.patronBucketsRefreshRequested$.pipe(
            takeUntil(this.destroy$)
        ).subscribe(() => {
            this.grid.reload();
            this.updateCounts();
        });
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }

    private async loadFavorites() {
        await this.bucketService.loadFavoritePatronBucketFlags(this.userId);
        this.favoriteIds = this.bucketService.getFavoritePatronBucketIds();
    }

    private initCellTextGenerator() {
        this.cellTextGenerator = {
            'owner.usrname': row => row['owner.usrname'],
            'owning_lib.shortname': row => row['owning_lib.shortname']
        };
    }

    private initDataSource() {
        this.dataSource.getRows = (pager: Pager, sort: any[]) => {
            const view = this.views[this.currentView];
            if (!view) {
                return from([]);
            }

            return from(
                view.bucketIdQuery(pager, sort, false)
                    .then(result => this.bucketService.retrievePatronBuckets(result.bucketIds))
            );
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
        this.router.navigate(['/staff/circ/patron/bucket', view]);
    }

    initViews() {
        this.views = {
            user: {
                label: $localize`My buckets`,
                sort_key: 1,
                count: -1,
                bucketIdQuery: async (pager, sort, justCount) => {
                    const translatedSort = this.pcrud.translateFlatSortComplex('cub', sort);
                    let result: BucketQueryResult;
                    const response = await lastValueFrom(
                        this.search_or_count(justCount, 'cub',
                            { owner: this.userId || this.auth.user().id(), btype: 'staff_client' },
                            {
                                ...(pager?.limit && { limit: pager.limit }),
                                ...(pager?.offset && { offset: pager.offset }),
                                ...(translatedSort && translatedSort),
                            },
                            { idlist: true, atomic: true }
                        )
                    );
                    if (justCount) {
                        result = { bucketIds: [], count: response as number };
                        this.views['user']['count'] = result['count'];
                    } else {
                        const ids = response as number[];
                        result = { bucketIds: ids, count: ids.length };
                    }
                    return result;
                }
            },
            favorites: {
                label: $localize`Favorites`,
                sort_key: 2,
                count: -1,
                bucketIdQuery: async (pager, sort, justCount) => {
                    this.favoriteIds = this.bucketService.getFavoritePatronBucketIds();
                    let result: BucketQueryResult;
                    if (this.favoriteIds.length) {
                        const response = await lastValueFrom(
                            this.search_or_count(justCount, 'cub',
                                { id: this.favoriteIds },
                                {
                                    ...(pager?.limit && { limit: pager.limit }),
                                    ...(pager?.offset && { offset: pager.offset }),
                                    ...(sort && { order_by: sort }),
                                },
                                { idlist: true, atomic: true }
                            )
                        );
                        if (justCount) {
                            result = { bucketIds: [], count: response as number };
                            this.views['favorites']['count'] = result['count'];
                        } else {
                            const ids = response as number[];
                            result = { bucketIds: ids, count: ids.length };
                        }
                    } else {
                        result = { bucketIds: [], count: 0 };
                        this.views['favorites']['count'] = 0;
                    }
                    return result;
                }
            },
            recent: {
                label: $localize`Recent`,
                sort_key: 3,
                count: -1,
                bucketIdQuery: async (pager, sort, justCount) => {
                    const recentBucketIds = this.bucketService.recentPatronBucketIds();
                    let result: BucketQueryResult;
                    if (recentBucketIds.length) {
                        const response = await lastValueFrom(
                            this.search_or_count(justCount, 'cub',
                                { id: recentBucketIds },
                                {
                                    ...(pager?.limit && { limit: pager.limit }),
                                    ...(pager?.offset && { offset: pager.offset }),
                                    ...(sort && { order_by: sort }),
                                },
                                { idlist: true, atomic: true }
                            )
                        );
                        if (justCount) {
                            result = { bucketIds: [], count: response as number };
                            this.views['recent']['count'] = result['count'];
                        } else {
                            const ids = response as number[];
                            result = { bucketIds: ids, count: ids.length };
                        }
                    } else {
                        result = { bucketIds: [], count: 0 };
                        this.views['recent']['count'] = 0;
                    }
                    return result;
                }
            },
            retrieved_by_id: {
                label: null,
                sort_key: null,
                count: null,
                bucketIdQuery: async (pager, sort, justCount) => {
                    const bucketIds = this.bucketIdToRetrieve ? [this.bucketIdToRetrieve] : [];
                    return { bucketIds: bucketIds, count: bucketIds.length };
                }
            }
        };
    }

    private search_or_count(justCount: boolean, idlClass: string, search: any, options: any, pcrudOptions: any) {
        return justCount
            ? this.pcrud.search(idlClass, search, options, { ...pcrudOptions, count: true })
            : this.pcrud.search(idlClass, search, options, pcrudOptions);
    }

    updateCounts() {
        this.countInProgress = true;
        
        const promises = Object.keys(this.views)
            .filter(key => this.views[key].count !== null)
            .map(key => {
                return this.views[key].bucketIdQuery(null, null, true)
                    .then(result => {
                        this.views[key].count = result.count;
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

    mapDatasourceToUrl(datasource: string): string {
        const mapping = {
            'user': 'user',
            'favorites': 'favorites',
            'recent': 'recent',
            'retrieved_by_id': this.bucketIdToRetrieve
        };
        return mapping[datasource] || 'user';
    }

    retrieveBucketById() {
        if (!this.bucketIdToRetrieve) return;
        
        this.testReferencedBucket(this.bucketIdToRetrieve, (bucket: IdlObject) => {
            this.jumpToBucketContent(this.bucketIdToRetrieve);
        });
    }

    testReferencedBucket(bucketId: number, callback: Function) {
        this.pcrud.search('cub', { id: bucketId }).subscribe({
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
        this.router.navigate(['/staff/circ/patron/bucket/content', bucketId]);
    }

    openNewBucketDialog = async () => {
        try {
            this.newBucketDialog.bucketClass = 'user';
            this.newBucketDialog.bucketType = 'staff_client';
            this.newBucketDialog.itemIds = [];
            
            const dialogObservable = this.newBucketDialog.open().pipe(
                catchError((error: unknown) => {
                    console.error('Error in dialog observable:', error);
                    return EMPTY;
                })
            );

            const results = await lastValueFrom(dialogObservable, { defaultValue: null });
            console.debug('New bucket results:', results);

            this.grid.reload();
            this.updateCounts();
        } catch (error) {
            console.error('Error in new bucket dialog:', error);
        }
    };

    openEditBucketDialog = async (rows: any[]) => {
        if (!rows.length) return;
        
        try {
            const bucket = rows[0].bucket;
            
            // Retrieve the record first
            const record = await lastValueFrom(this.pcrud.retrieve('cub', bucket.id));
            
            // Open the dialog with standard options, not with record property
            const editRef = this.editDialog.open();
            
            // Access the component instance and set the record property
            if (editRef) {
                const instance = editRef['componentInstance'];
                if (instance) {
                    instance['record'] = record;
                }
            }
            
            const editObservable = editRef.pipe(
                catchError((error: unknown) => {
                    console.error('Error in edit dialog observable:', error);
                    return EMPTY;
                })
            );

            const result = await lastValueFrom(editObservable, { defaultValue: null });
            if (result) {
                this.bucketService.requestPatronBucketsRefresh();
                this.toast.success($localize`Bucket successfully updated`);
            }
        } catch (error) {
            console.error('Error in edit bucket dialog:', error);
        }
    };

    openDeleteBucketDialog = async (rows: any[]) => {
        if (!rows.length) return;
        
        try {
            const confirmation = await lastValueFrom(this.deleteDialog.open());
            if (!confirmation) return;

            const bucketIds = rows.map(row => row.bucket.id);
            const results = await Promise.all(bucketIds.map(id => this.deleteBucket(id)));
            
            const failures = results.filter(r => !r.success);
            if (failures.length > 0) {
                this.deleteFail.open();
            } else {
                this.toast.success($localize`Bucket(s) successfully deleted`);
            }
            
            this.bucketService.requestPatronBucketsRefresh();
        } catch (error) {
            console.error('Error deleting bucket:', error);
            this.deleteFail.open();
        }
    };

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
        this.transferDialog.containerObjects = rows.map(row => ({id: row.bucket.id}));
        
        try {
            const results = await lastValueFrom(this.transferDialog.open());
            if (results?.success) {
                this.bucketService.requestPatronBucketsRefresh();
                this.toast.success($localize`Bucket ownership transferred`);
            }
        } catch (error) {
            console.error('Error in transfer dialog:', error);
        }
    };

    openShareBucketDialog = async (rows: any[]) => {
        if (!rows.length) return;
        
        this.shareBucketDialog.containerObjects = rows.map(row => ({id: row.bucket.id}));
        
        try {
            const results = await lastValueFrom(this.shareBucketDialog.open());
            if (results?.success) {
                this.bucketService.requestPatronBucketsRefresh();
                this.toast.success($localize`Bucket sharing updated`);
            }
        } catch (error) {
            console.error('Error in share dialog:', error);
        }
    };

    favoriteBucket = async (rows: any[]) => {
        if (!rows.length) return;
        
        for (const row of rows) {
            try {
                await this.bucketService.addFavoritePatronBucketFlag(row.bucket.id, this.auth.user().id());
            } catch (error) {
                console.error('Error adding favorite flag:', error);
            }
        }
        
        this.favoriteIds = this.bucketService.getFavoritePatronBucketIds();
        this.grid.reload();
        this.updateCounts();
    };

    unFavoriteBucket = async (rows: any[]) => {
        if (!rows.length) return;
        
        for (const row of rows) {
            try {
                await this.bucketService.removeFavoritePatronBucketFlag(row.bucket.id);
            } catch (error) {
                console.error('Error removing favorite flag:', error);
            }
        }
        
        this.favoriteIds = this.bucketService.getFavoritePatronBucketIds();
        this.grid.reload();
        this.updateCounts();
    };
}
