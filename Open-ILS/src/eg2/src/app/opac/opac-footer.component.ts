// New footer component for OPAC
import { Component } from '@angular/core';

@Component({
  selector: 'eg-opac-footer',
  templateUrl: './opac-footer.component.html',
  styleUrls: ['./opac-footer.component.css']
})
export class OpacFooterComponent {
  startYear = 2006;
  currentYear = new Date().getFullYear();
}
