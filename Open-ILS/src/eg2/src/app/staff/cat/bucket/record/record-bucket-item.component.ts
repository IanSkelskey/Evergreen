import {Component, ViewChild} from '@angular/core';
import {Router, ActivatedRoute} from '@angular/router';
import {firstValueFrom, lastValueFrom, take} from 'rxjs';
import {AuthService} from '@eg/core/auth.service';
import {StoreService} from '@eg/core/store.service';
import {IdlObject, IdlService} from '@eg/core/idl.service';
import {NetService} from '@eg/core/net.service';
import {PcrudService} from '@eg/core/pcrud.service';
import {EventService} from '@eg/core/event.service';
import {GridFlatDataService} from '@eg/share/grid/grid-flat-data.service';
import {PromptDialogComponent} from '@eg/share/dialog/prompt.component';
import {RecordBucketExportDialogComponent} from './record-bucket-export-dialog.component';
import {RecordBucketItemUploadDialogComponent} from './record-bucket-item-upload-dialog.component';
import {RecordBucketService} from './record-bucket.service';
import {HoldTransferViaBibsDialogComponent} from '@eg/staff/share/holds/transfer-via-bibs-dialog.component';
import {BroadcastService} from '@eg/share/util/broadcast.service';
import {BaseBucketItemComponent} from '@eg/staff/share/buckets/base-bucket-item.component';
import {BaseBucketService} from '@eg/staff/share/buckets/base-bucket.service';
import {BucketTypeConfig, RECORD_BUCKET_CONFIG} from '@eg/staff/share/buckets/bucket-types';

@Component({
    selector: 'eg-record-bucket-item',
    templateUrl: 'record-bucket-item.component.html',
    styleUrls: ['./record-bucket-item.component.css']
})
export class RecordBucketItemComponent extends BaseBucketItemComponent {

    get config(): BucketTypeConfig { return RECORD_BUCKET_CONFIG; }
    get bucketService(): BaseBucketService { return this._bucketService; }

    @ViewChild('promptDialog') promptDialog: PromptDialogComponent;
    @ViewChild('holdTransferDialog') holdTransferDialog: HoldTransferViaBibsDialogComponent;
    @ViewChild('exportDialog') exportDialog: RecordBucketExportDialogComponent;
    @ViewChild('importDialog') importDialog: RecordBucketItemUploadDialogComponent;

    catSearchQuery: string;

    constructor(
        router: Router,
        route: ActivatedRoute,
        auth: AuthService,
        net: NetService,
        evt: EventService,
        idl: IdlService,
        store: StoreService,
        pcrud: PcrudService,
        flatData: GridFlatDataService,
        private _bucketService: RecordBucketService,
        private broadcaster: BroadcastService,
    ) {
        super(router, route, auth, net, evt, idl, store, pcrud, flatData);
    }

    protected initCellTextGenerator() {
        this.cellTextGenerator = {
            'target_biblio_record_entry.simple_record.title': row => row['target_biblio_record_entry.simple_record.title'],
            'target_biblio_record_entry.merged_to': row => row['target_biblio_record_entry.merged_to']
        };
    }

    protected onBucketLoaded(bucket: IdlObject) {
        this.store.setLocalItem('eg.cat.last_record_bucket_retrieved', this.bucketId);
    }

    // --- Record-specific methods ---

    searchCatalog(): void {
        if (!this.catSearchQuery) { return; }
        this.router.navigate(
            ['/staff/catalog/search'],
            {queryParams: {query: this.catSearchQuery}}
        );
    }

    async jumpToCatalog(rows: any[]): Promise<void> {
        const uniqueBibIds = [...new Set(rows.map(r => r['target_biblio_record_entry.id']))];
        const catSearchQuery = `record_list(${uniqueBibIds.join(',')}) sort(edit_date)#descending`;
        const url = this.router.serializeUrl(
            this.router.createUrlTree(
                ['/eg2/staff/catalog/search'],
                {queryParams: {query: catSearchQuery}}
            )
        ).toString();
        window.open(url, '_blank');
    }

    async openCatalogTabs(rows: any[]): Promise<void> {
        const uniqueBibIds = [...new Set(rows.map(r => r['target_biblio_record_entry.id']))];
        uniqueBibIds.forEach(id => setTimeout(() => window.open('/eg2/staff/catalog/record/' + id, '_blank')));
    }

