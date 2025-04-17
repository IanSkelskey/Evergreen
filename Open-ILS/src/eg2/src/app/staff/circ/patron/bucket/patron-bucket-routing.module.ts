import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {PatronBucketComponent} from './patron-bucket.component';
import {PatronBucketContentComponent} from './patron-bucket-content.component';

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
    component: PatronBucketContentComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PatronBucketRoutingModule { }
