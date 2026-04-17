import {OnInit, OnDestroy, ViewChild, Input, Directive} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {ChangeDetectorRef} from '@angular/core';
import {from, Observable, Subject, lastValueFrom, firstValueFrom, defaultIfEmpty, EMPTY, forkJoin,
    map, switchMap, takeUntil, take, catchError} from 'rxjs';
import {AuthService} from '@eg/core/auth.service';
import {IdlService, IdlObject} from '@eg/core/idl.service';
import {NetService} from '@eg/core/net.service';
import {EventService} from '@eg/core/event.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {GridComponent} from '@eg/share/grid/grid.component';
import {GridDataSource, GridCellTextGenerator, GridColumnSort} from '@eg/share/grid/grid';
import {GridFlatDataService} from '@eg/share/grid/grid-flat-data.service';
import {Pager} from '@eg/share/util/pager';
import {FmRecordEditorComponent} from '@eg/share/fm-editor/fm-editor.component';
import {BucketTransferDialogComponent} from '@eg/staff/share/buckets/bucket-transfer-dialog.component';
import {BucketShareDialogComponent} from '@eg/staff/share/buckets/bucket-share-dialog.component';
import {BucketDialogComponent} from '@eg/staff/share/buckets/bucket-dialog.component';
import {BucketActionSummaryDialogComponent} from '@eg/staff/share/buckets/bucket-action-summary-dialog.component';
import {ConfirmDialogComponent} from '@eg/share/dialog/confirm.component';
import {AlertDialogComponent} from '@eg/share/dialog/alert.component';
import {BaseBucketService} from './base-bucket.service';
import {BucketTypeConfig} from './bucket-types';

export interface BucketQueryResult {
    bucketIds: number[];
    count: number;
    useGridPager?: boolean;
}

export interface BucketView {
    label: string | null;
    sort_key: number | null;
    count: number | null;
    bucketIdQuery: (pager: Pager, sort: GridColumnSort[], justCount: Boolean) => Promise<BucketQueryResult>;
}

@Directive()
export abstract class BaseBucketListComponent implements OnInit, OnDestroy {

    abstract get config(): BucketTypeConfig;
    abstract get bucketService(): BaseBucketService;

    @Input() userId: Number;

    protected initInProgress = true;
    countInProgress = false;
    protected destroy$ = new Subject<void>();
    views: {[key: string]: BucketView};

    @ViewChild('grid', { static: true }) grid: GridComponent;
    @ViewChild('editDialog', { static: true }) editDialog: FmRecordEditorComponent;
    @ViewChild('deleteDialog', { static: true }) deleteDialog: ConfirmDialogComponent;
    @ViewChild('deleteFail', { static: true }) deleteFail: AlertDialogComponent;
    @ViewChild('retrieveByIdFail', { static: true }) retrieveByIdFail: AlertDialogComponent;
    @ViewChild('results', { static: true }) results: BucketActionSummaryDialogComponent;
    @ViewChild('transferDialog', { static: true }) transferDialog: BucketTransferDialogComponent;
    @ViewChild('shareBucketDialog', { static: true }) shareBucketDialog: BucketShareDialogComponent;
    @ViewChild('newBucketDialog', { static: true }) newBucketDialog: BucketDialogComponent;

    cellTextGenerator: GridCellTextGenerator;
    currentView = 'user';
    dataSource: GridDataSource;
    noSelectedRows: boolean;
    oneSelectedRow: boolean;
    favoriteIds: number[] = [];
    containerDeletionResultMap = {};

    constructor(
        protected router: Router,
        protected route: ActivatedRoute,
        protected cdr: ChangeDetectorRef,
        protected auth: AuthService,
        protected idl: IdlService,
        protected pcrud: PcrudService,
        protected net: NetService,
        protected evt: EventService,
        protected flatData: GridFlatDataService,
    ) {}