    async legacyMergeRecords(rows: any[]): Promise<void> {
        const uniqueBibIds = [...new Set(rows.map(r => r['target_biblio_record_entry.id']))];
        const url = `/eg/staff/cat/bucket/record/view/${this.bucket.id()}/merge/${uniqueBibIds.join(',')}`;
        this.broadcaster.listen('eg.merge_records_in_bucket_' + this.bucket.id()).pipe(take(1)).subscribe(result => {
            if (result.success) { setTimeout(() => { this.grid.reload(); }, 0); }
        });
        window.open(url, '_blank');
    }

    async mergeRecords(rows: any[]): Promise<void> {
        this.legacyMergeRecords(rows);
    }

    async exportAllRecords(): Promise<void> {
        const options = await lastValueFrom(this.exportDialog.open({}));
        if (options) {
            let url = `/exporter?containerid=${this.bucket.id()}`;
            if (options.format) { url += `&format=${options.format}`; }
            if (options.encoding) { url += `&encoding=${options.encoding}`; }
            if (options.includeItems) { url += '&holdings=1'; }
            url += `&ses=${this.auth.token()}`;
            window.open(url, '_blank');
        }
    }

    async exportRecords(rows: any[]): Promise<void> {
        const options = await lastValueFrom(this.exportDialog.open({}));
        if (options) {
            let url = '/exporter?';
            const idParams = rows.map(row => `id=${encodeURIComponent(row['target_biblio_record_entry.id'])}`).join('&');
            url += idParams;
            if (options.format) { url += `&format=${encodeURIComponent(options.format)}`; }
            if (options.encoding) { url += `&encoding=${encodeURIComponent(options.encoding)}`; }
            if (options.includeItems) { url += '&holdings=1'; }
            url += `&ses=${encodeURIComponent(this.auth.token())}`;
            window.open(url, '_blank');
        }
    }

    async uploadRecords() {
        this.importDialog.containerObjects = [{id: this.bucketId}];
        this.importDialog.bucketLabel = '#' + this.bucketId + ' ' + this.bucket.name();
        await lastValueFrom(this.importDialog.open({size: 'lg'}));
        setTimeout(() => {
            this.grid.reload();
        }, 1000);
    }

    async transferTitleHolds(rows: any[]): Promise<void> {
        if (!rows.length) { return; }
        const uniqueBibIds = [...new Set(rows.map(r => r['target_biblio_record_entry.id']))];
        this.holdTransferDialog.bibIds = uniqueBibIds;
        await this.holdTransferDialog.open({});
    }

    async deleteFromCatalog(rows: any[]): Promise<void> {
        this.confirmDialog.dialogTitle = $localize`Confirm Delete`;
        this.confirmDialog.dialogBody = $localize`Are you sure you want to delete these records from the catalog?`;
        this.confirmDialog.confirmString = $localize`Delete`;
        const confirmed = await firstValueFrom(this.confirmDialog.open());

        if (confirmed) {
            const promises = rows.map(row => this._deleteFromCatalog(row['target_biblio_record_entry.id']));
            const results = await Promise.all(promises);

            const failures = results
                .filter(result => this.evt.parse(result))
                .map(result => {
                    const evt = this.evt.parse(result);
                    return evt ? {recordId: evt.payload, desc: evt.desc} : null;
                })
                .filter(failure => failure !== null);

            if (failures.length) {
                this.alertDialog.dialogTitle = $localize`Error deleting from catalog`;
                this.alertDialog.dialogBody = failures.map(f => f.toString()).join('; ');
                await this.showFailuresDialog(failures);
            }

            setTimeout(() => {
                this.grid.reload();
            }, 1000);
        }
    }

    private _deleteFromCatalog(bibId: number): Promise<any> {
        return firstValueFrom(this.net.request(
            'open-ils.cat',
            'open-ils.cat.biblio.record_entry.delete',
            this.auth.token(),
            bibId
        ));
    }

    private async showFailuresDialog(failures: any[]): Promise<void> {
        let message = $localize`The following records could not be deleted: `;
        failures.forEach(failure => {
            message += $localize`Record ID` + ` ${failure.recordId}, ${failure.desc}; `;
        });
        this.alertDialog.dialogTitle = $localize`Deletion Failures`;
        this.alertDialog.dialogBody = message;
        await firstValueFrom(this.alertDialog.open());
    }
}
