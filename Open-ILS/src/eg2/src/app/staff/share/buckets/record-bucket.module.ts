import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {StaffCommonModule} from '@eg/staff/common.module';
import {AdminPageModule} from '@eg/staff/share/admin-page/admin-page.module';
import {PatronModule} from '@eg/staff/share/patron/patron.module';
import {FmRecordEditorModule} from '@eg/share/fm-editor/fm-editor.module';
import {TreeModule} from '@eg/share/tree/tree.module';
import {BucketCommonModule} from '@eg/staff/share/buckets/bucket-common.module';
import {RecordBucketComponent} from '@eg/staff/share/buckets/record-bucket.component';
import {RecordBucketExportDialogComponent} from '@eg/staff/share/buckets/record-bucket-export-dialog.component';
import {RecordBucketItemUploadDialogComponent} from '@eg/staff/share/buckets/record-bucket-item-upload-dialog.component';
import {RecordBucketItemComponent} from '@eg/staff/share/buckets/record-bucket-item.component';
import {RecordBucketRoutingModule} from './record-bucket-routing.module';
import {HoldsModule} from '@eg/staff/share/holds/holds.module';

@NgModule({
    declarations: [
        RecordBucketComponent,
        RecordBucketExportDialogComponent,
        RecordBucketItemUploadDialogComponent,
        RecordBucketItemComponent
    ],
    imports: [
        StaffCommonModule,
        AdminPageModule,
        PatronModule,
        HoldsModule,
        FmRecordEditorModule,
        TreeModule,
        BucketCommonModule,
        RecordBucketRoutingModule
    ],
    exports: [
        RecordBucketComponent,
        RecordBucketExportDialogComponent,
        RecordBucketItemUploadDialogComponent,
        RecordBucketItemComponent
    ],
    providers: [
    ]
})

export class RecordBucketModule {
}
