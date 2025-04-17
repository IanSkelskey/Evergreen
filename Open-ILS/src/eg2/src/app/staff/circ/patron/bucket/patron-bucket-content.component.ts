import {Component, OnInit, OnDestroy, ViewChild} from '@angular/core';
import {Router, ActivatedRoute} from '@angular/router';
import {Observable, Subject, from, lastValueFrom, of} from 'rxjs';
import {takeUntil, map, catchError} from 'rxjs/operators';
import {PcrudService} from '@eg/core/pcrud.service';
import {IdlObject} from '@eg/core/idl.service';
import {GridDataSource, GridCellTextGenerator} from '@eg/share/grid/grid';
import {GridComponent} from '@eg/share/grid/grid.component';
import {ToastService} from '@eg/share/toast/toast.service';
import {PatronBucketService} from './patron-bucket.service';
import {DatePipe} from '@angular/common';

@Component({
    selector: 'eg-patron-bucket-content',
    templateUrl: './patron-bucket-content.component.html'
})
export class PatronBucketContentComponent implements OnInit, OnDestroy {
    bucketId: number;
    bucket: IdlObject;
    dataSource: GridDataSource = new GridDataSource();
    cellTextGenerator: GridCellTextGenerator;
    returnTo: string;
    noSelectedRows = true;
    
    @ViewChild('grid', {static: true}) private grid: GridComponent;
    
    private destroy$ = new Subject<void>();
    
    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private pcrud: PcrudService,
        private toast: ToastService,
        private bucketService: PatronBucketService,
        private datePipe: DatePipe
    ) {}
    
    ngOnInit() {
        this.route.params.pipe(takeUntil(this.destroy$))
            .subscribe(params => {
                this.bucketId = +params.id;
                this.loadBucket();
            });
            
        this.route.queryParams.pipe(takeUntil(this.destroy$))
            .subscribe(params => {
                this.returnTo = params.returnTo || 'user';
            });
            
        this.initDataSource();
        this.initCellTextGenerator();
    }
    
    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }
    
    private loadBucket() {
        this.pcrud.retrieve('cub', this.bucketId)
            .subscribe({
                next: bucket => {
                    this.bucket = bucket;
                    this.bucketService.logPatronBucket(this.bucketId);
                    this.grid?.reload();
                },
                error: err => {
                    console.error('Error loading bucket:', err);
                    this.toast.danger($localize`Error loading bucket: ${err.message || err}`);
                }
            });
    }
    
    initDataSource() {
        this.dataSource.getRows = (pager): Observable<any> => {
            if (!this.bucketId) return of({count: 0, items: []});
            
            return from(this.bucketService.retrievePatronBucketItems(this.bucketId))
                .pipe(
                    map(items => {
                        // Debug: log the items returned
                        console.debug('Grid items:', items);
                        return {
                            count: items.length,
                            items: items
                        };
                    }),
                    catchError(error => {
                        console.error('Error retrieving bucket items:', error);
                        return of({count: 0, items: []});
                    })
                );
        };
    }
    
    initCellTextGenerator() {
        this.cellTextGenerator = {
            patron_name: (row: any): string => {
                return row.patron_name || '';
            },
            barcode: (row: any): string => {
                return row.barcode || '';
            },
            id: (row: any): string => {
                return row.id?.toString() || '';
            }
        };
    }
    
    returnToBuckets() {
        // Use returnTo param if available, fallback to 'user'
        this.router.navigate(['/staff/circ/patron/bucket', this.returnTo || 'user']);
    }
    
    gridSelectionChange(selected: any[]) {
        this.noSelectedRows = selected.length === 0;
    }
    
    removeSelectedPatrons(rows: any[]) {
        if (!rows || rows.length === 0) return;
        const patronIds = rows.map(row => row.userId);
        this.bucketService.removePatronsFromPatronBucket(this.bucketId, patronIds)
            .then(() => {
                this.toast.success($localize`${rows.length} patron(s) removed from bucket`);
                this.grid.reload();
            })
            .catch(error => {
                console.error('Error removing patrons from bucket:', error);
                this.toast.danger($localize`Error removing patrons from bucket: ${error.message || error}`);
            });
    }
}
