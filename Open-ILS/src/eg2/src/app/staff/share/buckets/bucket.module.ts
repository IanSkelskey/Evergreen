import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { EgCommonModule } from '@eg/common.module';
import { CommonWidgetsModule } from '@eg/share/common-widgets.module';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TreeModule } from '@eg/share/tree/tree.module';
import { GridModule } from '@eg/share/grid/grid.module'; // Add GridModule import

import { BucketService } from './bucket.service';
import { BucketFormSharedModule } from './bucket-form-shared.module';
import { BucketShareDialogComponent } from './bucket-share-dialog.component';
import { BucketUserShareComponent } from './bucket-user-share.component';
import { BucketDialogService } from './bucket-dialog.service';

@NgModule({
    declarations: [
        BucketShareDialogComponent,
        BucketUserShareComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        EgCommonModule,
        CommonWidgetsModule,
        NgbModule,
        BucketFormSharedModule,
        TreeModule,
        GridModule // Add GridModule to imports
    ],
    exports: [
        BucketFormSharedModule,
        BucketShareDialogComponent,
        BucketUserShareComponent
    ],
    providers: [
        BucketService,
        BucketDialogService
    ]
})
export class BucketModule { }
