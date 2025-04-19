import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {PatronBucketComponent} from './patron-bucket.component';
import {PatronBucketContentComponent} from './patron-bucket-content.component';
import {PatronBucketPendingComponent} from './patron-bucket-pending.component';
import {PatronBucketItemComponent} from './patron-bucket-item.component';

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
    path: 'recent',
    component: PatronBucketComponent
  },
  {
    path: 'content/:id',
    component: PatronBucketItemComponent
  },
  {
    path: 'add/:id',
    component: PatronBucketPendingComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PatronBucketRoutingModule { }
