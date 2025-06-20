import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'eg-opac-nav',
  templateUrl: './opac-nav.component.html',
  styleUrls: ['./opac-nav.component.css']
})
export class OpacNavComponent implements OnInit {
  isCollapsed = true;

  // Theme mode: 'auto' (system), 'light', or 'dark'
  colorMode: 'auto' | 'light' | 'dark' = 'auto';

  ngOnInit() {
    // Load saved setting or default to auto
    this.colorMode = (localStorage.getItem('egOpacColorMode') as any) || 'auto';
    this.setColorMode();
  }

  /** Apply the selected theme */
  setColorMode(): void {
    if (this.colorMode === 'auto') {
      document.documentElement.removeAttribute('data-bs-theme');
    } else {
      document.documentElement.setAttribute('data-bs-theme', this.colorMode);
    }
  }

  /** Switch between dark/light/auto modes */
  changeColorMode(mode: 'auto' | 'light' | 'dark'): void {
    this.colorMode = mode;
    localStorage.setItem('egOpacColorMode', mode);
    this.setColorMode();
  }
}