import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

import { OpacRoutingModule } from './routing.module';
import { OpacComponent } from './components/opac.component';
import { OpacNavComponent } from './components/opac-nav.component';
import { OpacFooterComponent } from './components/opac-footer.component';
import { CommonWidgetsModule } from '@eg/share/common-widgets.module';
import { SearchbarComponent } from './components/searchbar.component';
import { FormatFieldComponent } from './components/format-field.component';
import { ResultsComponent } from './components/results/results.component';
import { PaginationComponent } from './components/results/pagination.component';
import { RecordComponent } from './components/results/record.component';

@NgModule({
  declarations: [
    OpacComponent, 
    OpacNavComponent, 
    SearchbarComponent, 
    OpacFooterComponent,
    FormatFieldComponent,
    ResultsComponent,
    PaginationComponent,
    RecordComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    OpacRoutingModule,
    RouterModule,
    NgbModule,
    CommonWidgetsModule
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class OpacModule {}