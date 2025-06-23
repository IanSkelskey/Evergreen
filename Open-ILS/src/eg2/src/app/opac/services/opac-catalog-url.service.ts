import { Injectable } from '@angular/core';
import { ParamMap } from '@angular/router';
import { OrgService } from '@eg/core/org.service';

/**
 * Service to handle URL parameter formatting for OPAC catalog searches
 * Simplified version of the staff catalog-url.service
 */
@Injectable({
  providedIn: 'root'
})
export class OpacCatalogUrlService {

  constructor(private org: OrgService) { }

  /**
   * Converts search params into URL query parameters
   */
  toUrlParams(searchParams: any): {[key: string]: string | string[]} {
    const params: any = {};

    // Basic parameters
    ['query', 'qtype', 'format', 'sort', 'page', 'limit'].forEach(field => {
      if (searchParams[field]) {
        params[field] = searchParams[field];
      }
    });

    // Handle library/org unit
    if (searchParams.org) {
      params.library = searchParams.org;
    }

    // Handle availability filter
    if (searchParams.available) {
      params.modifier = 'available';
    }

    // Handle formats
    if (searchParams.format) {
      params.format = searchParams.format;
    }

    return params;
  }

  /**
   * Parse URL parameters into search params object
   */
  fromUrlParams(params: ParamMap): any {
    const searchParams: any = {};

    // Basic parameters
    ['query', 'qtype', 'format', 'sort'].forEach(field => {
      if (params.has(field)) {
        searchParams[field] = params.get(field);
      }
    });

    // Handle page number and limit
    if (params.has('page')) {
      searchParams.page = parseInt(params.get('page'), 10) || 0;
    } else {
      searchParams.page = 0;
    }

    if (params.has('limit')) {
      searchParams.limit = parseInt(params.get('limit'), 10) || 10;
    } else {
      searchParams.limit = 10;
    }

    // Handle library/org unit
    if (params.has('library')) {
      searchParams.org = params.get('library');
    }

    // Handle availability filter
    if (params.has('modifier') && params.get('modifier') === 'available') {
      searchParams.available = true;
    }

    return searchParams;
  }
}