    async ngOnInit() {
        this.initInProgress = true;

        this.route.url.pipe(takeUntil(this.destroy$)).subscribe(segments => {
            if (segments.length > 0) {
                const datasource = this.mapUrlToDatasource(segments[0].path);
                if (datasource === 'user' && /^\d+$/.test(segments[0].path)) {
                    // Numeric URL segment — jump directly to bucket content
                    this.jumpToBucketContent(parseInt(segments[0].path, 10));
                    return;
                }
                this.switchTo(datasource);
            } else {
                this.switchTo('user');
            }
        });

        this.cellTextGenerator = {
            name: row => row.name,
            favorite: row => row.favorite,
            'row-actions': row => null
        };

        this.initViews();
        this.initDataSource();
        this.gridSelectionChange([]);
        this.grid.onRowActivate.subscribe(
            (bucket: any) => this.jumpToBucketContent(bucket.id)
        );
        this.editDialog.inPlaceMode = true;
        this.editDialog.recordSaved.pipe(takeUntil(this.destroy$)).subscribe(
            bucket => void this.saveEditedBucket(bucket)
        );

        if (this.config.flagIdlClass) {
            await this.bucketService.loadFavoriteBucketFlags(this.auth.user().id());
            this.favoriteIds = this.bucketService.getFavoriteBucketIds();
        }

        this.initInProgress = false;
        this.updateCounts();
    }

    /**
     * Helper to create a standard view with the common bucketIdQuery pattern.
     * queryFn returns the pcrud query object, or null to indicate empty results.
     */
    protected createStandardView(
        viewKey: string, label: string, sortKey: number,
        queryFn: () => any
    ): BucketView {
        const bc = this.config.bucketIdlClass;
        return {
            label,
            sort_key: sortKey,
            count: -1,
            bucketIdQuery: async (pager, sort, justCount) => {
                const translatedSort = this.pcrud.translateFlatSortComplex(bc, sort);
                const query = queryFn();
                if (!query) {
                    return { bucketIds: [], count: -1 };
                }
                const response = await lastValueFrom(
                    this.search_or_count(justCount, bc, query,
                        {
                            ...(pager?.limit && { limit: pager.limit }),
                            ...(pager?.offset && { offset: pager.offset }),
                            ...(translatedSort && translatedSort),
                        },
                        { idlist: true, atomic: true }
                    )
                );
                if (justCount) {
                    const result = { bucketIds: [], count: response as number };
                    this.views[viewKey].count = result.count;
                    return result;
                } else {
                    const ids = response as number[];
                    return { bucketIds: ids, count: ids.length };
                }
            }
        };
    }

    initViews() {
        const bc = this.config.bucketIdlClass;
        const sc = this.config.shareIdlClass;
        const userId = () => this.userId || this.auth.user().id();

        this.views = {
            user: this.createStandardView('user', $localize`My buckets`, 1,
                () => ({ owner: userId() })),

            all: this.createStandardView('all', $localize`Public`, 10,
                () => ({ owner: { '!=': userId() }, pub: 't' })),

            recent: {
                label: $localize`Recent`,
                sort_key: 3,
                count: -1,
                bucketIdQuery: async (pager, sort, justCount) => {
                    const rawIds = this.bucketService.recentBucketIds();
                    if (rawIds.length === 0) {
                        if (justCount) { this.views['recent'].count = 0; }
                        return { bucketIds: [], count: 0, useGridPager: true };
                    }
                    const ids = await this.bucketService.filterAccessibleIds(rawIds);
                    if (justCount) {
                        this.views['recent'].count = ids.length;
                        return { bucketIds: [], count: ids.length, useGridPager: true };
                    }
                    return { bucketIds: ids, count: ids.length, useGridPager: true };
                }
            }
        };

        if (this.config.flagIdlClass) {
            this.views['favorites'] = {
                label: $localize`Favorites`,
                sort_key: 2,
                count: -1,
                bucketIdQuery: async (pager, sort, justCount) => {
                    this.favoriteIds = this.bucketService.getFavoriteBucketIds();
                    if (this.favoriteIds.length === 0) {
                        if (justCount) { this.views['favorites'].count = 0; }
                        return { bucketIds: [], count: 0, useGridPager: true };
                    }
                    const ids = await this.bucketService.filterAccessibleIds(this.favoriteIds);
                    if (justCount) {
                        this.views['favorites'].count = ids.length;
                        return { bucketIds: [], count: ids.length, useGridPager: true };
                    }
                    return { bucketIds: ids, count: ids.length, useGridPager: true };
                }
            };
        }

        if (sc) {
            this.views['shared_with_others'] = this.createStandardView('shared_with_others', $localize`Shared with others`, 4,
                () => ({ owner: { '=': userId() }, '-or': [
                    {'-exists': {from: sc, where: {bucket: {'=': {['+' + bc]: 'id'}}}}},
                    {'-exists': {from: 'puopm', where: {
                        object_type: bc,
                        ['+' + bc]: {id: {'=': {transform: 'text', value: {'+puopm': 'object_id'}}}}}
                    }}
                ]}));

            this.views['shared_with_user'] = {
                label: $localize`Shared with me`,
                sort_key: 5,
                count: -1,
                bucketIdQuery: async (pager, sort, justCount) => {
                    if (!this.config.sharedWithUserApi) {
                        return { bucketIds: [], count: 0, useGridPager: true };
                    }

                    if (justCount) {
                        const count = await this.bucketService.countBucketsSharedWithUser();
                        this.views['shared_with_user'].count = count;
                        return { bucketIds: [], count, useGridPager: true };
                    }

                    const bucketIds = await this.bucketService.retrieveBucketsSharedWithUser();
                    return { bucketIds, count: bucketIds.length, useGridPager: true };
                }
            };
        }
    }

