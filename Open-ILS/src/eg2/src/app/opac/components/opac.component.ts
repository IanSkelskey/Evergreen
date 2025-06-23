import { Component } from '@angular/core';

@Component({
  selector: 'eg-opac',
  templateUrl: './opac.component.html',
  styles: [`
    .opac-flex-container {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    
    .flex-grow-1 {
      flex: 1 0 auto;
      padding-bottom: 2rem; /* Add padding to ensure content doesn't touch footer */
    }
  `]
})
export class OpacComponent {}