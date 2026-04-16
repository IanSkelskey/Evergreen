import {NgModule} from '@angular/core';
import {StaffCommonModule} from '@eg/staff/common.module';
import {PatronModule} from '@eg/staff/share/patron/patron.module';
import {TreeModule} from '@eg/share/tree/tree.module';
import {BucketTransferDialogComponent} from '@eg/staff/share/buckets/bucket-transfer-dialog.component';
import {BucketShareDialogComponent} from '@eg/staff/share/buckets/bucket-share-dialog.component';
import {BucketUserShareComponent} from '@eg/staff/share/buckets/bucket-user-share.component';
import {BucketActionSummaryDialogComponent} from '@eg/staff/share/buckets/bucket-action-summary-dialog.component';
import {BucketJumpToComponent} from '@eg/staff/share/buckets/bucket-jump-to.component';

@NgModule({
    declarations: [
        BucketTransferDialogComponent,
        BucketShareDialogComponent,
        BucketUserShareComponent,
        BucketActionSummaryDialogComponent,
        BucketJumpToComponent
    ],
    imports: [
        StaffCommonModule,
        PatronModule,
        TreeModule
    ],
    exports: [
        BucketTransferDialogComponent,
        BucketShareDialogComponent,
        BucketUserShareComponent,
        BucketActionSummaryDialogComponent,
        BucketJumpToComponent
    ]
})

export class BucketSharedModule {}
