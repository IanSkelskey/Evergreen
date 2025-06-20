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
    
    // Add listener for system dark/light mode changes
    const darkModePreference = window.matchMedia('(prefers-color-scheme: dark)');
    darkModePreference.addEventListener('change', () => {
      // Don't change color mode while printing
      if (!window.matchMedia('print').matches) {
        this.setColorMode();
      }
    });
    
    this.setColorMode();
  }

  /** Apply the selected theme */
  setColorMode(): void {
    if (this.colorMode === 'auto') {
      // In auto mode, set theme based on system preference
      document.documentElement.setAttribute('data-bs-theme',
        window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      );
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