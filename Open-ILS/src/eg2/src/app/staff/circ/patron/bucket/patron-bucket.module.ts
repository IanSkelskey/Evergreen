import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';

import {PatronBucketRoutingModule} from './patron-bucket-routing.module';
import {PatronBucketComponent} from './patron-bucket.component';
import {PatronBucketContentComponent} from './patron-bucket-content.component';
import {PatronBucketPendingComponent} from './patron-bucket-pending.component';
import {PatronBucketItemComponent} from './patron-bucket-item.component';
import {PatronBucketAddDialogComponent} from './patron-bucket-add-dialog.component';
import {PatronBucketService} from './patron-bucket.service';

import {StaffCommonModule} from '@eg/staff/common.module';
import {CommonWidgetsModule} from '@eg/share/common-widgets.module';
import {PatronModule} from '@eg/staff/share/patron/patron.module';

@NgModule({
  declarations: [
    PatronBucketComponent,
    PatronBucketContentComponent,
    PatronBucketPendingComponent,
    PatronBucketItemComponent,
    PatronBucketAddDialogComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    PatronBucketRoutingModule,
    StaffCommonModule,
    CommonWidgetsModule,
    PatronModule
  ],
  providers: [
    PatronBucketService
  ]
})
export class PatronBucketModule { }
