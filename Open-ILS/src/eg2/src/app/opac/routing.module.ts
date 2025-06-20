import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {OpacComponent} from './opac.component';
import {SearchbarComponent} from './searchbar/searchbar.component';

const routes: Routes = [{
  path: '',
  component: OpacComponent,
  children: [
    {path: '', redirectTo: 'home', pathMatch: 'full'},
    {path: 'home', component: SearchbarComponent}
  ]
}];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class OpacRoutingModule {}