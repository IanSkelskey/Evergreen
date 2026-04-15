import {NgModule} from '@angular/core';
import {StaffCommonModule} from '@eg/staff/common.module';
import {AdminPageModule} from '@eg/staff/share/admin-page/admin-page.module';
import {FmRecordEditorModule} from '@eg/share/fm-editor/fm-editor.module';
import {BucketSharedModule} from '@eg/staff/share/buckets/bucket-shared.module';
import {UserBucketComponent} from './user-bucket.component';
import {UserBucketItemComponent} from './user-bucket-item.component';
import {UserBucketRoutingModule} from './user-bucket-routing.module';

@NgModule({
    declarations: [
        UserBucketComponent,
        UserBucketItemComponent
    ],
    imports: [
        StaffCommonModule,
        AdminPageModule,
        BucketSharedModule,
        FmRecordEditorModule,
        UserBucketRoutingModule
    ],
    exports: [
        UserBucketComponent,
        UserBucketItemComponent
    ],
    providers: [
    ]
})

export class UserBucketModule {
}
