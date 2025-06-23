import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'eg-opac-pagination',
  templateUrl: './pagination.component.html',
  styleUrls: ['./pagination.component.css']
})
export class PaginationComponent {
  @Input() currentPage = 0;
  @Input() totalCount = 0;
  @Input() pageSize = 10;
  @Input() numPages = 5; // Number of page buttons to show
  
  @Output() pageChange = new EventEmitter<number>();
  
  /**
   * Get total number of pages
   */
  get totalPages(): number {
    return Math.ceil(this.totalCount / this.pageSize);
  }
  
  /**
   * Generate an array of page numbers to display
   */
  getPageRange(): number[] {
    const pages = [];
    
    // Calculate range to display
    const halfPages = Math.floor(this.numPages / 2);
    let startPage = Math.max(0, this.currentPage - halfPages);
    const endPage = Math.min(this.totalPages - 1, startPage + this.numPages - 1);
    
    // Adjust start page if we're near the end
    startPage = Math.max(0, Math.min(startPage, endPage - this.numPages + 1));
    
    // Generate page numbers
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    
    return pages;
  }
  
  /**
   * Go to next page
   */
  nextPage(): void {
    if (this.currentPage < this.totalPages - 1) {
      this.pageChange.emit(this.currentPage + 1);
    }
  }
  
  /**
   * Go to previous page
   */
  prevPage(): void {
    if (this.currentPage > 0) {
      this.pageChange.emit(this.currentPage - 1);
    }
  }
  
  /**
   * Go to specific page
   */
  setPage(page: number): void {
    if (page !== this.currentPage && page >= 0 && page < this.totalPages) {
      this.pageChange.emit(page);
    }
  }
  
  /**
   * Check if current page is first page
   */
  isFirstPage(): boolean {
    return this.currentPage === 0;
  }
  
  /**
   * Check if current page is last page
   */
  isLastPage(): boolean {
    return this.currentPage === this.totalPages - 1 || this.totalPages === 0;
  }
}
