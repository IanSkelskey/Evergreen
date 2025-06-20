import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'eg-searchbar',
  templateUrl: './searchbar.component.html',
  styleUrls: ['./searchbar.component.css']
})
export class SearchbarComponent {
  query = '';

  constructor(private router: Router) {}

  onSearch(): void {
    this.router.navigate(['/opac/search'], { queryParams: { query: this.query } });
  }
}