    search_or_count(justCount, hint, query, pcrudOps, pcrudReqOps): Observable<number | any[]> {
        if (!justCount) {
            const query_filters = this.extractGridFilters();
            if (query_filters.length > 0) {
                query['-and'] = query_filters;
            }
        }
        return this.pcrud.search(hint, {...query, btype: { '!=': 'temp' }}, pcrudOps, {...pcrudReqOps, count_only: justCount});
    }

    async updateCounts() {
        if (this.initInProgress) { return; }
        if (this.countInProgress) { return; }

        this.countInProgress = true;

        const viewKeys = this.getViewKeys();
        viewKeys.forEach(v => { this.views[v].count = -1; });

        Promise.all(
            viewKeys.map(v => this.views[v].bucketIdQuery(null, [], true))
        ).catch(
            error => console.error('Error updating counts:', error)
        ).finally(() => {
            this.countInProgress = false;
        });
    }

    getViewKeys(): string[] {
        const viewEntries = Object.entries(this.views)
            .filter(([key, view]) => key && view.label !== null)
            .map(([key, view]) => ({ key, sort_key: view.sort_key }))
            .sort((a, b) => a.sort_key - b.sort_key);
        return viewEntries.map(entry => entry.key);
    }

    isCurrentView(view: string): boolean {
        return this.currentView === view || (!this.currentView && view === 'user');
    }

    gridSelectionChange(keys: string[]) {
        this.updateSelectionState(keys);
    }

    updateSelectionState(keys: string[]) {
        this.noSelectedRows = (keys.length === 0);
        this.oneSelectedRow = (keys.length === 1);
    }

    initDataSource() {
        this.dataSource = new GridDataSource();
        this.dataSource.getRows = (pager: Pager, sort: any[]): Observable<any> => {
            return from(this.views[this.currentView].bucketIdQuery(pager, sort, false)).pipe(
                switchMap(response => {
                    if (response.bucketIds.length === 0) {
                        return EMPTY;
                    }
                    const query = this.buildRetrieveByIdsQuery(response.bucketIds);

                    return forkJoin({
                        countStats: this.bucketService.getBucketCountStats(response.bucketIds),
                        accessLevels: from(this.bucketService.getAccessLevels(response.bucketIds))
                    }).pipe(
                        switchMap(({countStats, accessLevels}) => {
                            const retrievePager = response.useGridPager ? pager : new Pager();
                            return this.flatData.getRows(this.grid.context, query, retrievePager, sort).pipe(
                                map(row => {
                                    return {
                                        ...row,
                                        item_count: countStats[row.id]?.item_count || 0,
                                        org_share_count: countStats[row.id]?.org_share_count || 0,
                                        usr_view_share_count: countStats[row.id]?.usr_view_share_count || 0,
                                        usr_edit_share_count: countStats[row.id]?.usr_update_share_count || 0,
                                        favorite: this.bucketService.isFavoriteBucket(row.id),
                                        my_access: accessLevels[row.id] || 'none'
                                    };
                                })
                            );
                        })
                    );
                }),
                catchError((error: unknown) => {
                    console.error('Error in getRows:', error);
                    return EMPTY;
                })
            );
        };
    }

