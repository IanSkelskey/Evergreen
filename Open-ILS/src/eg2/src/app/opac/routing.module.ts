import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {OpacComponent} from './components/opac.component';
import {SearchbarComponent} from './components/searchbar.component';
import {ResultsComponent} from './components/results/results.component';

const routes: Routes = [{
  path: '',
  component: OpacComponent,
  children: [
    {path: '', redirectTo: 'home', pathMatch: 'full'},
    {path: 'home', component: SearchbarComponent},
    {path: 'results', component: ResultsComponent}
  ]
}];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class OpacRoutingModule {}