import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {PatronBucketComponent} from './list.component';
import {PatronBucketItemComponent} from './items.component';
import {PatronBucketUnauthorizedComponent} from './unauthorized.component';

const routes: Routes = [
  {
    path: '',
    component: PatronBucketComponent
  },
  {
    path: 'content/:id',
    component: PatronBucketItemComponent,
    data: { 
      reuseRoute: false 
    }
  },
  {
    path: 'unauthorized',
    component: PatronBucketUnauthorizedComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PatronBucketRoutingModule { }
