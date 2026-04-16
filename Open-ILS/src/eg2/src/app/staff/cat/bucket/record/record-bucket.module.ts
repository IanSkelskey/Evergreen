import {NgModule} from '@angular/core';
import {StaffCommonModule} from '@eg/staff/common.module';
import {AdminPageModule} from '@eg/staff/share/admin-page/admin-page.module';
import {FmRecordEditorModule} from '@eg/share/fm-editor/fm-editor.module';
import {BucketSharedModule} from '@eg/staff/share/buckets/bucket-shared.module';
import {RecordBucketComponent} from './record-bucket.component';
import {RecordBucketExportDialogComponent} from './record-bucket-export-dialog.component';
import {RecordBucketItemUploadDialogComponent} from './record-bucket-item-upload-dialog.component';
import {RecordBucketItemComponent} from './record-bucket-item.component';
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
        BucketSharedModule,
        HoldsModule,
        FmRecordEditorModule,
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
