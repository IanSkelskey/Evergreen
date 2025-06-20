import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

import { OpacRoutingModule } from './routing.module';
import { OpacComponent } from './opac.component';
import { OpacNavComponent } from './opac-nav.component';
import { OpacFooterComponent } from './opac-footer.component';
import { SearchbarComponent } from './searchbar/searchbar.component';

@NgModule({
  declarations: [OpacComponent, OpacNavComponent, SearchbarComponent, OpacFooterComponent],
  imports: [CommonModule, FormsModule, OpacRoutingModule, RouterModule, NgbModule]
})
export class OpacModule {}