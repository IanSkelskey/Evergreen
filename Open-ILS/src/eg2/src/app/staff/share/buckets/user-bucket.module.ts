import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {StaffCommonModule} from '@eg/staff/common.module';
import {UserBucketRoutingModule} from './user-bucket-routing.module';
import {UserBucketComponent} from './user-bucket.component';
import {UserBucketItemComponent} from './user-bucket-item.component';
import {FmRecordEditorModule} from '@eg/share/fm-editor/fm-editor.module';
import {PatronModule} from '@eg/staff/share/patron/patron.module';
import {TreeModule} from '@eg/share/tree/tree.module';
import {HoldsModule} from '@eg/staff/share/holds/holds.module';
import {BucketCommonModule} from './bucket-common.module';

@NgModule({
  declarations: [
    UserBucketComponent,
    UserBucketItemComponent
  ],
  imports: [
    CommonModule,
    StaffCommonModule,
    PatronModule,
    HoldsModule,
    FmRecordEditorModule,
    TreeModule,
    BucketCommonModule,
    UserBucketRoutingModule
  ],
  exports: [
    UserBucketComponent,
    UserBucketItemComponent
  ]
})
export class UserBucketModule {}
