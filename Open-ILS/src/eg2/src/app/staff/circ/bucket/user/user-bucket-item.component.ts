import {Component, ViewChild} from '@angular/core';
import {Router, ActivatedRoute} from '@angular/router';
import {AuthService} from '@eg/core/auth.service';
import {StoreService} from '@eg/core/store.service';
import {IdlObject, IdlService} from '@eg/core/idl.service';
import {NetService} from '@eg/core/net.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {EventService} from '@eg/core/event.service';
import {ToastService} from '@eg/share/toast/toast.service';
import {GridFlatDataService} from '@eg/share/grid/grid-flat-data.service';
import {UserBucketService} from './user-bucket.service';
import {BaseBucketItemComponent} from '@eg/staff/share/buckets/base-bucket-item.component';
import {BaseBucketService} from '@eg/staff/share/buckets/base-bucket.service';
import {BucketTypeConfig, USER_BUCKET_CONFIG} from '@eg/staff/share/buckets/bucket-types';
import {PatronSearchDialogComponent} from '@eg/staff/share/patron/search-dialog.component';

@Component({
    selector: 'eg-user-bucket-item',
    templateUrl: 'user-bucket-item.component.html',
    styleUrls: ['./user-bucket-item.component.css']
})
export class UserBucketItemComponent extends BaseBucketItemComponent {

    get config(): BucketTypeConfig { return USER_BUCKET_CONFIG; }
    get bucketService(): BaseBucketService { return this._bucketService; }

    @ViewChild('patronSearchDialog') patronSearchDialog: PatronSearchDialogComponent;

    constructor(
        router: Router,
        route: ActivatedRoute,
        auth: AuthService,
        net: NetService,
        evt: EventService,
        idl: IdlService,
        store: StoreService,
        pcrud: PcrudService,
        flatData: GridFlatDataService,
        private _bucketService: UserBucketService,
        private toast: ToastService,
    ) {
        super(router, route, auth, net, evt, idl, store, pcrud, flatData);
    }

    protected initCellTextGenerator() {
        this.cellTextGenerator = {
            'target_user.family_name': row => row['target_user.family_name'],
            'target_user.usrname': row => row['target_user.usrname']
        };
    }

    protected onBucketLoaded(bucket: IdlObject) {
        this.store.setLocalItem('eg.circ.last_user_bucket_retrieved', this.bucketId);
    }

    openPatronSearchDialog(): void {
        this.patronSearchDialog.open({size: 'xl'}).subscribe(patrons => {
            if (patrons && patrons.length) {
                const patronIds = patrons.map(p => p.id());
                this.bucketService.addItemsToBucket(this.bucketId, patronIds)
                    .then(() => {
                        this.toast.success($localize`Added ${patronIds.length} patron(s) to bucket`);
                        this.grid.reload();
                    });
            }
        });
    }

    async openPatronInNewTab(rows: any[]): Promise<void> {
        const uniqueUserIds = [...new Set(rows.map(r => r['target_user.id']))];
        uniqueUserIds.forEach(id => setTimeout(() => window.open('/eg2/staff/circ/patron/' + id + '/checkout', '_blank')));
    }
}
