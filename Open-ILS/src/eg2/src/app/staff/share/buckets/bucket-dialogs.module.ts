import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BucketItemTransferDialogComponent } from './item-transfer-dialog.component';
import { BucketFormSharedModule } from './bucket-form-shared.module';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { BucketIdSelectorComponent } from './bucket-id-selector.component';

// Import the modules that contain the required components
import { StringModule } from '@eg/share/string/string.module';
import { EgCommonModule } from '@eg/common.module';
import { CommonWidgetsModule } from '@eg/share/common-widgets.module';

@NgModule({
    declarations: [
        // Only declare components that belong specifically to this module
        BucketItemTransferDialogComponent,
        BucketIdSelectorComponent
    ],
    imports: [
        // Standard Angular modules
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        NgbModule,
        
        // Our custom modules
        BucketFormSharedModule,
        StringModule,         // For StringComponent
        EgCommonModule,       // For DialogComponent and ConfirmDialogComponent
        CommonWidgetsModule   // For ComboboxComponent and ComboboxEntryComponent
    ],
    exports: [
        BucketItemTransferDialogComponent,
        BucketIdSelectorComponent,
        BucketFormSharedModule
    ]
})
export class BucketDialogsModule {}
