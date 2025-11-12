import {ChangeDetectorRef, Component, Input, OnInit, OnDestroy, ViewChild} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {from, Observable, Subject, lastValueFrom, firstValueFrom, defaultIfEmpty, EMPTY,
    map, switchMap, takeUntil, take, catchError} from 'rxjs';
import {AuthService} from '@eg/core/auth.service';
import {IdlObject,IdlService} from '@eg/core/idl.service';
import {FmRecordEditorComponent} from '@eg/share/fm-editor/fm-editor.component';
import {NetService} from '@eg/core/net.service';
import {EventService} from '@eg/core/event.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {BucketService, BucketType} from '@eg/staff/share/buckets/bucket.service';
import {GridComponent} from '@eg/share/grid/grid.component';
import {GridDataSource, GridCellTextGenerator, GridColumnSort} from '@eg/share/grid/grid';
import {GridFlatDataService} from '@eg/share/grid/grid-flat-data.service';
import {Pager} from '@eg/share/util/pager';
import {BucketTransferDialogComponent} from '@eg/staff/share/buckets/bucket-transfer-dialog.component';
import {BucketShareDialogComponent} from '@eg/staff/share/buckets/bucket-share-dialog.component';
import {BucketDialogComponent} from '@eg/staff/share/buckets/bucket-dialog.component';
import {ConfirmDialogComponent} from '@eg/share/dialog/confirm.component';
import {AlertDialogComponent} from '@eg/share/dialog/alert.component';

interface BucketQueryResult {
  bucketIds: number[];
  count: number;
}

interface BucketView {
  label: string | null;
  sort_key: number | null;
  count: number | null;
  bucketIdQuery: (pager: Pager, sort: GridColumnSort[], justCount: Boolean) => Promise<BucketQueryResult>;
}

@Component({
  selector: 'eg-user-bucket',
  templateUrl: './user-bucket.component.html',
  styleUrls: ['./user-bucket.component.css']
})
export class UserBucketComponent implements OnInit, OnDestroy {
  @Input() userId: Number;

  private initInProgress = true;
  private countInProgress = false;
  private destroy$ = new Subject<void>();
  private views: {[key: string]: BucketView};

  bucketType: BucketType = 'user';

  @ViewChild('grid', { static: true }) private grid: GridComponent;
  cellTextGenerator: GridCellTextGenerator;
  currentView = 'user';
  dataSource: GridDataSource;
  bucketIdToRetrieve: number;
  noSelectedRows: boolean;
  oneSelectedRow: boolean;
  favoriteIds: number[] = [];

