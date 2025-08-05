import {NgModule} from '@angular/core';
import {EgCommonModule} from '@eg/common.module';
import {StaffCommonModule} from '@eg/staff/common.module';
import {CommonWidgetsModule} from '@eg/share/common-widgets.module';
import {StringModule} from '@eg/share/string/string.module';
import {TranslateModule} from '@eg/share/translate/translate.module';
import {FmRecordEditorComponent, MinValidatorDirective, MaxValidatorDirective} from './fm-editor.component';
import {FmRecordEditorActionComponent} from './fm-editor-action.component';
// Import the code editor module
import {CodeEditorModule} from '@eg/share/code-editor/code-editor.module';


@NgModule({
    declarations: [
        FmRecordEditorComponent,
        FmRecordEditorActionComponent,
        MinValidatorDirective,
        MaxValidatorDirective
    ],
    imports: [
        EgCommonModule,
        StaffCommonModule,
        StringModule,
        TranslateModule,
        CommonWidgetsModule,
        // Add the CodeEditorModule to imports
        CodeEditorModule
    ],
    exports: [
        FmRecordEditorComponent,
        FmRecordEditorActionComponent
    ],
    providers: [
    ]
})

export class FmRecordEditorModule { }

