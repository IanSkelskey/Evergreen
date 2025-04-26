import { 
  Component, 
  ElementRef, 
  EventEmitter, 
  Input, 
  Output, 
  ViewChild, 
  AfterViewInit, 
  OnChanges, 
  SimpleChanges 
} from '@angular/core';

/**
 * Reusable component for selecting bucket IDs across different modules
 */
@Component({
  selector: 'eg-bucket-id-selector',
  templateUrl: './bucket-id-selector.component.html',
  styleUrls: ['./bucket-id-selector.component.css',
    './bucket.module.css']
})
export class BucketIdSelectorComponent implements AfterViewInit, OnChanges {
  // Input configurations
  @Input() bucketId: number = null;
  @Input() placeholder = $localize`Enter Bucket ID`; 
  @Input() buttonLabel = $localize`Retrieve`;
  @Input() showLabel = false;
  @Input() labelText = $localize`Bucket ID`;
  @Input() helpText = '';
  @Input() disabled = false;
  @Input() processing = false;
  @Input() buttonIcon = '';
  @Input() buttonClass = 'btn-outline-primary';
  @Input() inputLayout = 'horizontal'; // 'horizontal' or 'vertical'
  @Input() autoFocus = false;
  
  // Output events
  @Output() idSubmit = new EventEmitter<number>();
  @Output() idChange = new EventEmitter<number>();
  
  @ViewChild('bucketIdInput') bucketIdInput: ElementRef;
  
  constructor() { }
  
  ngAfterViewInit(): void {
    if (this.autoFocus && this.bucketIdInput) {
      setTimeout(() => {
        this.bucketIdInput.nativeElement.focus();
      }, 100);
    }
  }
  
  ngOnChanges(changes: SimpleChanges): void {
    // Focus input when disabled state changes to false
    if (changes.disabled && 
        !changes.disabled.currentValue && 
        changes.disabled.previousValue &&
        this.bucketIdInput) {
      setTimeout(() => {
        this.bucketIdInput.nativeElement.focus();
      }, 100);
    }
  }

  submitId(): void {
    if (this.disabled || this.processing) {
      return;
    }
    
    // Don't submit if there's no valid ID
    if (this.bucketId === null || this.bucketId === undefined || this.bucketId < 0) {
      // Focus the input instead
      if (this.bucketIdInput) {
        this.bucketIdInput.nativeElement.focus();
      }
      return;
    }
    
    this.idSubmit.emit(this.bucketId);
  }
  
  onIdChange(event: any): void {
    this.idChange.emit(this.bucketId);
  }
}
