import {Component, EventEmitter, Output, TemplateRef, ViewChild} from '@angular/core';

@Component({
    selector: 'eg-bucket-jump-to',
    template: `
        <ng-template #jumpTemplate>
            <label for="bucketJumpInput" class="input-group-text" i18n>Jump to Bucket:</label>
            <input id="bucketJumpInput" class="form-control" type="text" inputmode="numeric"
                i18n-placeholder placeholder="Bucket ID"
                [(ngModel)]="bucketId" (keydown.enter)="go()" />
        </ng-template>
    `
})
export class BucketJumpToComponent {
    @ViewChild('jumpTemplate', {static: true}) templateRef: TemplateRef<any>;
    @Output() jump = new EventEmitter<number>();
    bucketId: number;

    go() {
        if (this.bucketId) {
            this.jump.emit(this.bucketId);
        }
    }
}
