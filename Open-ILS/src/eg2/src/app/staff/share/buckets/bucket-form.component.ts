import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { IdlService } from '@eg/core/idl.service';
import { AuthService } from '@eg/core/auth.service';

@Component({
  selector: 'eg-bucket-form',
  templateUrl: './bucket-form.component.html',
  styleUrls: ['./bucket-form.component.css',
    './buckets.css']
})
export class BucketFormComponent implements OnInit, OnChanges {
  // Inputs for configuration
  @Input() bucketClass: 'biblio' | 'user' | 'callnumber' | 'copy' = 'biblio';
  @Input() editMode = false;
  @Input() bucketData: any = null;
  @Input() showPublicOption = true;
  @Input() disabled = false;
  @Input() hideFormActions = false;
  
  // Outputs
  @Output() formSubmit = new EventEmitter<any>();
  @Output() formCancel = new EventEmitter<void>();
  @Output() formValidityChange = new EventEmitter<boolean>();
  
  // Form
  bucketForm: FormGroup;
  pending = false;
  formError: string = null;
  
  bucketFmClass: string;
  
  // Bucket types - can be overridden by parent component
  @Input() bucketTypes = [
    { value: 'staff_client', label: $localize`Staff Client` },
    { value: 'vandelay_queue', label: $localize`Import Queue` },
    { value: 'hold_subscription', label: $localize`Hold Subscription` }
  ];

  constructor(
    private formBuilder: FormBuilder,
    private idl: IdlService,
    private auth: AuthService
  ) { }

  // Make the isValid getter more robust with additional logging
  get isValid(): boolean {
    const isFormValid = this.bucketForm && this.bucketForm.valid;
    console.log('Bucket form isValid getter called, returning:', isFormValid, 
                'Form status:', this.bucketForm?.status);
    return isFormValid;
  }
  
  ngOnInit() {
    this.initForm();
    this.setBucketFmClass();
    
    if (this.editMode && this.bucketData) {
      this.populateForm();
    }
    
    // Subscribe to form value and status changes to ensure validation is triggered
    this.bucketForm.valueChanges.subscribe(() => {
      this.emitFormValidity();
    });
    
    this.bucketForm.statusChanges.subscribe(() => {
      this.emitFormValidity();
    });
    
    // Emit initial validity more aggressively to ensure parent components know the state
    setTimeout(() => {
      this.emitFormValidity();
      // Emit a second time after a delay to ensure it's caught
      setTimeout(() => this.emitFormValidity(), 200);
    }, 0);
  }
  
  // Emit current form validity state with more logging
  emitFormValidity() {
    if (!this.bucketForm) return; // Skip if form isn't initialized yet
    
    const isValid = this.bucketForm.valid;
    console.log('Form emitting validity:', isValid, 
                'Form touched:', this.bucketForm.touched,
                'Form dirty:', this.bucketForm.dirty,
                'Form status:', this.bucketForm.status);
    this.formValidityChange.emit(isValid);
  }
  
  ngOnChanges(changes: SimpleChanges) {
    // Re-initialize form when key inputs change
    if (changes['bucketClass'] || changes['editMode'] || changes['bucketData']) {
      if (this.bucketForm) {
        this.setBucketFmClass();
        
        if (this.editMode && this.bucketData) {
          this.populateForm();
        } else {
          this.resetForm();
        }
      }
    }
    
    if (changes['disabled'] && this.bucketForm) {
      this.setFormDisabled(this.disabled);
    }
  }

  private setBucketFmClass() {
    switch (this.bucketClass) {
      case 'biblio': this.bucketFmClass = 'cbreb'; break;
      case 'copy': this.bucketFmClass = 'ccb'; break;
      case 'callnumber': this.bucketFmClass = 'ccnb'; break;
      case 'user': this.bucketFmClass = 'cub'; break;
    }
  }

  private initForm() {
    this.bucketForm = this.formBuilder.group({
      name: ['', [Validators.required, Validators.maxLength(70)]],
      description: ['', Validators.maxLength(140)],
      bucketType: ['staff_client', Validators.required],
      isPublic: [false]
    });
  }
  
