import { Component, input, output, ElementRef, ViewChild, OnInit, OnChanges, SimpleChanges, signal } from '@angular/core';
import { SyntaxHighlightingService, HighlightedCode } from './syntax-highlighting.service';

@Component({
    selector: 'eg-code-editor',
    templateUrl: './code-editor.component.html',
    styleUrls: ['./code-editor.component.css']
})
export class CodeEditorComponent implements OnInit, OnChanges {
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

    private readonly INDENT = '  ';

    constructor(private syntaxHighlightingService: SyntaxHighlightingService) {}

    ngOnInit(): void {
        this.updateView();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if ('code' in changes || 'language' in changes) {
            this.updateView();
        }
    }

    protected onCodeChange(event: Event): void {
        const newCode = (event.target as HTMLTextAreaElement).value;
        this.codeChange.emit(newCode);

        // Defer update to next tick for better performance
        setTimeout(() => this.updateView(), 0);
    }

    protected onScroll(event: Event): void {
        const textarea = event.target as HTMLTextAreaElement;
        const codeDisplay = textarea.parentElement?.querySelector('.code-display') as HTMLElement;
        
        if (codeDisplay) {
            // Use requestAnimationFrame for smoother scrolling
            requestAnimationFrame(() => {
                // Sync scroll positions with the code display
                codeDisplay.scrollTop = textarea.scrollTop;
                codeDisplay.scrollLeft = textarea.scrollLeft;
                
                // Also sync line numbers if they exist
                if (this.showLineNumbers()) {
                    const lineNumbers = textarea.closest('.code-editor-container')?.querySelector('.line-numbers') as HTMLElement;
                    if (lineNumbers) {
                        lineNumbers.scrollTop = textarea.scrollTop;
                    }
                }
            });
        }
    }

    protected onKeyDown(event: KeyboardEvent): void {
        if (event.key === 'Tab') {
            event.preventDefault();
            const textarea = event.target as HTMLTextAreaElement;
            this.handleTabKey(textarea, event.shiftKey);
        }
    }

    private updateView(): void {
        const currentCode = this.code();
        const currentLanguage = this.language();

        // Update highlighting, ensuring proper handling of final newlines
        let processedCode = currentCode || '';
        
        // Ensure final newline has content so it's properly displayed
        if (processedCode.endsWith('\n')) {
            processedCode += ' ';
        }
        
        const result = this.syntaxHighlightingService.highlightCode(processedCode, currentLanguage);
        this.highlightedCode.set(result);

        // Update line numbers
        const lineCount = Math.max(processedCode.split('\n').length, 1);
        this.lineNumbers.set(Array.from({ length: lineCount }, (_, i) => i + 1));
    }

    private handleTabKey(textarea: HTMLTextAreaElement, isShiftTab: boolean): void {
        const { value, selectionStart, selectionEnd } = textarea;
        const hasSelection = selectionStart !== selectionEnd;

        const newValue = isShiftTab
            ? this.removeIndent(value, selectionStart, selectionEnd, hasSelection)
            : this.addIndent(value, selectionStart, selectionEnd, hasSelection);

        this.updateTextarea(textarea, newValue.text, newValue.start, newValue.end);
    }

    private addIndent(value: string, start: number, end: number, hasSelection: boolean):
        { text: string; start: number; end: number } {

        if (!hasSelection) {
            // Single cursor - insert indent
            return {
                text: value.substring(0, start) + this.INDENT + value.substring(end),
                start: start + this.INDENT.length,
                end: start + this.INDENT.length
            };
        }

        // Multi-line selection - indent each line
        const before = value.substring(0, start);
        const selection = value.substring(start, end);
        const after = value.substring(end);

        // Handle first line differently to preserve selection accuracy
        const lines = selection.split('\n');
        const indentedLines = lines.map(line => this.INDENT + line);
        const indented = indentedLines.join('\n');

        return {
            text: before + indented + after,
            start: start,
            end: start + indented.length
        };
    }

    private removeIndent(value: string, start: number, end: number, hasSelection: boolean):
        { text: string; start: number; end: number } {

        if (!hasSelection) {
            // Single cursor - remove indent from current line
            const lineStart = value.lastIndexOf('\n', start - 1) + 1;
            const lineContent = value.substring(lineStart);

            if (lineContent.startsWith(this.INDENT)) {
                return {
                    text: value.substring(0, lineStart) + lineContent.substring(this.INDENT.length),
                    start: Math.max(start - this.INDENT.length, lineStart),
                    end: Math.max(start - this.INDENT.length, lineStart)
                };
            }

            return { text: value, start, end };
        }

        // Multi-line selection - unindent each line
        const before = value.substring(0, start);
        const selection = value.substring(start, end);
        const after = value.substring(end);

        const unindented = selection.split('\n')
            .map(line => line.startsWith(this.INDENT) ? line.substring(this.INDENT.length) : line)
            .join('\n');

        return {
            text: before + unindented + after,
            start: start,
            end: start + unindented.length
        };
    }

    private updateTextarea(textarea: HTMLTextAreaElement, value: string, start: number, end: number): void {
        textarea.value = value;
        textarea.setSelectionRange(start, end);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
}
