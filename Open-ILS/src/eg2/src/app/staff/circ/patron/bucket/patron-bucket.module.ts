import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { StaffCommonModule } from '@eg/staff/common.module';
import { AdminPageModule } from '@eg/staff/share/admin-page/admin-page.module';
import { PatronModule } from '@eg/staff/share/patron/patron.module';
import { TreeModule } from '@eg/share/tree/tree.module';
import { PatronBucketRoutingModule } from './patron-bucket-routing.module';
import { PatronBucketComponent } from './patron-bucket.component';
import { PatronBucketItemComponent } from './patron-bucket-item.component';
import { PatronBucketPendingComponent } from './patron-bucket-pending.component';
import { PatronBucketService } from './patron-bucket.service';
import { PatronBucketUpdateService } from './patron-bucket-update.service';
import { FmRecordEditorModule } from '@eg/share/fm-editor/fm-editor.module';
import { RecordBucketModule } from '@eg/staff/share/buckets/record-bucket.module';

@NgModule({
    declarations: [
        PatronBucketComponent,
        PatronBucketItemComponent,
        PatronBucketPendingComponent
    ],
    imports: [
        StaffCommonModule,
        AdminPageModule,
        PatronModule,
        TreeModule,
        PatronBucketRoutingModule,
        FmRecordEditorModule,
        RecordBucketModule
    ],
    providers: [
        PatronBucketService,
        PatronBucketUpdateService
    ],
    schemas: [
        CUSTOM_ELEMENTS_SCHEMA
    ]
})
export class PatronBucketModule { }
