import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { EgCommonModule } from '@eg/common.module';
import { CommonWidgetsModule } from '@eg/share/common-widgets.module';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

import { BucketService } from './bucket.service';
import { BucketFormSharedModule } from './bucket-form-shared.module';

@NgModule({
    declarations: [
        // No component declarations here
    ],
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        EgCommonModule,
        CommonWidgetsModule,
        NgbModule,
        BucketFormSharedModule
    ],
    exports: [
        BucketFormSharedModule
    ],
    providers: [
        BucketService
    ]
})
export class BucketModule { }
