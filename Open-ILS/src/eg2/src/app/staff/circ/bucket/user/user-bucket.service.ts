import {Injectable} from '@angular/core';
import {lastValueFrom} from 'rxjs';
import {NetService} from '@eg/core/net.service';
import {AuthService} from '@eg/core/auth.service';
import {StoreService} from '@eg/core/store.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {IdlService} from '@eg/core/idl.service';
import {BaseBucketService} from '@eg/staff/share/buckets/base-bucket.service';
import {BucketTypeConfig, USER_BUCKET_CONFIG} from '@eg/staff/share/buckets/bucket-types';

@Injectable({providedIn: 'root'})
export class UserBucketService extends BaseBucketService {

    get config(): BucketTypeConfig { return USER_BUCKET_CONFIG; }

    constructor(
        store: StoreService,
        net: NetService,
        auth: AuthService,
        pcrud: PcrudService,
        idl: IdlService,
    ) {
        super(store, net, auth, pcrud, idl);
    }

    async retrieveUserBucketItems(bucketId: number, limit = 100): Promise<any[]> {
        const query: any = {
            bucket: bucketId
        };

        const options = {
            flesh: 2,
            flesh_fields: {
                cubi: ['target_user'],
                au: ['card']
            },
            limit: limit,
            offset: 0
        };

        const items = await lastValueFrom(
            this.pcrud.search('cubi', query, options, {atomic: true})
        );

        return items.map(item => {
            const targetUser = item.target_user();
            return {
                id: item.id(),
                bucketId: this.idl.pkeyValue(item.bucket()),
                userId: targetUser.id(),
                usrname: targetUser.usrname(),
                barcode: targetUser.card() ? targetUser.card().barcode() : '',
                firstName: targetUser.first_given_name(),
                lastName: targetUser.family_name(),
            };
        });
    }
}
