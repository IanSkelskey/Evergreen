import { Component, input, output, ElementRef, ViewChild, OnInit, OnChanges, SimpleChanges, signal, computed } from '@angular/core';
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
    placeholder = input<string>($localize`Enter your code here...`);
    showLineNumbers = input<boolean>(true);
    defaultFilename = input<string | null>(null); // New input for default filename

    // Outputs
    codeChange = output<string>();
    lineNumbersToggled = output<boolean>();
    saveCode = output<{content: string, language: string}>();
    // New output for file loading
    fileLoaded = output<{content: string, filename: string}>();

    // View references
    @ViewChild('codeTextarea', { static: true }) codeTextarea!: ElementRef<HTMLTextAreaElement>;

    // Internal state
    protected highlightedCode = signal<HighlightedCode>({ html: '', language: '', valid: true });
    protected lineNumbers = signal<number[]>([1]);
    private lineNumbersToggleState = signal<boolean | null>(null);

    // Add cursor position tracking
    protected cursorLine = signal<number>(1);
    protected cursorColumn = signal<number>(1);

    // Computed state that combines input and toggle state
    protected effectiveShowLineNumbers = computed(() => {
        return this.lineNumbersToggleState() === null ?
            this.showLineNumbers() :
            this.lineNumbersToggleState();
    });

    private readonly INDENT = '  ';

    // Add a property to track if save was handled by parent
    saveHandled = false;

    constructor(private syntaxHighlightingService: SyntaxHighlightingService) {}

    ngOnInit(): void {
        this.updateView();
        this.updateCursorPosition(); // Initialize cursor position
    }

    ngOnChanges(changes: SimpleChanges): void {
        if ('code' in changes || 'language' in changes) {
            this.updateView();
        }

        // Reset toggle state when input changes
        if ('showLineNumbers' in changes) {
            this.lineNumbersToggleState.set(null);
        }
    }

    protected toggleLineNumbers(): void {
        const newValue = !this.effectiveShowLineNumbers();
        this.lineNumbersToggleState.set(newValue);
        this.lineNumbersToggled.emit(newValue);
    }

    protected onCodeChange(event: Event): void {
        const newCode = (event.target as HTMLTextAreaElement).value;
        this.codeChange.emit(newCode);

        // Update cursor position when text changes
        this.updateCursorPosition();

        // Defer update to next tick for better performance
        setTimeout(() => this.updateView(), 0);
    }

    // Add handlers for cursor movement events
    protected onCursorMove(event: Event): void {
        this.updateCursorPosition();
    }

    // Fix: Make onScroll method protected so it's accessible from the template
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

                // Check if horizontal scrollbar is needed
                this.checkHorizontalOverflow(textarea);
            });
        }
    }

    protected onKeyDown(event: KeyboardEvent): void {
        if (event.key === 'Tab') {
            const textarea = event.target as HTMLTextAreaElement;
            const hasSelection = textarea.selectionStart !== textarea.selectionEnd;

            // Only capture Tab when there's a text selection
            // This allows Tab to work normally for field navigation when no text is selected
            if (hasSelection) {
                event.preventDefault();
                this.handleTabKey(textarea, event.shiftKey);
            }
        }

        // Update cursor position on next tick after key handling
        setTimeout(() => this.updateCursorPosition(), 0);
    }

    // Method to handle save button click
    protected onSaveClick(): void {
        // Reset the handled flag
        this.saveHandled = false;

        // Get current content and language
        const content = this.code();
        const language = this.language();

        // Emit the event for parent components to handle
        this.saveCode.emit({
            content,
            language
        });

        // Set a timeout to check if the event was handled
        setTimeout(() => {
            // If not handled by parent, try using File System Access API
            if (!this.saveHandled) {
                this.saveWithDialog(content, language);
            }
        }, 100);
    }

    // Use File System Access API if available, otherwise fall back to direct download
    private async saveWithDialog(content: string, language: string): Promise<void> {
        // Check if the File System Access API is available
        if ('showSaveFilePicker' in window) {
            try {
                // Generate suggested filename with extension
                const suggestedName = this.getFilenameWithExtension(language);

                // Define file types based on language
                const fileTypes = this.getFileTypes(language);

                // Show the save file picker dialog
                const fileHandle = await (window as any).showSaveFilePicker({
                    suggestedName,
                    types: fileTypes,
                });

                // Get a writable stream
                const writable = await fileHandle.createWritable();

                // Write the content
                await writable.write(content);

                // Close the stream
                await writable.close();

                console.log('File saved successfully using File System Access API');
            } catch (error) {
                // If user cancels or there's an error, fall back to download
                if (error.name !== 'AbortError') {
                    console.warn('Error using File System Access API, falling back to download:', error);
                    this.downloadFile(content, language);
                }
            }
        } else {
            // Fall back to direct download for browsers without File System Access API
            console.log('File System Access API not supported, falling back to download');
            this.downloadFile(content, language);
        }
    }

    // Helper to get file types configuration for the file picker
    private getFileTypes(language: string): Array<{description: string, accept: {[key: string]: string[]}}> {
        // Map languages to MIME types and extensions
        const mimeTypes: {[key: string]: {mime: string, extensions: string[]}} = {
            'javascript': { mime: 'text/javascript', extensions: ['.js'] },
            'typescript': { mime: 'application/typescript', extensions: ['.ts'] },
            'html': { mime: 'text/html', extensions: ['.html', '.htm'] },
            'css': { mime: 'text/css', extensions: ['.css'] },
            'json': { mime: 'application/json', extensions: ['.json'] },
            'markdown': { mime: 'text/markdown', extensions: ['.md', '.markdown'] },
            'python': { mime: 'text/x-python', extensions: ['.py'] },
            'java': { mime: 'text/x-java', extensions: ['.java'] },
            'c': { mime: 'text/x-c', extensions: ['.c'] },
            'cpp': { mime: 'text/x-c++', extensions: ['.cpp', '.cc', '.cxx'] },
            'csharp': { mime: 'text/x-csharp', extensions: ['.cs'] },
            'ruby': { mime: 'text/x-ruby', extensions: ['.rb'] },
            'php': { mime: 'application/x-php', extensions: ['.php'] },
            'sql': { mime: 'application/sql', extensions: ['.sql'] },
            'xml': { mime: 'application/xml', extensions: ['.xml'] },
            'yaml': { mime: 'application/yaml', extensions: ['.yml', '.yaml'] },
            'bash': { mime: 'application/x-sh', extensions: ['.sh'] },
            'tt2': { mime: 'text/plain', extensions: ['.tt2'] },
            'plaintext': { mime: 'text/plain', extensions: ['.txt'] }
        };

        // Get mime type and extensions for the language, default to plaintext
        const { mime, extensions } = mimeTypes[language.toLowerCase()] || mimeTypes['plaintext'];

        // Create accept object with mime type mapped to extensions
        const accept: {[key: string]: string[]} = {};
        accept[mime] = extensions;

        // Return file types array with description and accept object
        return [{
            description: `${language.charAt(0).toUpperCase() + language.slice(1)} files`,
            accept
        }];
    }

    // Method to directly download the file (fallback method)
    private downloadFile(content: string, language: string): void {
        // Create a blob with the content
        const blob = new Blob([content], { type: 'text/plain' });

        // Create a URL for the blob
        const url = URL.createObjectURL(blob);

        // Generate an appropriate filename with extension
        const filename = this.getFilenameWithExtension(language);

        // Create a temporary anchor element to trigger the download
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;

        // Append to the body, click, and remove
        document.body.appendChild(a);
        a.click();

        // Clean up
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }

    // Helper to get appropriate filename with extension based on language
    private getFilenameWithExtension(language: string): string {
        const extensions: {[key: string]: string} = {
            'javascript': '.js',
            'typescript': '.ts',
            'html': '.html',
            'css': '.css',
            'json': '.json',
            'markdown': '.md',
            'python': '.py',
            'java': '.java',
            'c': '.c',
            'cpp': '.cpp',
            'csharp': '.cs',
            'ruby': '.rb',
            'php': '.php',
            'sql': '.sql',
            'xml': '.xml',
            'yaml': '.yml',
            'bash': '.sh',
            'tt2': '.tt2',
            'plaintext': '.txt'
        };

        const extension = extensions[language.toLowerCase()] || '.txt';

        // If a default filename was provided, use it
        if (this.defaultFilename()) {
            const customName = this.defaultFilename() ?? 'code';
            // If custom filename already has an extension, use it as-is
            if (customName.includes('.')) {
                return customName;
            }
            // Otherwise add the appropriate extension based on language
            return `${customName}${extension}`;
        }

        // Fall back to default name with extension
        return `code${extension}`;
    }

    // Public method to mark save as handled by parent
    public markSaveHandled(): void {
        this.saveHandled = true;
    }

    // Helper method to update cursor position
    private updateCursorPosition(): void {
        if (!this.codeTextarea) {return;}

        const textarea = this.codeTextarea.nativeElement;
        const cursorPos = textarea.selectionStart;
        const textBeforeCursor = textarea.value.substring(0, cursorPos);

        // Calculate line number (count newlines before cursor + 1)
        const line = (textBeforeCursor.match(/\n/g) || []).length + 1;

        // Calculate column (characters since last newline + 1)
        const lastNewlineIndex = textBeforeCursor.lastIndexOf('\n');
        const column = lastNewlineIndex >= 0
            ? cursorPos - lastNewlineIndex
            : cursorPos + 1;

        this.cursorLine.set(line);
        this.cursorColumn.set(column);
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

        // After updating content, check if horizontal scrollbar is needed
        setTimeout(() => {
            if (this.codeTextarea) {
                this.checkHorizontalOverflow(this.codeTextarea.nativeElement);
            }
        }, 0);
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
        // Focus the textarea to ensure commands work
        textarea.focus();

        const currentValue = textarea.value;

        // Only update if the value actually changed
        if (currentValue !== value) {
            // Find the first position where the text differs
            let firstDiffPos = 0;
            const minLength = Math.min(currentValue.length, value.length);

            while (firstDiffPos < minLength && currentValue[firstDiffPos] === value[firstDiffPos]) {
                firstDiffPos++;
            }

            // Find the last position where the text differs (working backwards)
            let lastDiffPosFromEnd = 0;
            while (
                lastDiffPosFromEnd < minLength - firstDiffPos &&
                currentValue[currentValue.length - 1 - lastDiffPosFromEnd] ===
                value[value.length - 1 - lastDiffPosFromEnd]
            ) {
                lastDiffPosFromEnd++;
            }

            // Calculate the actual positions
            const selStart = firstDiffPos;
            const selEnd = currentValue.length - lastDiffPosFromEnd;
            const replacement = value.substring(firstDiffPos, value.length - lastDiffPosFromEnd);

            // Select just the text that differs
            textarea.setSelectionRange(selStart, selEnd);

            // Replace with the new content
            document.execCommand('insertText', false, replacement);
        }

        // Set the final cursor position
        textarea.setSelectionRange(start, end);

        // Ensure Angular detects the change
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    private checkHorizontalOverflow(element: HTMLElement): void {
        // Check if content is wider than the container
        const hasHorizontalOverflow = element.scrollWidth > element.clientWidth;

        // Add or remove class based on overflow status
        if (hasHorizontalOverflow) {
            element.classList.add('show-horizontal-scrollbar');
            const codeDisplay = element.parentElement?.querySelector('.code-display');
            if (codeDisplay) {
                codeDisplay.classList.add('show-horizontal-scrollbar');
            }
        } else {
            element.classList.remove('show-horizontal-scrollbar');
            const codeDisplay = element.parentElement?.querySelector('.code-display');
            if (codeDisplay) {
                codeDisplay.classList.remove('show-horizontal-scrollbar');
            }
        }
    }

    // Method to handle load button click
    protected onLoadClick(): void {
        // Try using File System Access API if available
        if ('showOpenFilePicker' in window) {
            this.loadWithFilePicker();
        } else {
            // Fall back to traditional file input for browsers without File System Access API
            this.loadWithFileInput();
        }
    }

    // Use File System Access API for file loading
    private async loadWithFilePicker(): Promise<void> {
        try {
            // Define file types based on current language
            const fileTypes = this.getFileTypes(this.language());

            // Show the file picker dialog
            const [fileHandle] = await (window as any).showOpenFilePicker({
                types: fileTypes,
                multiple: false
            });

            // Get the file object
            const file = await fileHandle.getFile();

            // Read the file content
            const content = await file.text();

            // Apply the content in an undoable way
            this.applyLoadedContent(content);

            // Emit file loaded event
            this.fileLoaded.emit({
                content,
                filename: file.name
            });

            console.log('File loaded successfully using File System Access API');
        } catch (error) {
            // Handle errors or user cancellation
            if (error.name !== 'AbortError') {
                console.warn('Error using File System Access API, falling back to file input:', error);
                this.loadWithFileInput();
            }
        }
    }

    // Fallback method using traditional file input
    private loadWithFileInput(): void {
        // Create a temporary file input element
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = this.getAcceptAttributeValue(this.language());

        // Handle file selection
        fileInput.onchange = (event) => {
            const files = (event.target as HTMLInputElement).files;
            if (files && files.length > 0) {
                const file = files[0];
                const reader = new FileReader();

                reader.onload = (e) => {
                    const content = (e.target?.result as string) || '';

                    // Apply the content in an undoable way
                    this.applyLoadedContent(content);

                    // Emit file loaded event
                    this.fileLoaded.emit({
                        content,
                        filename: file.name
                    });
                };

                reader.readAsText(file);
            }
        };

        // Trigger the file dialog
        fileInput.click();
    }

    // Helper to get accept attribute value for file input
    private getAcceptAttributeValue(language: string): string {
        const mimeTypes: {[key: string]: string} = {
            'javascript': '.js,application/javascript,text/javascript',
            'typescript': '.ts,application/typescript',
            'html': '.html,.htm,text/html',
            'css': '.css,text/css',
            'json': '.json,application/json',
            'markdown': '.md,.markdown,text/markdown',
            'python': '.py,text/x-python',
            'java': '.java,text/x-java',
            'c': '.c,text/x-c',
            'cpp': '.cpp,.cc,.cxx,text/x-c++',
            'csharp': '.cs,text/x-csharp',
            'ruby': '.rb,text/x-ruby',
            'php': '.php,application/x-php',
            'sql': '.sql,application/sql',
            'xml': '.xml,application/xml,text/xml',
            'yaml': '.yml,.yaml,application/yaml',
            'bash': '.sh,application/x-sh',
            'tt2': '.tt2,text/plain',
            'plaintext': '.txt,text/plain'
        };

        return mimeTypes[language.toLowerCase()] || '.txt,text/plain';
    }

    // Apply loaded content in a way that can be undone with Ctrl+Z
    private applyLoadedContent(content: string): void {
        if (!this.codeTextarea) {return;}

        const textarea = this.codeTextarea.nativeElement;
        const currentValue = textarea.value;

        // If content is the same, do nothing
        if (currentValue === content) {return;}

        // Focus the textarea to ensure the undo operation works
        textarea.focus();

        // Select all existing content
        textarea.select();

        // Use the existing updateTextarea method which works with undo history
        this.updateTextarea(textarea, content, 0, 0);

        // Update view after content change
        this.updateView();
    }
}
