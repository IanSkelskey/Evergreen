import {Component, OnInit, OnDestroy, ViewChild} from '@angular/core';
import {Router, ActivatedRoute} from '@angular/router';
import {Subject, of} from 'rxjs';
import {takeUntil} from 'rxjs/operators';
import {AuthService} from '@eg/core/auth.service';
import {IdlObject} from '@eg/core/idl.service';
import {NetService} from '@eg/core/net.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {EventService} from '@eg/core/event.service';
import {ToastService} from '@eg/share/toast/toast.service';
import {GridComponent} from '@eg/share/grid/grid.component';
import {GridDataSource} from '@eg/share/grid/grid';
import {PatronBucketService} from './patron-bucket.service';
import {ProgressDialogComponent} from '@eg/share/dialog/progress.component';
import {AlertDialogComponent} from '@eg/share/dialog/alert.component';

@Component({
    selector: 'eg-patron-bucket-pending',
    templateUrl: 'patron-bucket-pending.component.html',
    styleUrls: ['patron-bucket-pending.component.css']
})
export class PatronBucketPendingComponent implements OnInit, OnDestroy {
    bucketId: number;
    bucket: IdlObject;
    pendingList: number[] = [];
    barcodeString: string = '';
    barcodesFromFile: string = '';
    
    dataSource: GridDataSource = new GridDataSource();

    @ViewChild('grid', {static: true}) private grid: GridComponent;
    @ViewChild('progressDialog') private progressDialog: ProgressDialogComponent;
    @ViewChild('alertDialog') private alertDialog: AlertDialogComponent;

    private destroy$ = new Subject<void>();

    constructor(
        private router: Router,
        private route: ActivatedRoute,
        private auth: AuthService,
        private net: NetService,
        private pcrud: PcrudService,
        private evt: EventService,
        private toast: ToastService,
        private bucketService: PatronBucketService
    ) {}

    ngOnInit() {
        this.setupGridSource();

        this.route.paramMap.pipe(
            takeUntil(this.destroy$)
        ).subscribe(params => {
            const id = params.get('id');
            if (id) {
                this.bucketId = Number(id);
                this.fetchBucket();
            }
        });
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }

    private fetchBucket() {
        if (!this.bucketId) return;
        this.pcrud.retrieve('cub', this.bucketId).subscribe({
            next: bucket => { this.bucket = bucket; },
            error: err => {
                console.error('Error loading bucket:', err);
                this.toast.danger($localize`Error loading bucket: ${err.message || err}`);
            }
        });
    }

    private setupGridSource() {
        this.dataSource.getRows = (pager, sort) => {
            if (!this.pendingList.length) return of([]);
            
            return this.pcrud.search('au', 
                {id: this.pendingList},
                {flesh: 1, flesh_fields: {au: ['card']}}
            );
        };
    }

    search() {
        if (!this.barcodeString) return;
        
        this.pcrud.search('ac', {barcode: this.barcodeString}).subscribe({
            next: card => {
                if (card && card.usr()) {
                    this.addToPendingList(card.usr());
                }
            },
            error: err => {
                console.error('Error searching by barcode', err);
                this.toast.danger($localize`Error searching by barcode: ${err.message || err}`);
            },
            complete: () => {
                this.barcodeString = '';
            }
        });
    }

    processBarcodeFile() {
        if (!this.barcodesFromFile) return;
        
        const barcodes = this.barcodesFromFile.split(/\n/)
            .map(line => line.trim())
            .filter(line => line.length > 0);
        
        if (!barcodes.length) return;
        
        this.progressDialog.open();
        let processedCount = 0;

        this.pcrud.search('ac', {barcode: barcodes}).subscribe({
            next: card => {
                if (card && card.usr()) {
                    this.addToPendingList(card.usr());
                }
                processedCount++;
                this.progressDialog.update({
                    value: processedCount,
                    max: barcodes.length,
                });
            },
            error: err => {
                console.error('Error processing barcode file', err);
                this.toast.danger($localize`Error processing barcode file: ${err.message || err}`);
                this.progressDialog.close();
            },
            complete: () => {
                this.progressDialog.close();
                this.barcodesFromFile = '';
                this.grid.reload();
            }
        });
    }

    addToPendingList(userId: number) {
        if (!this.pendingList.includes(userId)) {
            this.pendingList.push(userId);
            this.grid.reload();
        }
    }

    removeFromPendingList(userId: number) {
        const index = this.pendingList.indexOf(userId);
        if (index > -1) {
            this.pendingList.splice(index, 1);
            this.grid.reload();
        }
    }

    resetPendingList() {
        this.pendingList = [];
        this.grid.reload();
    }

    addToBucket() {
        if (!this.bucket || !this.pendingList.length) return;
        this.progressDialog.open();
        const userIds = [...this.pendingList];
        this.net.request(
            'open-ils.actor',
            'open-ils.actor.container.item.create.batch',
            this.auth.token(), 'user', this.bucketId, userIds
        ).subscribe({
            next: (response) => {
                const evt = this.evt.parse(response);
                if (evt) {
                    this.alertDialog.dialogTitle = $localize`Error Adding Patrons`;
                    this.alertDialog.dialogBody = evt.toString();
                    this.progressDialog.close();
                    this.alertDialog.open();
                }
            },
            error: (err) => {
                this.progressDialog.close();
                this.toast.danger($localize`Error adding patrons to bucket: ${err.message || err}`);
            },
            complete: () => {
                this.progressDialog.close();
                this.toast.success($localize`${userIds.length} patrons added to bucket`);
                this.pendingList = [];
                this.grid.reload();
                this.bucketService.requestPatronBucketsRefresh();
            }
        });
    }

    // Navigate to bucket content view
    viewBucketContent() {
        if (this.bucketId) {
            this.router.navigate(['/staff/circ/patron/bucket/content', this.bucketId]);
        }
    }
    
    // Navigate back to bucket list
    backToBuckets() {
        this.router.navigate(['/staff/circ/patron/bucket']);
    }
}
