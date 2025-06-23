import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

import { OpacRoutingModule } from './routing.module';
import { OpacComponent } from './opac.component';
import { OpacNavComponent } from './opac-nav.component';
import { OpacFooterComponent } from './opac-footer.component';
import { CommonWidgetsModule } from '@eg/share/common-widgets.module';
import { SearchbarComponent } from './searchbar.component';
import { FormatFieldComponent } from './components/format-field.component';

@NgModule({
  declarations: [
    OpacComponent, 
    OpacNavComponent, 
    SearchbarComponent, 
    OpacFooterComponent,
    FormatFieldComponent
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