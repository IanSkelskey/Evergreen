import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { interval, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
    selector: 'eg-patron-bucket-unauthorized',
    templateUrl: 'patron-bucket-unauthorized.component.html',
    styleUrls: ['patron-bucket-unauthorized.component.css']
})
export class PatronBucketUnauthorizedComponent implements OnInit, OnDestroy {
    secondsToRedirect = 5;
    errorMessage: string;
    private destroy$ = new Subject<void>();
    
    constructor(private router: Router) { }
    
    ngOnInit() {
        // Get any state passed from the router
        const state = history.state;
        this.errorMessage = state?.message || $localize`You don't have permission to access this patron bucket.`;
        
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
        this.router.navigate(['/staff/circ/patron/bucket']);
    }
}
