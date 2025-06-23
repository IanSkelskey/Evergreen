import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { OpacCatalogService } from '../services/opac-catalog.service';

@Component({
  selector: 'eg-opac-format-field',
  templateUrl: './format-field.component.html',
  styleUrls: ['./format-field.component.css']
})
export class FormatFieldComponent implements OnInit {
  @Input() selectedFormat = '';
  @Output() formatChange = new EventEmitter<string>();

  loading = true;

  constructor(public catalogService: OpacCatalogService) { }

  ngOnInit(): void {
    // Load formats data
    this.catalogService.fetchCcvms()
      .then(() => {
        this.loading = false;
      })
      .catch(error => {
        console.error('Error loading formats:', error);
        this.loading = false;
      });
  }

  onFormatChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.selectedFormat = select.value;
    this.formatChange.emit(this.selectedFormat);
  }
}
