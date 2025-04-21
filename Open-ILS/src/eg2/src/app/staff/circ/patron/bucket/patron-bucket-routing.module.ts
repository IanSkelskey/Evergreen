import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {PatronBucketComponent} from './patron-bucket.component';
import {PatronBucketItemComponent} from './patron-bucket-item.component';
import {PatronBucketUnauthorizedComponent} from './patron-bucket-unauthorized.component';

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
