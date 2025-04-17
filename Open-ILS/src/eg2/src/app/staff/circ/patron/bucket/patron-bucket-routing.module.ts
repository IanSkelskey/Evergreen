import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PatronBucketComponent } from './patron-bucket.component';
import { PatronBucketItemComponent } from './patron-bucket-item.component';

const routes: Routes = [
    {
        path: '',
        component: PatronBucketComponent 
    },
    { path: 'all', component: PatronBucketComponent },
    { path: 'user', component: PatronBucketComponent },
    { path: 'favorites', component: PatronBucketComponent },
    { path: 'recent', component: PatronBucketComponent },
    { path: 'shared-with-others', component: PatronBucketComponent },
    { path: 'shared-with-user', component: PatronBucketComponent },
    { path: 'bucket/:id', component: PatronBucketItemComponent },
    { path: 'content/:id', component: PatronBucketItemComponent },
    { path: ':id', component: PatronBucketComponent }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class PatronBucketRoutingModule {}
