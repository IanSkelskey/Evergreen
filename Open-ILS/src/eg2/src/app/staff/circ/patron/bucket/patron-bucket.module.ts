import {NgModule, CUSTOM_ELEMENTS_SCHEMA} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {CommonModule} from '@angular/common';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';

import {PatronBucketComponent} from './patron-bucket.component';
import {PatronBucketService} from './patron-bucket.service';

import {EgCommonModule} from '@eg/common.module';
import {StaffCommonModule} from '@eg/staff/common.module';
import {GridModule} from '@eg/share/grid/grid.module';
import {FmRecordEditorModule} from '@eg/share/fm-editor/fm-editor.module';
import {CommonWidgetsModule} from '@eg/share/common-widgets.module';

const routes: Routes = [
    {
        path: '',
        component: PatronBucketComponent
    }
];

@NgModule({
    declarations: [
        PatronBucketComponent
    ],
    imports: [
        RouterModule.forChild(routes),
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        EgCommonModule,
        StaffCommonModule,
        GridModule,
        FmRecordEditorModule,
        CommonWidgetsModule,  // This provides common dialog components
    ],
    providers: [
        PatronBucketService
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA]  // This will allow custom elements like eg-bucket-dialog
})
export class PatronBucketModule {}
