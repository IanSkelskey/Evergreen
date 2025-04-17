import { NgModule } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PatronBucketComponent } from './patron-bucket.component';
import { PatronBucketContentComponent } from './patron-bucket-content.component'; // Add this
import { PatronBucketService } from './patron-bucket.service';
import { FmRecordEditorModule } from '@eg/share/fm-editor/fm-editor.module';
import { RecordBucketModule } from '@eg/staff/share/buckets/record-bucket.module';
import { StaffCommonModule } from '@eg/staff/common.module';
import { AdminPageModule } from '@eg/staff/share/admin-page/admin-page.module';
import { PatronModule } from '@eg/staff/share/patron/patron.module';
import { TreeModule } from '@eg/share/tree/tree.module';
import { PatronBucketRoutingModule } from './patron-bucket-routing.module';

@NgModule({
    declarations: [
        PatronBucketComponent,
        PatronBucketContentComponent // Add this
    ],
    imports: [
        CommonModule,
        FormsModule,
        StaffCommonModule,
        AdminPageModule,
        PatronModule,
        TreeModule,
        PatronBucketRoutingModule,
        FmRecordEditorModule,
        RecordBucketModule
    ],
    providers: [
        DatePipe,
        PatronBucketService
    ]
})
export class PatronBucketModule { }
