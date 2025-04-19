import {NgModule, CUSTOM_ELEMENTS_SCHEMA} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';

import {PatronBucketComponent} from './patron-bucket.component';
import {PatronBucketItemComponent} from './patron-bucket-item.component';
import {PatronBucketPendingComponent} from './patron-bucket-pending.component';
import {PatronBucketAddDialogComponent} from './patron-bucket-add-dialog.component';
import {PatronBucketCreateDialogComponent} from './patron-bucket-create-dialog.component'; // Add this import
import {PatronBucketService} from './patron-bucket.service';
import {PatronBucketStateService} from './patron-bucket-state.service';
import {PatronBucketRoutingModule} from './patron-bucket-routing.module';

import {EgCommonModule} from '@eg/common.module';
import {StaffCommonModule} from '@eg/staff/common.module';
import {GridModule} from '@eg/share/grid/grid.module';
import {FmRecordEditorModule} from '@eg/share/fm-editor/fm-editor.module';
import {CommonWidgetsModule} from '@eg/share/common-widgets.module';
import {PatronModule} from '@eg/staff/share/patron/patron.module';

@NgModule({
    declarations: [
        PatronBucketComponent,
        PatronBucketItemComponent,
        PatronBucketPendingComponent,
        PatronBucketAddDialogComponent,
        PatronBucketCreateDialogComponent // Add this component
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
        CommonWidgetsModule,
        PatronModule
    ],
    providers: [
        PatronBucketService,
        PatronBucketStateService,
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class PatronBucketModule {}
