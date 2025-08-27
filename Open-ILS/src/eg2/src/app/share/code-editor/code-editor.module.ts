import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CodeEditorComponent } from './code-editor.component';
import { SyntaxHighlightingService } from '@eg/core/syntax-highlighting.service';

@NgModule({
    declarations: [
        CodeEditorComponent
    ],
    imports: [
        CommonModule
    ],
    exports: [
        CodeEditorComponent
    ],
    providers: [
        SyntaxHighlightingService
    ]
})
export class CodeEditorModule { }
