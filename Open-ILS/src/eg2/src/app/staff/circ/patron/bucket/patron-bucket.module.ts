import {NgModule, CUSTOM_ELEMENTS_SCHEMA} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';

import {PatronBucketComponent} from './patron-bucket.component';
import {PatronBucketItemComponent} from './patron-bucket-item.component';
import {PatronBucketPendingComponent} from './patron-bucket-pending.component';
import {PatronBucketContentComponent} from './patron-bucket-content.component';
import {PatronBucketAddDialogComponent} from './patron-bucket-add-dialog.component';
import {PatronBucketService} from './patron-bucket.service';
import {PatronBucketRoutingModule} from './patron-bucket-routing.module';

import {EgCommonModule} from '@eg/common.module';
import {StaffCommonModule} from '@eg/staff/common.module';
import {GridModule} from '@eg/share/grid/grid.module';
import {FmRecordEditorModule} from '@eg/share/fm-editor/fm-editor.module';
import {CommonWidgetsModule} from '@eg/share/common-widgets.module';

@NgModule({
    declarations: [
        PatronBucketComponent,
        PatronBucketItemComponent,
        PatronBucketPendingComponent,
        PatronBucketContentComponent,
        PatronBucketAddDialogComponent
    ],
    imports: [
        PatronBucketRoutingModule,
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        EgCommonModule,
        StaffCommonModule,
        GridModule,
        FmRecordEditorModule,
        CommonWidgetsModule
    ],
    providers: [
        PatronBucketService
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class PatronBucketModule {}
