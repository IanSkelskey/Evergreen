import {ChangeDetectorRef, Component} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {AuthService} from '@eg/core/auth.service';
import {IdlService} from '@eg/core/idl.service';
import {NetService} from '@eg/core/net.service';
import {EventService} from '@eg/core/event.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {GridFlatDataService} from '@eg/share/grid/grid-flat-data.service';
import {UserBucketService} from './user-bucket.service';
import {BaseBucketListComponent} from '@eg/staff/share/buckets/base-bucket-list.component';
import {BaseBucketService} from '@eg/staff/share/buckets/base-bucket.service';
import {BucketTypeConfig, USER_BUCKET_CONFIG} from '@eg/staff/share/buckets/bucket-types';

@Component({
    selector: 'eg-user-bucket',
    templateUrl: 'user-bucket.component.html',
    styleUrls: ['./user-bucket.component.css']
})
export class UserBucketComponent extends BaseBucketListComponent {

    get config(): BucketTypeConfig { return USER_BUCKET_CONFIG; }
    get bucketService(): BaseBucketService { return this._bucketService; }

    patronSearchQuery: string;

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
    ) {
        super(router, route, cdr, auth, idl, pcrud, net, evt, flatData);
    }

    searchPatrons(): void {
        if (!this.patronSearchQuery) { return; }
        const url = this.router.serializeUrl(
            this.router.createUrlTree(
                ['/staff/circ/patron/bcsearch'],
                {queryParams: {query: this.patronSearchQuery}}
            )
        ).toString();
        window.open(url, '_blank');
    }
}
