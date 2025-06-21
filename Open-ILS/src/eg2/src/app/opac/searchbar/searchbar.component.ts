import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IdlObject } from '@eg/core/idl.service';

@Component({
  selector: 'eg-searchbar',
  templateUrl: './searchbar.component.html',
  styleUrls: ['./searchbar.component.css']
})
export class SearchbarComponent implements OnInit {
  query = '';
  qtype = 'keyword'; // Default search type
  format = ''; // Default format (empty = all)
  
  // Properties for org selection
  selectedOrg: IdlObject = null;
  
  // Search type options
  qtypeOptions = [
    { value: 'keyword', label: 'Keyword' },
    { value: 'title', label: 'Title' },
    { value: 'author', label: 'Author' },
    { value: 'subject', label: 'Subject' },
    { value: 'series', label: 'Series' },
    { value: 'identifier', label: 'ISBN/ISSN/etc.' }
  ];
  
  // Format options
  formatOptions = [
    { value: '', label: 'All Formats' },
    { value: 'book', label: 'Books' },
    { value: 'ebook', label: 'E-Books' },
    { value: 'audiobook', label: 'Audiobooks' },
    { value: 'video', label: 'Videos/DVDs' },
    { value: 'music', label: 'Music' },
    { value: 'serial', label: 'Magazines/Journals' }
  ];
  
  constructor(private router: Router) {}

  ngOnInit(): void {
    // Any initialization needed
  }

  // Handle org selection change
  onOrgChange(org: IdlObject): void {
    this.selectedOrg = org;
  }

  onSearch(): void {
    // Get org ID for search if an org is selected
    const orgId = this.selectedOrg ? this.selectedOrg.id() : '';
    
    // Navigate with all search parameters
    this.router.navigate(['/opac/search'], { 
      queryParams: { 
        query: this.query,
        qtype: this.qtype,
        format: this.format,
        library: orgId
      } 
    });
  }
}