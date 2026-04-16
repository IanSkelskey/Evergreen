import {ChangeDetectorRef, Component, ViewChild} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {lastValueFrom, firstValueFrom, defaultIfEmpty, EMPTY, catchError} from 'rxjs';
import {AuthService} from '@eg/core/auth.service';
import {IdlService} from '@eg/core/idl.service';
import {NetService} from '@eg/core/net.service';
import {EventService} from '@eg/core/event.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {GridFlatDataService} from '@eg/share/grid/grid-flat-data.service';
import {RecordBucketService} from './record-bucket.service';
import {RecordBucketExportDialogComponent} from './record-bucket-export-dialog.component';
import {RecordBucketItemUploadDialogComponent} from './record-bucket-item-upload-dialog.component';
import {ConfirmDialogComponent} from '@eg/share/dialog/confirm.component';
import {AlertDialogComponent} from '@eg/share/dialog/alert.component';
import {PromptDialogComponent} from '@eg/share/dialog/prompt.component';
import {BaseBucketListComponent} from '@eg/staff/share/buckets/base-bucket-list.component';
import {BaseBucketService} from '@eg/staff/share/buckets/base-bucket.service';
import {BucketTypeConfig, RECORD_BUCKET_CONFIG} from '@eg/staff/share/buckets/bucket-types';

@Component({
    selector: 'eg-record-bucket',
    templateUrl: 'record-bucket.component.html',
    styleUrls: ['./record-bucket.component.css']
})
export class RecordBucketComponent extends BaseBucketListComponent {

    get config(): BucketTypeConfig { return RECORD_BUCKET_CONFIG; }
    get bucketService(): BaseBucketService { return this._bucketService; }

    @ViewChild('deleteCarouselDialog', { static: true }) deleteCarouselDialog: ConfirmDialogComponent;
    @ViewChild('createCarouselPrompt', { static: true }) createCarouselPrompt: PromptDialogComponent;
    @ViewChild('createCarouselFail', { static: true }) createCarouselFail: AlertDialogComponent;
    @ViewChild('importDialog') importDialog: RecordBucketItemUploadDialogComponent;
    @ViewChild('exportDialog') exportDialog: RecordBucketExportDialogComponent;

    catSearchQuery: string;

    constructor(
        router: Router,
        route: ActivatedRoute,
        cdr: ChangeDetectorRef,
        auth: AuthService,
        idl: IdlService,
        pcrud: PcrudService,
        net: NetService,
        evt: EventService,
        flatData: GridFlatDataService,
        private _bucketService: RecordBucketService,
    ) {
        super(router, route, cdr, auth, idl, pcrud, net, evt, flatData);
    }

    // --- Record-specific methods ---

    searchCatalog(): void {
        if (!this.catSearchQuery) { return; }
        const url = this.router.serializeUrl(
            this.router.createUrlTree(
                ['/eg2/staff/catalog/search'],
                {queryParams: {query: this.catSearchQuery}}
            )
        ).toString();
        window.open(url, '_blank');
    }

    protected async confirmDeleteOverride(rows: any[]): Promise<boolean> {
        const confirmed = await firstValueFrom(this.deleteCarouselDialog.open().pipe(
            defaultIfEmpty(false),
            catchError(() => EMPTY)
        ));
        return !!confirmed;
    }

    async uploadRecords(rows: any[]): Promise<void> {
        if (!rows.length) { return; }
        this.importDialog.containerObjects = rows;
        this.importDialog.bucketLabel = '#' + rows[0].id + ' ' + rows[0].name;
        await lastValueFrom(this.importDialog.open({}));
        setTimeout(() => {
            this.grid.reload();
        }, 1000);
    }

    async exportAllRecords(rows: any[]): Promise<void> {
        if (!rows.length) { return; }
        const options = await lastValueFrom(this.exportDialog.open({}));
        if (options) {
            let url = '/exporter?';
            const idParams = rows.map(row => `containerid=${encodeURIComponent(row.id)}`).join('&');
            url += idParams;
            if (options.format) { url += `&format=${encodeURIComponent(options.format)}`; }
            if (options.encoding) { url += `&encoding=${encodeURIComponent(options.encoding)}`; }
            if (options.holdings) { url += '&holdings=1'; }
            url += `&ses=${encodeURIComponent(this.auth.token())}`;
            window.open(url, '_blank');
        }
    }

    openCreateCarouselDialog = async (rows: any[]) => {
        if (!rows.length) { return; }
        const bucket = rows[0];
        this.createCarouselPrompt.open({size: 'lg'}).subscribe({
            next: (name: string) => {
                if (name && name.trim()) {
                    this.createCarousel(name.trim(), bucket);
                }
            },
            error: (e: unknown) => console.error('openCreateCarouselDialog error:', e)
        });
    };

    createCarousel(name: string, bucket: any) {
        this.net.request(
            'open-ils.actor',
            'open-ils.actor.carousel.create.from_bucket',
            this.auth.token(),
            name,
            bucket.id
        ).subscribe({
            next: (carouselId: number) => {
                const evt = this.evt.parse(carouselId);
                if (evt) {
                    console.error(evt.toString());
                    this.createCarouselFail.dialogBody = evt.toString();
                    this.createCarouselFail.open();
                } else {
                    this.router.navigate(['/staff/admin/local/container/carousel']);
                }
            },
            error: (error: unknown) => {
                console.error('Error creating carousel:', error);
                this.createCarouselFail.dialogBody = error.toString();
                this.createCarouselFail.open();
            }
        });
    }

    marcBatchEdit = async (rows: any[]) => {
        if (!rows.length) { return; }
        this.router.navigate(['/staff/cat/marcbatch/bucket/', rows[0].id]);
    };
}
