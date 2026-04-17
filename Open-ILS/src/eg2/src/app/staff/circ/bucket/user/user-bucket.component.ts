import {ChangeDetectorRef, Component, ViewChild} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {AuthService} from '@eg/core/auth.service';
import {IdlService} from '@eg/core/idl.service';
import {NetService} from '@eg/core/net.service';
import {EventService} from '@eg/core/event.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {ToastService} from '@eg/share/toast/toast.service';
import {GridFlatDataService} from '@eg/share/grid/grid-flat-data.service';
import {UserBucketService} from './user-bucket.service';
import {BaseBucketListComponent} from '@eg/staff/share/buckets/base-bucket-list.component';
import {BaseBucketService} from '@eg/staff/share/buckets/base-bucket.service';
import {BucketTypeConfig, USER_BUCKET_CONFIG} from '@eg/staff/share/buckets/bucket-types';
import {PatronSearchDialogComponent} from '@eg/staff/share/patron/search-dialog.component';

@Component({
    selector: 'eg-user-bucket',
    templateUrl: 'user-bucket.component.html',
    styleUrls: ['./user-bucket.component.css']
})
export class UserBucketComponent extends BaseBucketListComponent {

    get config(): BucketTypeConfig { return USER_BUCKET_CONFIG; }
    get bucketService(): BaseBucketService { return this._bucketService; }

    @ViewChild('patronSearchDialog') patronSearchDialog: PatronSearchDialogComponent;

    constructor(
        router: Router,
        route: ActivatedRoute,
        cdr: ChangeDetectorRef,
        auth: AuthService,
        idl: IdlService,
        pcrud: PcrudService,
        net: NetService,
        evt: EventService,
        flatData: GridFlatDataService,
        private _bucketService: UserBucketService,
        private toast: ToastService,
    ) {
        super(router, route, cdr, auth, idl, pcrud, net, evt, flatData);
    }

    openPatronSearchDialog(rows: any[]): void {
        const bucketIds = rows.map(r => r.id);
        this.patronSearchDialog.open({size: 'xl'}).subscribe(patrons => {
            if (patrons && patrons.length) {
                const patronIds = patrons.map(p => p.id());
                const promises = bucketIds.map(bid =>
                    this.bucketService.addItemsToBucket(bid, patronIds)
                );
                Promise.all(promises).then(() => {
                    this.toast.success($localize`Added ${patronIds.length} patron(s) to ${bucketIds.length} bucket(s)`);
                    this.grid.reload();
                });
            }
        });
    }
}
