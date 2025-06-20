import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {OpacComponent} from './opac.component';

const routes: Routes = [{
  path: '',
  component: OpacComponent
}];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class OpacRoutingModule {}