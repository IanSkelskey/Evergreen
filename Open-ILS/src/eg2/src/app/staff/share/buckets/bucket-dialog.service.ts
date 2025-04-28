import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class BucketDialogService {
  private patronSearchDialog: any = null;

  setPatronSearchDialog(dialog: any): void {
    this.patronSearchDialog = dialog;
  }

  getPatronSearchDialog(): any {
    return this.patronSearchDialog;
  }
}
