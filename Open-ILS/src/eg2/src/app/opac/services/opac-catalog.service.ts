import { Injectable } from '@angular/core';
import { IdlObject } from '@eg/core/idl.service';
import { PcrudService } from '@eg/core/pcrud.service';
import { NetService } from '@eg/core/net.service';
import { OrgService } from '@eg/core/org.service';
import { Observable, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

// Constants needed for catalog search
export const OPAC_CCVM_FILTERS = ['search_format', 'item_type', 'item_form', 
  'bib_level', 'lit_form', 'item_lang', 'audience', 'vr_format'];

@Injectable({
  providedIn: 'root'
})
export class OpacCatalogService {
  // Map to store format data
  ccvmMap: {[ccvm: string]: IdlObject[]} = {};
  
  // Current search results
  currentResults: any = {
    ids: [],
    count: 0,
    records: []
  };
  
  // Pager settings
  pager = {
    limit: 10,
    offset: 0,
    totalCount: 0
  };
  
  // Search state
  searchState = 'ready'; // 'ready', 'searching', 'complete'

  constructor(
    private pcrud: PcrudService,
    private net: NetService,
    private org: OrgService
  ) { }

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
  
  /**
   * Build a search query from search parameters
   */
  buildSearchQuery(params: any): string {
    let query = '';
    
    // Add the main search term
    if (params.query) {
      if (params.qtype && params.qtype !== 'keyword') {
        query += `${params.qtype}:(${params.query})`;
      } else {
        query += params.query;
      }
    }
    
    // Add format filter if specified
    if (params.format) {
      query += ` search_format(${params.format})`;
    }
    
    // Add availability filter
    if (params.available) {
      query += ' #available';
    }
    
    // Add sort
    if (params.sort) {
      const parts = params.sort.split(/\./);
      if (parts[1]) { query += ' #descending'; }
      query += ` sort(${parts[0]})`;
    }
    
    // Add org scope
    const orgId = params.org ? params.org : this.org.root().id();
    query += ` site(${this.org.get(orgId).shortname()})`;
    
    return query.trim();
  }
  
  /**
   * Perform a catalog search
   */
  search(params: any): Observable<any> {
    this.searchState = 'searching';
    
    // Set up paging
    this.pager.offset = (params.page || 0) * this.pager.limit;
    this.pager.limit = params.limit || 10;
    
    // Build the search query
    const searchQuery = this.buildSearchQuery(params);
    
    // Parameters for the API call - this needs to be a separate object
    const queryParams = {
      limit: this.pager.limit,
      offset: this.pager.offset
    };
    
    // Call the search API with correct parameter format:
    // 1. Query params object with limit/offset
    // 2. The search query string
    // 3. Boolean 'true' to enable caching
    return this.net.request(
      'open-ils.search',
      'open-ils.search.biblio.multiclass.query',
      queryParams, searchQuery, true
    ).pipe(
      tap(result => {
        if (result) {
          this.currentResults = result;
          this.pager.totalCount = result.count;
          this.searchState = 'complete';
        }
      }),
      catchError(error => {
        console.error('Search error:', error);
        this.searchState = 'complete';
        return of({ ids: [], count: 0, records: [] });
      })
    );
  }
  
  /**
   * Fetch record details for display
   */
  fetchRecords(ids: number[]): Observable<any> {
    if (!ids || ids.length === 0) {
      return of([]);
    }
    
    // Use a method without the .staff suffix for OPAC
    return this.net.request(
      'open-ils.search',
      'open-ils.search.biblio.record.mods_slim.retrieve',
      ids
    ).pipe(
      tap(records => {
        // Process records to ensure properties are accessible
        if (Array.isArray(records)) {
          records.forEach(record => {
            // Ensure required properties exist
            if (!record.attrs) record.attrs = {};
            
            // Extract property values from functions if needed
            Object.keys(record).forEach(key => {
              if (typeof record[key] === 'function') {
                try {
                  const value = record[key]();
                  record.attrs[key] = value;
                } catch (e) {
                  // Function couldn't be called, ignore
                }
              }
            });
          });
        }
      }),
      catchError(error => {
        console.error('Error fetching records:', error);
        return of([]);
      })
    );
  }
  
  /**
   * Get formatted org name
   */
  orgName(orgId: number): string {
    return this.org.get(orgId)?.name() || '';
  }
}