    mapUrlToDatasource(url: string): string {
        const mapping = {
            'admin': 'admin',
            'all': 'all',
            'user': 'user',
            'favorites': 'favorites',
            'recent': 'recent',
            'shared-with-others': 'shared_with_others',
            'shared-with-user': 'shared_with_user'
        };
        return mapping[url] || 'user';
    }

    mapDatasourceToUrl(datasource: string): string {
        const mapping = {
            'admin': 'admin',
            'all': 'all',
            'user': 'user',
            'favorites': 'favorites',
            'recent': 'recent',
            'shared_with_others': 'shared-with-others',
            'shared_with_user': 'shared-with-user'
        };
        return mapping[datasource] || 'user';
    }

    switchTo(source: string) {
        this.currentView = source;
        this.router.navigate([this.mapDatasourceToUrl(source)], { relativeTo: this.route.parent });
    }

    extractGridFilters() {
        let query_filters = [];
        Object.keys(this.dataSource.filters).forEach(key => {
            query_filters = query_filters.concat(this.dataSource.filters[key]);
        });
        return query_filters;
    }

    buildRetrieveByIdsQuery(bucketIds: number[]) {
        const query: any = {};
        query['id'] = bucketIds.length === 0 ? [-1] : bucketIds.map(b => this.idl.pkeyValue(b));

        const query_filters = this.extractGridFilters();
        if (query_filters.length > 0) {
            query['-and'] = query_filters;
        }

        return query;
    }

    async testReferencedBucket(bucketId: number, callback: Function) {
        const fleshedBucket = await this.bucketService.checkBucketAccess(bucketId);
        if (fleshedBucket) {
            callback(fleshedBucket);
        } else {
            this.retrieveByIdFail.dialogBody =
                $localize`This bucket could not be loaded. It may not exist, or it may belong to another user and has not been shared with you.`;
            this.retrieveByIdFail.open();
        }
    }

    jumpToBucketContent(bucketId: number) {
        this.testReferencedBucket(bucketId, () => {
            this.router.navigate(['bucket', bucketId], { relativeTo: this.route.parent });
        });
    }

    openEditBucketDialog = async (rows: any[]) => {
        if (!rows.length) { return; }
        const bucket = await this.bucketService.checkBucketAccess(rows[0].id);
        if (!bucket) {
            this.showErrorDialog(
                'Could not load bucket.',
                $localize`This bucket could not be loaded. It may not exist, or it may belong to another user and has not been shared with you.`
            );
            return;
        }
        this.editDialog.mode = 'update';
        this.editDialog.record = bucket;
        this.editDialog.open().subscribe();
    };

    openNewBucketDialog = async (rows: any[]) => {
        this.newBucketDialog.containerType = this.config.containerType;

        try {
            const dialogObservable = this.newBucketDialog.open({size: 'lg'}).pipe(
                catchError((error: unknown) => {
                    console.debug('Error in dialog observable; this can happen if we close() with no arguments:', error);
                    return EMPTY;
                }),
                takeUntil(this.destroy$),
            );

            await lastValueFrom(dialogObservable, { defaultValue: null });
            this.grid.reload();
            this.updateCounts();
        } catch (error) {
            console.error('Error in new bucket dialog:', error);
        }
    };

