import {Component, Input, OnInit, ViewChild} from '@angular/core';
import {ActivatedRoute, ParamMap, Router} from '@angular/router';
import {BucketService} from './bucket.service';
import {GridComponent} from '@eg/share/grid/grid.component';
import {GridDataSource, GridCellTextGenerator} from '@eg/share/grid/grid';
import {GridFlatDataService} from '@eg/share/grid/grid-flat-data.service';
import {Pager} from '@eg/share/util/pager';
import {switchMap, map} from 'rxjs/operators';
import {IdlService} from '@eg/core/idl.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {AuthService} from '@eg/core/auth.service';
import {from} from 'rxjs'; // retained for potential future use
import {PatronSearchDialogComponent} from '@eg/staff/share/patron/search-dialog.component';
import {ToastService} from '@eg/share/toast/toast.service';

@Component({
  selector: 'eg-user-bucket-item',
  templateUrl: './user-bucket-item.component.html',
  styleUrls: ['./user-bucket-item.component.css']
})
export class UserBucketItemComponent implements OnInit {
  @Input() bucketId: number;
  @ViewChild('grid', { static: true }) private grid: GridComponent;
  @ViewChild('patronSearch') patronSearch: PatronSearchDialogComponent;

  dataSource: GridDataSource = new GridDataSource();
  cellTextGenerator: GridCellTextGenerator;
  bucket: any; // placeholder if future bucket details needed
  noSelectedRows = true;
  oneSelectedRow = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private bucketService: BucketService,
    private idl: IdlService,
    private pcrud: PcrudService,
    private auth: AuthService,
    private toast: ToastService,
    private flatData: GridFlatDataService
  ) {}

  ngOnInit() {
    // Provide cell text generator in case future formatting is needed
    this.cellTextGenerator = {
      'target_user.usrname': row => row['target_user.usrname']
    };

    this.route.paramMap.subscribe((params: ParamMap) => {
      this.bucketId = Number(params.get('id'));
      this.initDataSource(this.bucketId);
      this.grid.reload();
    });
    // dataSource init handled in paramMap subscription
  }

  initDataSource(bucketId: number) {
    this.dataSource.getRows = (pager: Pager, sort: any[]) => {
      const query: any = {};
      query['bucket'] = bucketId;

      let query_filters = [] as any[];
      Object.keys(this.dataSource.filters).forEach(key => {
        query_filters = query_filters.concat(this.dataSource.filters[key]);
      });
      if (query_filters.length > 0) {
        query['-and'] = query_filters;
      }

      return this.flatData.getRows(this.grid.context, query, pager, sort).pipe(
        map(row => {
          try {
            return this.idl.toHash(row, true);
          } catch (E) {
            return row;
          }
        })
      );
    };
  }

  gridSelectionChange(keys: string[]) {
    this.noSelectedRows = (keys.length === 0);
    this.oneSelectedRow = (keys.length === 1);
  }

  addUsersToBucket = () => {
    this.patronSearch.open({size: 'xl'}).toPromise().then(
      users => {
        console.debug('patronSearch, result', users);
        if (!users || users.length === 0) { return; }

        const userIds = Array.from(new Set(users.map(user => Number(user.id())).filter(id => !!id))) as number[];
        
        this.bucketService.addItemsToBucket('user', this.bucketId, userIds)
          .then(() => {
            this.toast.success($localize`Added ${userIds.length} user(s) to bucket`);
            this.grid.reload();
          })
          .catch(err => {
            console.error('Error adding users to bucket:', err);
            this.toast.danger($localize`Error adding users to bucket`);
          });
      }
    );
  };

  removeUsersFromBucket = async (rows: any[]) => {
    if (!rows || rows.length === 0) { return; }
    // Rows are flattened via idl.toHash; user id lives at 'target_user.id'
    const userIds = Array.from(new Set(
      rows.map(row => Number(row['target_user.id'])).filter(id => !!id)
    ));
    
    try {
      await this.bucketService.removeItemsFromBucket('user', this.bucketId, userIds);
      this.toast.success($localize`Removed ${rows.length} user(s) from bucket`);
      this.grid.reload();
    } catch (err) {
      console.error('Error removing users from bucket:', err);
      this.toast.danger($localize`Error removing users from bucket`);
    }
  };

}
