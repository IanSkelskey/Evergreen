import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {PatronBucketComponent} from './patron-bucket.component';
import {PatronBucketItemComponent} from './patron-bucket-item.component';
import {PatronBucketPendingComponent} from './patron-bucket-pending.component';

const routes: Routes = [
  {
    path: '',
    component: PatronBucketComponent
  },
  {
    path: 'user',
    component: PatronBucketComponent
  },
  {
    path: 'favorites',
    component: PatronBucketComponent
  },
  {
    path: 'recent',
    component: PatronBucketComponent
  },
  {
    path: 'add',
    component: PatronBucketPendingComponent
  },
  {
    path: 'add/:id',
    component: PatronBucketPendingComponent
  },
  {
    path: 'content/:id',
    component: PatronBucketItemComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PatronBucketRoutingModule { }