    openDeleteBucketDialog = async (rows: any[]) => {
        if (!rows || rows.length === 0) { return; }

        const performDelete = async (override = false): Promise<number> => {
            const method = override
                ? 'open-ils.actor.containers.full_delete.override'
                : 'open-ils.actor.containers.full_delete';

            return new Promise((resolve, reject) => {
                this.net.request(
                    'open-ils.actor',
                    method,
                    this.auth.token(),
                    this.config.containerType,
                    rows.map(r => r.id)
                ).pipe(
                    take(1),
                    takeUntil(this.destroy$)
                ).subscribe({
                    next: (response) => {
                        const evt = this.evt.parse(response);
                        if (evt) {
                            console.error(evt.toString());
                            this.showErrorDialog(
                                $localize`Could not delete bucket(s).`,
                                evt.toString()
                            );
                            resolve(0);
                        } else {
                            let carousels = 0;
                            Object.entries(response).forEach(([id, result2]) => {
                                let pass_or_fail = $localize`Deleted`;
                                const evt2 = this.evt.parse(result2);
                                if (evt2) {
                                    pass_or_fail = evt2.toString();
                                    if (evt2.textcode === 'BUCKET_LINKED_TO_CAROUSEL') {
                                        carousels++;
                                    }
                                }
                                this.containerDeletionResultMap[id] = pass_or_fail;
                            });
                            resolve(carousels);
                        }
                    },
                    error: (error: unknown) => {
                        console.error(error);
                        this.showErrorDialog(
                            $localize`Could not delete bucket(s).`,
                            error.toString()
                        );
                        reject(error);
                    },
                    complete: () => {
                        this.grid.reload();
                        this.updateCounts();
                    }
                });
            });
        };

        try {
            this.deleteDialog.dialogBody = rows.map(r => r.id || '').join(', ');
            const deleteConfirmed = await firstValueFrom(this.deleteDialog.open().pipe(
                defaultIfEmpty(false),
                catchError(() => EMPTY)
            ));

            if (!deleteConfirmed) { return; }

            this.containerDeletionResultMap = {};
            let carouselsCount = await performDelete();

            await firstValueFrom(this.results.open(rows, this.containerDeletionResultMap).pipe(
                defaultIfEmpty(null),
                catchError(() => EMPTY)
            ));

            if (carouselsCount > 0) {
                if (await this.confirmDeleteOverride(rows)) {
                    await performDelete(true);
                    await firstValueFrom(this.results.open(rows, this.containerDeletionResultMap).pipe(
                        defaultIfEmpty(null),
                        catchError(() => EMPTY)
                    ));
                }
            }

            this.grid.reload();
            this.updateCounts();
        } catch (error) {
            console.error('openDeleteBucketDialog error:', error);
        }
    };

    openTransferDialog = async (rows: any[]) => {
        if (!rows || rows.length === 0) { return; }

        this.transferDialog.containerType = this.config.containerType;
        this.transferDialog.containerObjects = rows;

        try {
            const dialogRef$ = this.transferDialog.open({size: 'lg'}).pipe(
                take(1),
                catchError((error: unknown) => {
                    console.debug('openTransferDialog, error', error);
                    return EMPTY;
                }),
                takeUntil(this.destroy$),
            );

            await firstValueFrom(dialogRef$);

            setTimeout(() => {
                this.grid.reload();
                this.updateCounts();
            }, 1000);
        } catch (error) {
            console.error('openTransferDialog error', error);
        }
    };

    openShareBucketDialog = async (rows: any[]) => {
        if (!rows || rows.length !== 1) { return; }

        console.warn('openShareBucketDialog: rows =', rows, 'containerType =', this.config.containerType);
        this.shareBucketDialog.containerType = this.config.containerType;
        this.shareBucketDialog.containerObjects = rows;
        console.warn('openShareBucketDialog: containerObjects set, containerIds will be =', rows.map(r => r.id));
        await this.shareBucketDialog.loadAouTree();
        await this.shareBucketDialog.populateCheckedNodes();
        await this.shareBucketDialog.loadAuGridViewPermGrid();
        await this.shareBucketDialog.loadAuGridEditPermGrid();
        console.warn('openShareBucketDialog: after loads, usersViewPermGrid =', this.shareBucketDialog.usersViewPermGrid, 'usersEditPermGrid =', this.shareBucketDialog.usersEditPermGrid);

        try {
            const dialogRef$ = this.shareBucketDialog.open({size: 'lg'}).pipe(
                take(1),
                catchError((error: unknown) => {
                    console.debug('openShareBucketDialog, error', error);
                    return EMPTY;
                }),
                takeUntil(this.destroy$),
            );

            await firstValueFrom(dialogRef$);

            setTimeout(() => {
                this.grid.reload();
                this.updateCounts();
            }, 1000);
        } catch (error) {
            console.error('openShareBucketDialog error', error);
        }
    };

