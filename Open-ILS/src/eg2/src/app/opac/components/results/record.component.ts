import { Component, Input } from '@angular/core';
import { OpacCatalogService } from '../../services/opac-catalog.service';

@Component({
  selector: 'eg-opac-record',
  templateUrl: './record.component.html',
  styleUrls: ['./record.component.css']
})
export class RecordComponent {
  @Input() record: any;
  @Input() index: number;
  @Input() showDetails = false;
  
  constructor(public catalogService: OpacCatalogService) { }
  
  /**
   * Get format icon for display
   */
  getFormatIcon(format: string): string {
    // This would be based on format mapping logic
    return `/images/format_icons/icon_format/${format}.png`;
  }
  
  /**
   * Return the author from the record
   */
  getAuthor(): string {
    if (!this.record) return '';
    
    // Handle different record structure possibilities
    if (typeof this.record.author === 'function') {
      return this.record.author();
    } else if (this.record.author) {
      return this.record.author;
    }
    
    // Try alternative properties
    if (this.record.attrs && this.record.attrs.author) {
      return this.record.attrs.author;
    }
    
    return '';
  }
  
  /**
   * Return the title from the record
   */
  getTitle(): string {
    if (!this.record) return '';
    
    // Handle different record structure possibilities
    if (typeof this.record.title === 'function') {
      return this.record.title();
    } else if (this.record.title) {
      return this.record.title;
    }
    
    // Try alternative properties
    if (this.record.attrs && this.record.attrs.title) {
      return this.record.attrs.title;
    }
    
    return '';
  }
  
  /**
   * Return the publication info from the record
   */
  getPublicationInfo(): string {
    if (!this.record) return '';
    
    let info = '';
    
    // Get publisher
    let publisher = '';
    if (typeof this.record.publisher === 'function') {
      publisher = this.record.publisher();
    } else if (this.record.publisher) {
      publisher = this.record.publisher;
    } else if (this.record.attrs && this.record.attrs.publisher) {
      publisher = this.record.attrs.publisher;
    }
    
    // Get publication date
    let pubdate = '';
    if (typeof this.record.pubdate === 'function') {
      pubdate = this.record.pubdate();
    } else if (this.record.pubdate) {
      pubdate = this.record.pubdate;
    } else if (this.record.attrs && this.record.attrs.pubdate) {
      pubdate = this.record.attrs.pubdate;
    }
    
    if (publisher) {
      info += publisher;
    }
    
    if (pubdate) {
      if (info) info += ', ';
      info += pubdate;
    }
    
    return info;
  }
  
  /**
   * Return the ISBN from the record
   */
  getISBN(): string {
    if (!this.record) return '';
    
    let isbn = '';
    if (typeof this.record.isbn === 'function') {
      isbn = this.record.isbn();
    } else if (this.record.isbn) {
      isbn = this.record.isbn;
    } else if (this.record.attrs && this.record.attrs.isbn) {
      isbn = this.record.attrs.isbn;
    }
    
    return Array.isArray(isbn) ? isbn[0] : isbn;
  }
  
  /**
   * Get physical description from the record
   */
  getPhysicalDescription(): string {
    if (!this.record) return '';
    
    if (typeof this.record.physical_description === 'function') {
      return this.record.physical_description();
    } else if (this.record.physical_description) {
      return this.record.physical_description;
    } else if (this.record.attrs && this.record.attrs.physical_description) {
      return this.record.attrs.physical_description;
    }
    
    return '';
  }
  
  /**
   * Get format display name
   */
  getFormatLabel(code: string): string {
    return this.catalogService.getFormatLabel(code);
  }
}
