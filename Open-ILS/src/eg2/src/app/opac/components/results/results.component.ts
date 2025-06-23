import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { OpacCatalogService } from '../../services/opac-catalog.service';
import { OpacCatalogUrlService } from '../../services/opac-catalog-url.service';

@Component({
  selector: 'eg-opac-results',
  templateUrl: './results.component.html',
  styleUrls: ['./results.component.css']
})
export class ResultsComponent implements OnInit {
  // Search parameters
  searchParams: any = {
    query: '',
    qtype: 'keyword',
    format: '',
    available: false,
    page: 0,
    limit: 10
  };
  
  // Display settings
  showMoreDetails = false;
  
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    public catalogService: OpacCatalogService,
    private catalogUrlService: OpacCatalogUrlService
  ) { }

  ngOnInit(): void {
    // Subscribe to route params to detect search changes
    this.route.queryParamMap.subscribe((params: ParamMap) => {
      this.searchByUrl(params);
    });
  }
  
  /**
   * Extract search parameters from URL and run the search
   */
  searchByUrl(params: ParamMap): void {
    this.searchParams = this.catalogUrlService.fromUrlParams(params);
    
    // If we have a query, run the search
    if (this.searchParams.query) {
      this.catalogService.search(this.searchParams).subscribe(
        results => {
          // If records are returned, fetch their details
          if (results && results.ids && results.ids.length > 0) {
            // Extract the record IDs from the nested array format returned by the API
            const recordIds = results.ids.map(idArray => idArray[0]);
            
            this.catalogService.fetchRecords(recordIds).subscribe(
              records => {
                this.catalogService.currentResults.records = records;
              }
            );
          }
        }
      );
    }
  }
  
  /**
   * Navigate to a specific page of results
   */
  goToPage(page: number): void {
    const newParams = { ...this.searchParams, page: page };
    this.router.navigate(['/opac/results'], { 
      queryParams: this.catalogUrlService.toUrlParams(newParams)
    });
  }
  
  /**
   * Toggle showing more details for records
   */
  toggleShowMore(): void {
    this.showMoreDetails = !this.showMoreDetails;
  }
  
  /**
   * Check if search is currently in progress
   */
  searchIsActive(): boolean {
    return this.catalogService.searchState === 'searching';
  }
  
  /**
   * Check if search has completed
   */
  searchIsDone(): boolean {
    return this.catalogService.searchState === 'complete';
  }
  
  /**
   * Check if search has results
   */
  searchHasResults(): boolean {
    return this.searchIsDone() && 
           this.catalogService.currentResults.count > 0;
  }
}