  @ViewChild('transferDialog', { static: true }) transferDialog: BucketTransferDialogComponent;
  @ViewChild('shareBucketDialog', { static: true }) shareBucketDialog: BucketShareDialogComponent;
  @ViewChild('newBucketDialog', { static: true }) newBucketDialog: BucketDialogComponent;
  @ViewChild('editDialog', { static: true }) editDialog: FmRecordEditorComponent;
  @ViewChild('deleteDialog', { static: true }) deleteDialog: ConfirmDialogComponent;
  @ViewChild('deleteFail', { static: true }) deleteFail: AlertDialogComponent;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private auth: AuthService,
    private idl: IdlService,
    private pcrud: PcrudService,
    private net: NetService,
    private evt: EventService,
    private flatData: GridFlatDataService,
    private bucketService: BucketService,
  ) {}

  async ngOnInit() {
    this.initInProgress = true;

    this.route.url.pipe(takeUntil(this.destroy$)).subscribe(segments => {
      if (segments.length > 0) {
        const datasource = this.mapUrlToDatasource( segments[0].path );
        this.switchTo(datasource);
      } else {
        this.switchTo('user');
      }
    });

    this.cellTextGenerator = {
      name: row => row.name,
      favorite: row => row.favorite,
      'row-actions':  row => null
    };

    this.initViews();
    this.initDataSource();
    this.gridSelectionChange( [] );
    this.grid.onRowActivate.subscribe((bucket: any) => {
      this.jumpToBucketContent(bucket.id);
    });

    await this.bucketService.loadFavoriteBucketFlags(this.bucketType, this.auth.user().id());
    this.initInProgress = false;
    this.updateCounts();
  }

  search_or_count(justCount, hint, query, pcrudOps, pcrudReqOps): Observable<number | any[]>  {
    if (!justCount) {
      const query_filters = this.extractGridFitlers();
      if (query_filters.length > 0) {
        query['-and'] = query_filters;
      }
    }
    return this.pcrud.search(hint, { ...query, btype: { '!=' : 'temp' } }, pcrudOps, { ...pcrudReqOps, count_only: justCount});
  }

  initViews() {
    this.views = {
      all: {
        label: $localize`Visible to me`,
        sort_key: 10,
        count: -1,
        bucketIdQuery: async (pager, sort, justCount) => {
          const translatedSort = this.pcrud.translateFlatSortComplex('cub', sort);
          let result: BucketQueryResult;
          const response  = await lastValueFrom(
            this.search_or_count(justCount, 'cub',
              { owner: { '!=' : this.userId || this.auth.user().id() }, pub: 't' },
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
            this.views['all']['count'] =  result['count'];
          } else {
            const ids = response as number[];
            result = { bucketIds: ids, count: ids.length };
          }
          return result;
        }
      },
      user: {
        label: $localize`My buckets`,
        sort_key: 1,
        count: -1,
        bucketIdQuery: async (pager, sort, justCount) => {
          const translatedSort = this.pcrud.translateFlatSortComplex('cub', sort);
          let result: BucketQueryResult;
          const response  = await lastValueFrom(
            this.search_or_count(justCount, 'cub',
              { owner: this.userId || this.auth.user().id() },
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
            this.views['user']['count'] =  result['count'];
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
          const translatedSort = this.pcrud.translateFlatSortComplex('cub', sort);
          this.favoriteIds = this.bucketService.getFavoriteBucketIds(this.bucketType);
          let result: BucketQueryResult;
          if (this.favoriteIds.length) {
            const response  = await lastValueFrom(
              this.search_or_count(justCount, 'cub',
                { id: this.favoriteIds },
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
              this.views['favorites']['count'] =  result['count'];
            } else {
              const ids = response as number[];
              result = { bucketIds: ids, count: ids.length };
            }
          } else {
            result = { bucketIds: [], count: -1 };
          }
          return result;
        }
      },
      recent: {
        label: $localize`Recent`,
        sort_key: 3,
        count: -1,
        bucketIdQuery: async (pager, sort, justCount) => {
          const translatedSort = this.pcrud.translateFlatSortComplex('cub', sort);
          const recentBucketIds = this.bucketService.recentBucketIds(this.bucketType);
          let result: BucketQueryResult;
          if (recentBucketIds.length) {
            const response  = await lastValueFrom(
              this.search_or_count(justCount, 'cub',
                { id: recentBucketIds },
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
              this.views['recent']['count'] =  result['count'];
            } else {
              const ids = response as number[];
              result = { bucketIds: ids, count: ids.length };
            }
          } else {
            result = { bucketIds: [], count: -1 };
          }
          return result;
        }
      },
      shared_with_others: {
        label: $localize`Shared with others`,
        sort_key: 4,
        count: -1,
        bucketIdQuery: async (pager, sort, justCount) => {
          const translatedSort = this.pcrud.translateFlatSortComplex('cub', sort);
          let result: BucketQueryResult;
          const response  = await lastValueFrom(
            this.search_or_count(justCount, 'cub',
              { owner: { '=' : this.userId || this.auth.user().id() }, '-or': [
                  {'-exists':{from:'cubs',where:{bucket:{'=':{'+cub':'id'}}}}},
                  {'-exists':{from:'puopm',where:{
                      object_type:'cub',
                      '+cub':{id:{'=':{transform:'text',value:{'+puopm':'object_id'}}}}}}
                  }
                ]},
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
            this.views['shared_with_others']['count'] =  result['count'];
          } else {
            const ids = response as number[];
            result = { bucketIds: ids, count: ids.length };
          }
          return result;
        }
      },
      shared_with_user: {
        label: $localize`Shared with me`,
        sort_key: 5,
        count: -1,
        bucketIdQuery: async (pager, sort, justCount) => {
          const translatedSort = this.pcrud.translateFlatSortComplex('cub', sort);
          let result: BucketQueryResult;
          const response  = await lastValueFrom(
            this.search_or_count(justCount, 'cub',
              { owner: { '!=' : this.userId || this.auth.user().id() }, pub: 'f' },
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
            this.views['shared_with_user']['count'] =  result['count'];
          } else {
            const ids = response as number[];
            result = { bucketIds: ids, count: ids.length };
          }
          return result;
        }
      },
      retrieved_by_id: {
        label: null,
        sort_key: null,
        count: null,
        bucketIdQuery: async (pager, sort, justCount) => {
          const bucketIds = this.bucketIdToRetrieve ? [ this.bucketIdToRetrieve ] : [];
          return { bucketIds: bucketIds, count: bucketIds.length };
        }
      }
    };
  }

  async updateCounts() {
    if (this.initInProgress) { return; }
    if (this.countInProgress) { return; }

    this.countInProgress = true;

    const viewKeys = this.getViewKeys();
    viewKeys.forEach( v => { this.views[v].count = -1; } );

    Promise.all(
      viewKeys.map(v => this.views[v].bucketIdQuery(null, [], true))
    ).catch(error => console.error('Error updating counts:', error))
     .finally(() => { this.countInProgress = false; });
  }

  getViewKeys(): string[] {
    const viewEntries = Object.entries(this.views)
      .filter(([key, view]) => key && view.label !== null)
      .map(([key, view]) => ({ key, sort_key: view.sort_key }))
      .sort((a, b) => a.sort_key - b.sort_key);
    return viewEntries.map(entry => entry.key);
  }

  isCurrentView(view: string): boolean {
    if (this.currentView === view || (!this.currentView && view === 'user')) {
      return true;
    }
    return false;
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
          return this.bucketService.getBucketCountStats(this.bucketType, response.bucketIds).pipe(
            switchMap(countStats => this.flatData.getRows(this.grid.context, query, new Pager(), sort).pipe(
              map(row => ({
                ...row,
                item_count: countStats[row.id]?.item_count || 0,
                org_share_count: countStats[row.id]?.org_share_count || 0,
                usr_view_share_count: countStats[row.id]?.usr_view_share_count || 0,
                usr_edit_share_count: countStats[row.id]?.usr_update_share_count || 0,
                favorite: this.bucketService.isFavoriteBucket(this.bucketType, row.id)
              }))
            ))
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

  extractGridFitlers() {
    let query_filters = [];
    Object.keys(this.dataSource.filters).forEach(key => {
      query_filters = query_filters.concat(this.dataSource.filters[key]);
    });
    return query_filters;
  }

  buildRetrieveByIdsQuery(bucketIds: number[]) {
    const query: any = {};
    query['id'] = bucketIds.length === 0 ? [-1] : bucketIds.map( b => this.idl.pkeyValue(b) );
    const query_filters = this.extractGridFitlers();
    if (query_filters.length > 0) {
      query['-and'] = query_filters;
    }
    return query;
  }

  openNewBucketDialog = async (event?: any) => {
    this.newBucketDialog.bucketClass = 'user';
    try {
      const dialogObservable = this.newBucketDialog.open({size: 'lg'}).pipe(
        catchError((error: unknown) => EMPTY),
        takeUntil(this.destroy$),
      );
      const results = await lastValueFrom(dialogObservable, { defaultValue: null });
      this.grid.reload();
      this.updateCounts();
    } catch (error) {
      console.error('Error in new bucket dialog:', error);
    }
  };

  openEditBucketDialog = async (rows: any[]) => {
    if (!rows.length) { return; }
    const bucket = rows[0];
    this.editDialog.mode = 'update';
    this.editDialog.recordId = bucket.id;
    this.editDialog.open().subscribe(ok => this.grid.reload());
  };

  openDeleteBucketDialog = async (rows: any[]) => {
    if (!rows || rows.length === 0) { return; }

    this.deleteDialog.dialogBody = rows.map(r => r.id || '').join(', ');
    const deleteConfirmed = await firstValueFrom(this.deleteDialog.open().pipe(
      defaultIfEmpty(false),
      catchError(() => EMPTY)
    ));
    if (!deleteConfirmed) { return; }

    this.net.request(
      'open-ils.actor',
      'open-ils.actor.containers.full_delete',
      this.auth.token(),
      'user',
      rows.map(r => r.id)
    ).pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        const evt = this.evt.parse(response);
        if (evt) {
          this.deleteFail.dialogBody = evt.toString();
          this.deleteFail.open();
        }
      },
      error: (error: unknown) => {
        this.deleteFail.dialogBody = error.toString();
        this.deleteFail.open();
      },
      complete: () => {
        this.grid.reload();
        this.updateCounts();
      }
    });
  };

  openShareBucketDialog = async (rows: any[]) => {
    if (!rows || rows.length === 0) { return; }
    this.shareBucketDialog.containerType = 'user';
    this.shareBucketDialog.containerObjects = rows;
    this.shareBucketDialog.loadAouTree();
    this.shareBucketDialog.populateCheckedNodes();
    await this.shareBucketDialog.loadAuGridViewPermGrid();
    await this.shareBucketDialog.loadAuGridEditPermGrid();

    try {
      const dialogRef$ = this.shareBucketDialog.open({size: 'lg'}).pipe(
        take(1),
        catchError(() => EMPTY),
        takeUntil(this.destroy$),
      );
      await firstValueFrom(dialogRef$);
      setTimeout(() => { this.grid.reload(); this.updateCounts(); }, 1000);
    } catch (error) {
      console.error('openShareBucketDialog error', error);
    }
  };

  openTransferDialog = async (rows: any[]) => {
    if (!rows || rows.length === 0) { return; }
    this.transferDialog.containerType = 'user';
    this.transferDialog.containerObjects = rows;
    try {
      const dialogRef$ = this.transferDialog.open({size: 'lg'}).pipe(
        take(1),
        catchError(() => EMPTY),
        takeUntil(this.destroy$),
      );
      await firstValueFrom(dialogRef$);
      setTimeout(() => { this.grid.reload(); this.updateCounts(); }, 1000);
    } catch (error) {
      console.error('openTransferDialog error', error);
    }
  };

  favoriteBucket = async (rows: any[]) => {
    if (!rows || rows.length === 0) { return; }
    for (const row of rows) {
      if (!this.bucketService.isFavoriteBucket(this.bucketType, row.id)) {
        try {
          await this.bucketService.addFavoriteBucketFlag(this.bucketType, row.id, this.auth.user().id());
          row.favorite = true;
        } catch (error) {
          console.error(`Error adding favorite for bucket ${row.id}:`, error);
        }
      }
    }
    setTimeout(() => { this.grid.reload(); this.updateCounts(); }, 1000);
  };

  unFavoriteBucket = async (rows: any[]) => {
    if (!rows || rows.length === 0) { return; }
    for (const row of rows) {
      if (this.bucketService.isFavoriteBucket(this.bucketType, row.id)) {
        try {
          await this.bucketService.removeFavoriteBucketFlag(this.bucketType, row.id);
          row.favorite = false;
        } catch (error) {
          console.error(`Error removing favorite for bucket ${row.id}:`, error);
        }
      }
    }
    setTimeout(() => { this.grid.reload(); this.updateCounts(); }, 1000);
  };

  jumpToBucketContent(bucketId: number) {
    this.router.navigate(['/staff/circ/user-buckets/content', bucketId]);
  }

  // Search by bucket ID and display only that bucket
  retrieveBucketById() {
    const idNum = Number(this.bucketIdToRetrieve);
    if (!idNum || isNaN(idNum)) { return; }
    this.currentView = 'retrieved_by_id';
    this.grid.reload();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
