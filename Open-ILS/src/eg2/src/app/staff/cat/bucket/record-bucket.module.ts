import {NgModule} from '@angular/core';
import {StaffCommonModule} from '@eg/staff/common.module';
import {AdminPageModule} from '@eg/staff/share/admin-page/admin-page.module';
import {PatronModule} from '@eg/staff/share/patron/patron.module';
import {FmRecordEditorModule} from '@eg/share/fm-editor/fm-editor.module';
import {BucketTransferDialogComponent} from '@eg/staff/cat/bucket/bucket-transfer-dialog.component';
import {BucketShareDialogComponent} from '@eg/staff/cat/bucket/bucket-share-dialog.component';
import {BucketUserShareComponent} from '@eg/staff/cat/bucket/bucket-user-share.component';
import {TreeModule} from '@eg/share/tree/tree.module';
import {BucketActionSummaryDialogComponent} from '@eg/staff/cat/bucket/bucket-action-summary-dialog.component';
import {RecordBucketComponent} from '@eg/staff/cat/bucket/record-bucket.component';
import {RecordBucketExportDialogComponent} from '@eg/staff/cat/bucket/record-bucket-export-dialog.component';
import {RecordBucketItemUploadDialogComponent} from '@eg/staff/cat/bucket/record-bucket-item-upload-dialog.component';
import {RecordBucketItemComponent} from '@eg/staff/cat/bucket/record-bucket-item.component';
import {RecordBucketRoutingModule} from './record-bucket-routing.module';
import {HoldsModule} from '@eg/staff/share/holds/holds.module';
import {BucketDialogComponent} from '@eg/staff/cat/bucket/bucket-dialog.component';
import {BucketDialogsModule} from '@eg/staff/share/buckets/bucket-dialogs.module';
import {BucketService} from '@eg/staff/cat/bucket/bucket.service';

@NgModule({
    declarations: [
        BucketTransferDialogComponent,
        BucketShareDialogComponent,
        BucketUserShareComponent,
        BucketActionSummaryDialogComponent,
        RecordBucketComponent,
        RecordBucketExportDialogComponent,
        RecordBucketItemUploadDialogComponent,
        RecordBucketItemComponent,
        BucketDialogComponent
    ],
    imports: [
        StaffCommonModule,
        AdminPageModule,
        PatronModule,
        HoldsModule,
        FmRecordEditorModule,
        TreeModule,
        RecordBucketRoutingModule,
        BucketDialogsModule
    ],
    exports: [
        BucketTransferDialogComponent,
        BucketShareDialogComponent,
        BucketUserShareComponent,
        BucketActionSummaryDialogComponent,
        RecordBucketComponent,
        RecordBucketExportDialogComponent,
        RecordBucketItemUploadDialogComponent,
        RecordBucketItemComponent,
        BucketDialogComponent
    ],
    providers: [
        BucketService
    ]
})

export class RecordBucketModule {
}
