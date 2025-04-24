import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BucketItemTransferDialogComponent } from './item-transfer-dialog.component';
import { BucketFormSharedModule } from './bucket-form-shared.module';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

@NgModule({
    declarations: [
        BucketItemTransferDialogComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        NgbModule,
        BucketFormSharedModule
    ],
    exports: [
        BucketItemTransferDialogComponent,
        BucketFormSharedModule
    ]
})
export class BucketDialogsModule {}