    favoriteBucket = async (rows: any[]) => {
        if (!rows || rows.length === 0) { return; }
        const targets = rows.filter(row => !this.bucketService.isFavoriteBucket(row.id));
        if (targets.length === 0) { return; }

        const results = await Promise.allSettled(
            targets.map(row => this.bucketService.addFavoriteBucketFlag(row.id, this.auth.user().id()))
        );

        const updatedIds: number[] = [];
        results.forEach((result, index) => {
            const row = targets[index];
            if (result.status === 'fulfilled') {
                row.favorite = true;
                updatedIds.push(row.id);
            } else {
                console.error(`Error adding favorite for bucket ${row.id}:`, result.reason);
            }
        });

        if (updatedIds.length === 0) { return; }

        this.syncFavoriteIds();
        this.patchLoadedFavoriteState(updatedIds, true);
        this.adjustFavoritesCount(updatedIds.length);
        this.cdr.detectChanges();
    };

    unFavoriteBucket = async (rows: any[]) => {
        if (!rows || rows.length === 0) { return; }
        const targets = rows.filter(row => this.bucketService.isFavoriteBucket(row.id));
        if (targets.length === 0) { return; }

        const results = await Promise.allSettled(
            targets.map(row => this.bucketService.removeFavoriteBucketFlag(row.id))
        );

        const updatedIds: number[] = [];
        results.forEach((result, index) => {
            const row = targets[index];
            if (result.status === 'fulfilled') {
                row.favorite = false;
                updatedIds.push(row.id);
            } else {
                console.error(`Error removing favorite for bucket ${row.id}:`, result.reason);
            }
        });

        if (updatedIds.length === 0) { return; }

        this.syncFavoriteIds();
        this.patchLoadedFavoriteState(updatedIds, false);
        this.adjustFavoritesCount(-updatedIds.length);

        if (this.currentView === 'favorites') {
            await this.pruneFavoritesViewRows(updatedIds);
        } else {
            this.cdr.detectChanges();
        }
    };

    protected syncFavoriteIds() {
        this.favoriteIds = this.bucketService.getFavoriteBucketIds();
    }

    protected patchLoadedFavoriteState(bucketIds: number[], favorite: boolean) {
        if (!this.dataSource?.data?.length || bucketIds.length === 0) { return; }
        const ids = new Set(bucketIds);
        this.dataSource.data.forEach(row => {
            if (row && ids.has(row.id)) {
                row.favorite = favorite;
            }
        });
    }

    protected adjustFavoritesCount(delta: number) {
        if (!this.views?.favorites) { return; }
        if (typeof this.views.favorites.count !== 'number' || this.views.favorites.count < 0) { return; }
        this.views.favorites.count = Math.max(0, this.views.favorites.count + delta);
    }

    protected async pruneFavoritesViewRows(bucketIds: number[]) {
        if (!this.dataSource?.data?.length || bucketIds.length === 0) {
            this.cdr.detectChanges();
            return;
        }

        const ids = new Set(bucketIds);
        this.dataSource.data = this.dataSource.data.filter(row => !row || !ids.has(row.id));

        this.grid?.context?.rowSelector?.clear();
        this.updateSelectionState([]);

        const pager = this.grid?.context?.pager;
        if (pager && typeof pager.resultCount === 'number') {
            pager.resultCount = Math.max(0, pager.resultCount - bucketIds.length);
            if (pager.resultCount > 0 && pager.currentPage() > pager.pageCount()) {
                pager.toLast();
                return;
            }
        }

        if (pager) {
            await this.dataSource.requestPage(pager);
        }

        this.cdr.detectChanges();
    }

    protected async confirmDeleteOverride(rows: any[]): Promise<boolean> {
        return false;
    }

    protected showErrorDialog(title: string, body: string) {
        this.deleteFail.dialogTitle = title;
        this.deleteFail.dialogBody = body;
        this.deleteFail.open();
    }

    protected async saveEditedBucket(bucket: IdlObject): Promise<void> {
        try {
            const response = await firstValueFrom(this.net.request(
                'open-ils.actor',
                'open-ils.actor.container.update',
                this.auth.token(),
                this.config.containerType,
                bucket
            ));

            const evt = this.evt.parse(response);
            if (evt) {
                console.error(evt.toString());
                this.showErrorDialog('Could not save bucket.', evt.toString());
                return;
            }

            this.grid.reload();
            this.updateCounts();
        } catch (error) {
            console.error('saveEditedBucket error:', error);
            this.showErrorDialog(
                'Could not save bucket.',
                error?.toString?.() || String(error)
            );
        }
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }
}
