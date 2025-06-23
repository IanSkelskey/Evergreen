import { Injectable } from '@angular/core';
import { IdlObject } from '@eg/core/idl.service';
import { PcrudService } from '@eg/core/pcrud.service';

// Constants needed for catalog search
export const OPAC_CCVM_FILTERS = ['search_format', 'item_type', 'item_form', 
  'bib_level', 'lit_form', 'item_lang', 'audience', 'vr_format'];

@Injectable({
  providedIn: 'root'
})
export class OpacCatalogService {
  // Map to store format data
  ccvmMap: {[ccvm: string]: IdlObject[]} = {};

  constructor(private pcrud: PcrudService) { }

  /**
   * Fetch format data from the server
   */
  fetchCcvms(): Promise<void> {
    // Return immediately if already loaded
    if (Object.keys(this.ccvmMap).length) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.pcrud.search('ccvm',
        { ctype: OPAC_CCVM_FILTERS }, 
        {},
        { atomic: true, anonymous: true }
      ).subscribe(
        list => {
          this.compileCcvms(list);
          resolve();
        },
        error => reject(error)
      );
    });
  }

  /**
   * Organize CCVM data by type
   */
  private compileCcvms(ccvms: IdlObject[]): void {
    ccvms.forEach(ccvm => {
      if (!this.ccvmMap[ccvm.ctype()]) {
        this.ccvmMap[ccvm.ctype()] = [];
      }
      this.ccvmMap[ccvm.ctype()].push(ccvm);
    });

    // Sort each category alphabetically by value
    Object.keys(this.ccvmMap).forEach(cType => {
      this.ccvmMap[cType] = this.ccvmMap[cType].sort((a, b) => {
        return a.value() < b.value() ? -1 : 1;
      });
    });
  }

  /**
   * Get format label from code
   */
  getFormatLabel(code: string): string {
    if (Object.keys(this.ccvmMap).length && this.ccvmMap.search_format) {
      const format = this.ccvmMap.search_format.find(f => f.code() === code);
      if (format) {
        return format.search_label() || format.value();
      }
    }
    return '';
  }
}
