import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {UserBucketComponent} from './user-bucket.component';
import {UserBucketItemComponent} from './user-bucket-item.component';

const routes: Routes = [
  { path: '', component: UserBucketComponent },
  { path: 'favorites', component: UserBucketComponent },
  { path: 'recent', component: UserBucketComponent },
  { path: 'shared-with-others', component: UserBucketComponent },
  { path: 'shared-with-user', component: UserBucketComponent },
  { path: 'bucket/:id', component: UserBucketItemComponent },
  { path: 'content/:id', component: UserBucketItemComponent },
  { path: ':id', component: UserBucketComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class UserBucketRoutingModule {}
