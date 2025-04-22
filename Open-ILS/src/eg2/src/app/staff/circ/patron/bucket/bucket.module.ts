import {NgModule, CUSTOM_ELEMENTS_SCHEMA} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';

import {PatronBucketComponent} from './list.component';
import {PatronBucketItemComponent} from './items.component';
import {PatronBucketAddDialogComponent} from './add-dialog.component';
import {PatronBucketEditDialogComponent} from './edit-dialog.component';
import {PatronBucketUnauthorizedComponent} from './unauthorized.component';
import {PatronBucketService} from './bucket.service';
import {PatronBucketStateService} from './state.service';
import {PatronBucketRoutingModule} from './routing.module';
import { PatronBucketQuickAddComponent } from './quick-add.component';

import {EgCommonModule} from '@eg/common.module';
import {StaffCommonModule} from '@eg/staff/common.module';
import {GridModule} from '@eg/share/grid/grid.module';
import {FmRecordEditorModule} from '@eg/share/fm-editor/fm-editor.module';
import {CommonWidgetsModule} from '@eg/share/common-widgets.module';
import {PatronModule} from '@eg/staff/share/patron/patron.module';
import {NgbDropdownModule, NgbTooltipModule} from '@ng-bootstrap/ng-bootstrap';

@NgModule({
    declarations: [
        PatronBucketComponent,
        PatronBucketItemComponent,
        PatronBucketAddDialogComponent,
        PatronBucketEditDialogComponent,
        PatronBucketUnauthorizedComponent,
        PatronBucketQuickAddComponent
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
        PatronModule,
        NgbDropdownModule,
        NgbTooltipModule
    ],
    providers: [
        PatronBucketService,
        PatronBucketStateService,
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class PatronBucketModule {}
