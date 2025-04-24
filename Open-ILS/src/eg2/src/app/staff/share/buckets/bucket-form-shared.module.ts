import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BucketFormComponent } from './bucket-form.component';

@NgModule({
    declarations: [
        BucketFormComponent // Declare it only here
    ],
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule
    ],
    exports: [
        BucketFormComponent // And export it
    ]
})
export class BucketFormSharedModule {}
