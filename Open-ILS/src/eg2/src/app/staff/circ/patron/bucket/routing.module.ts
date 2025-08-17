import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {PatronBucketComponent} from './patron-bucket.component';
import {PatronBucketItemComponent} from './patron-bucket-items.component';
import {PatronBucketUnauthorizedComponent} from './unauthorized.component';

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
        path: 'all',
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
        path: 'shared-with-others',
        component: PatronBucketComponent
    },
    {
        path: 'shared-with-me',
        component: PatronBucketComponent
    },
    {
        path: 'content/:id',
        component: PatronBucketItemComponent
    },
    {
        path: 'unauthorized/:id',
        component: PatronBucketUnauthorizedComponent
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class PatronBucketRoutingModule { }