  private resetForm() {
    this.bucketForm.reset({
      name: '',
      description: '',
      bucketType: 'staff_client',
      isPublic: false
    });
    
    // More aggressive validity checking after reset
    setTimeout(() => {
      this.emitFormValidity();
      // Force validation check to ensure controls are in the right state
      this.bucketForm.updateValueAndValidity();
    }, 10);
  }
  
  private populateForm() {
    // Check if bucketData is an IDL object with functions or a plain object
    const getName = typeof this.bucketData.name === 'function' ? 
      this.bucketData.name() : this.bucketData.name;
    
    const getDesc = typeof this.bucketData.description === 'function' ? 
      this.bucketData.description() : this.bucketData.description;
      
    const getType = typeof this.bucketData.btype === 'function' ? 
      this.bucketData.btype() : this.bucketData.btype;
      
    // Check for pub which might be 't'/'f' strings or boolean
    let isPublic = false;
    if (this.bucketData.pub) {
      const pubValue = typeof this.bucketData.pub === 'function' ? 
        this.bucketData.pub() : this.bucketData.pub;
      isPublic = pubValue === 't' || pubValue === true;
    }
    
    this.bucketForm.patchValue({
      name: getName || '',
      description: getDesc || '',
      bucketType: getType || 'staff_client',
      isPublic: isPublic
    });
    
    if (this.editMode) {
      // In edit mode, bucket type should be disabled
      this.bucketForm.get('bucketType').disable();
    }
  }
  
  setFormDisabled(disabled: boolean) {
    if (disabled) {
      this.bucketForm.disable();
    } else {
      this.bucketForm.enable();
      
      // If in edit mode, keep bucket type disabled
      if (this.editMode) {
        this.bucketForm.get('bucketType').disable();
      }
    }
  }

  // Simplified method to validate and submit the form
  validateAndSubmit(): boolean {
    console.log('validateAndSubmit called', !!this.bucketForm, this.pending); // debug
    if (!this.bucketForm || this.pending) {
      return false;
    }
    
    if (this.bucketForm.invalid) {
      // Mark all fields as touched to trigger validation messages
      Object.keys(this.bucketForm.controls).forEach(key => {
        this.bucketForm.get(key).markAsTouched();
      });
      this.emitFormValidity();
      return false;
    }
    
    // Form is valid, proceed with submission
    this.submitForm();
    return true;
  }

  submitForm() {
    console.log('submitForm called', this.bucketForm.value); // debug
    if (this.bucketForm.invalid) {
      // Mark all fields as touched to trigger validation messages
      Object.keys(this.bucketForm.controls).forEach(key => {
        this.bucketForm.get(key).markAsTouched();
      });
      this.emitFormValidity(); // Update validity state
      return;
    }
    
    this.pending = true;
    const formValue = this.bucketForm.value;
    
    try {
      // If in edit mode, update existing bucket object
      if (this.editMode && this.bucketData) {
        const bucket = this.bucketData;
        
        if (typeof bucket.name === 'function') {
          bucket.name(formValue.name);
          bucket.description(formValue.description || '');
          bucket.pub(formValue.isPublic ? 't' : 'f');
        } else {
          bucket.name = formValue.name;
          bucket.description = formValue.description || '';
          bucket.pub = formValue.isPublic ? 't' : 'f';
        }
        
        this.formSubmit.emit(bucket);
      } else {
        // Create new bucket
        const bucket = this.idl.create(this.bucketFmClass);
        
        bucket.owner(this.auth.user().id());
        bucket.name(formValue.name);
        bucket.description(formValue.description || '');
        bucket.btype(formValue.bucketType);
        bucket.pub(formValue.isPublic ? 't' : 'f');
        
        // Emit the form submission event with the bucket object
        this.formSubmit.emit(bucket);
      }
    } catch (error) {
      this.formError = error.message || $localize`Error creating bucket data`;
      this.pending = false;
    }
    // Pending will be set to false by the parent component when submission is complete
  }
  
  cancel() {
    this.formCancel.emit();
  }

  // Form validation helpers
  get nameControl() { return this.bucketForm.get('name'); }
  get descriptionControl() { return this.bucketForm.get('description'); }

  hasError(controlName: string, errorType?: string): boolean {
    const control = this.bucketForm.get(controlName);
    if (!control) return false;
    return control.touched && (errorType ? control.hasError(errorType) : control.invalid);
  }
}
