import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

import { OpacRoutingModule } from './routing.module';
import { OpacComponent } from './opac.component';
import { OpacNavComponent } from './opac-nav.component';

@NgModule({
  declarations: [OpacComponent, OpacNavComponent],
  imports: [CommonModule, OpacRoutingModule, RouterModule, NgbModule]
})
export class OpacModule {}