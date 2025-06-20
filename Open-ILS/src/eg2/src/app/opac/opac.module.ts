import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {OpacRoutingModule} from './routing.module';
import {OpacComponent} from './opac.component';

@NgModule({
  declarations: [OpacComponent],
  imports: [CommonModule, OpacRoutingModule]
})
export class OpacModule {}