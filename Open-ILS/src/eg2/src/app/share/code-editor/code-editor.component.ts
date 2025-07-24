import { Component, input, output, effect, signal, ElementRef, ViewChild, HostBinding, OnInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { SyntaxHighlightingService, HighlightedCode } from './syntax-highlighting.service';

@Component({
  selector: 'app-code-editor',
  template: `
    <div class="code-editor-container" [attr.data-language]="language()" [class.no-line-numbers]="!showLineNumbers()">
      <!-- Code input (invisible textarea) -->
      <textarea
        #codeTextarea
        class="code-input"
        [value]="code()"
        (input)="onCodeChange($event)"
        (scroll)="onScroll($event)"
        (keydown)="onKeyDown($event)"
        [placeholder]="placeholder()"
        spellcheck="false"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        wrap="off"
      ></textarea>
      
      <!-- Highlighted code display -->
      <pre 
        class="code-display" 
        [innerHTML]="highlightedCode().html"
        [attr.data-language]="language()"
      ></pre>
      
      <!-- Line numbers -->
      @if (showLineNumbers()) {
        <div class="line-numbers">
          @for (lineNum of lineNumbers(); track lineNum) {
            <span class="line-number">{{ lineNum }}</span>
          }
        </div>
      }
    </div>
  `,
  styleUrls: ['./code-editor.component.css']
})
export class CodeEditorComponent implements OnInit, OnDestroy, OnChanges {
  // Inputs
  code = input<string>('');
  language = input<string>('javascript');
  placeholder = input<string>('Enter your code here...');
  showLineNumbers = input<boolean>(true);
  
  // Outputs
  codeChange = output<string>();
  
  // View references
  @ViewChild('codeTextarea', { static: true }) codeTextarea!: ElementRef<HTMLTextAreaElement>;
  
  // Internal state
  protected highlightedCode = signal<HighlightedCode>({ html: '', language: '', valid: true });
  protected lineNumbers = signal<number[]>([1]);
  
  constructor(private syntaxHighlightingService: SyntaxHighlightingService) {}
  
  ngOnInit(): void {
    // Initial update
    this.updateHighlighting();
    this.updateLineNumbers();
  }
  
  ngOnChanges(changes: SimpleChanges): void {
    // Update when inputs change
    if ('code' in changes || 'language' in changes) {
      this.updateHighlighting();
      this.updateLineNumbers();
    }
  }
  
  ngOnDestroy(): void {
    // Clean up if needed
  }
  
  protected onCodeChange(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    const newCode = target.value;
    this.codeChange.emit(newCode);
    
    // Update highlighting and line numbers when code changes
    setTimeout(() => {
      this.updateHighlighting();
      this.updateLineNumbers();
    }, 0);
  }
  
  protected onScroll(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    const display = textarea.parentElement?.querySelector('.code-display') as HTMLElement;
    const lineNumbers = textarea.parentElement?.querySelector('.line-numbers') as HTMLElement;
    
    if (display) {
      display.scrollTop = textarea.scrollTop;
      display.scrollLeft = textarea.scrollLeft;
    }
    
    if (lineNumbers && this.showLineNumbers()) {
      lineNumbers.scrollTop = textarea.scrollTop;
    }
  }
  
  protected onKeyDown(event: KeyboardEvent): void {
    // Handle tab key for indentation
    if (event.key === 'Tab') {
      event.preventDefault();
      const textarea = event.target as HTMLTextAreaElement;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      
      if (event.shiftKey) {
        // Remove indentation (Shift+Tab)
        this.removeIndentation(textarea, start, end);
      } else {
        // Add indentation (Tab)
        this.addIndentation(textarea, start, end);
      }
    }
  }
  
  private updateHighlighting(): void {
    const currentCode = this.code();
    const currentLanguage = this.language();
    const result = this.syntaxHighlightingService.highlightCode(currentCode, currentLanguage);
    this.highlightedCode.set(result);
  }
  
  private updateLineNumbers(): void {
    const codeStr = this.code() || '';
    const lines = codeStr.split('\n').length;
    const numbers = Array.from({ length: Math.max(lines, 1) }, (_, i) => i + 1);
    this.lineNumbers.set(numbers);
  }
  
  private addIndentation(textarea: HTMLTextAreaElement, start: number, end: number): void {
    const value = textarea.value;
    const beforeSelection = value.substring(0, start);
    const selection = value.substring(start, end);
    const afterSelection = value.substring(end);
    
    if (start === end) {
      // No selection - just insert tab
      const newValue = beforeSelection + '  ' + afterSelection;
      textarea.value = newValue;
      textarea.setSelectionRange(start + 2, start + 2);
    } else {
      // Multi-line selection - indent each line
      const lines = selection.split('\n');
      const indentedLines = lines.map(line => '  ' + line);
      const newSelection = indentedLines.join('\n');
      const newValue = beforeSelection + newSelection + afterSelection;
      
      textarea.value = newValue;
      textarea.setSelectionRange(start, start + newSelection.length);
    }
    
    // Trigger input event to update the code
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }
  
  private removeIndentation(textarea: HTMLTextAreaElement, start: number, end: number): void {
    const value = textarea.value;
    const beforeSelection = value.substring(0, start);
    const selection = value.substring(start, end);
    const afterSelection = value.substring(end);
    
    if (start === end) {
      // No selection - remove indentation from current line
      const lineStart = beforeSelection.lastIndexOf('\n') + 1;
      const currentLine = value.substring(lineStart, end);
      
      if (currentLine.startsWith('  ')) {
        const newValue = value.substring(0, lineStart) + currentLine.substring(2) + afterSelection;
        textarea.value = newValue;
        textarea.setSelectionRange(Math.max(start - 2, lineStart), Math.max(start - 2, lineStart));
      }
    } else {
      // Multi-line selection - remove indentation from each line
      const lines = selection.split('\n');
      const unindentedLines = lines.map(line => line.startsWith('  ') ? line.substring(2) : line);
      const newSelection = unindentedLines.join('\n');
      const newValue = beforeSelection + newSelection + afterSelection;
      
      textarea.value = newValue;
      textarea.setSelectionRange(start, start + newSelection.length);
    }
    
    // Trigger input event to update the code
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
