import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { Router } from '@angular/router';
import { interval, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BucketClass } from './bucket.service';

@Component({
    selector: 'eg-bucket-unauthorized',
    templateUrl: 'bucket-unauthorized.component.html',
    styleUrls: ['bucket-unauthorized.component.css']
})
export class BucketUnauthorizedComponent implements OnInit, OnDestroy {
    @Input() bucketClass: BucketClass = 'user';
    secondsToRedirect = 5;
    errorMessage: string;
    private destroy$ = new Subject<void>();
    
    constructor(private router: Router) { }
    
    ngOnInit() {
        // Get any state passed from the router
        const state = history.state;
        this.errorMessage = state?.message || $localize`You don't have permission to access this bucket.`;
        
        // Start countdown timer
        interval(1000)
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => {
                this.secondsToRedirect--;
                if (this.secondsToRedirect <= 0) {
                    this.navigateToBuckets();
                }
            });
    }
    
    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }
    
    navigateToBuckets() {
        const routeMap: Record<BucketClass, string> = {
            biblio: '/staff/catalog/bucket/record',
            user: '/staff/circ/patron/bucket',
            callnumber: '/staff/cat/bucket/callnumber',
            copy: '/staff/cat/bucket/copy'
        };

        this.router.navigate([routeMap[this.bucketClass]]);
    }
}
