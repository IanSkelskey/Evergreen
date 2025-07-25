import { Injectable } from '@angular/core';
import hljs from 'highlight.js';
import { registerCustomLanguages } from './language-grammars';

export interface HighlightedCode {
  html: string;
  language: string;
  valid: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class SyntaxHighlightingService {
    private readonly supportedLanguages = new Set([
        'javascript', 'typescript', 'python', 'java', 'csharp', 'cpp', 'c',
        'html', 'css', 'json', 'xml', 'sql', 'markdown', 'bash', 'powershell',
        'php', 'ruby', 'go', 'rust', 'kotlin', 'swift', 'dart', 'scala',
        'yaml', 'dockerfile', 'nginx', 'apache', 'tt2', 'tt2-pseudoperl'
    ]);

    constructor() {
    // Configure highlight.js
        hljs.configure({
            ignoreUnescapedHTML: true,
            throwUnescapedHTML: false
        });

        // Initialize custom languages
        registerCustomLanguages();
    }

    /**
   * Highlights the given code with the specified language
   */
    highlightCode(code: string, language: string): HighlightedCode {
    // Handle null or undefined code
        if (code === null || code === undefined) {
            return {
                html: '',
                language: language,
                valid: true
            };
        }

        if (!code.trim()) {
            return {
                html: '',
                language: language,
                valid: true
            };
        }

        try {
            let result;

            if (this.isLanguageSupported(language) && this.isLanguageRegistered(language)) {
                // Use specific language highlighting
                result = hljs.highlight(code, { language: this.mapLanguage(language) });
            } else {
                // Auto-detect language or fallback
                result = hljs.highlightAuto(code);
            }

            return {
                html: result.value,
                language: result.language || language,
                valid: true
            };
        } catch (error) {
            console.warn('Syntax highlighting failed:', error);
            // Return escaped HTML as fallback
            return {
                html: this.escapeHtml(code),
                language: language,
                valid: false
            };
        }
    }

    /**
   * Check if a language is supported by this service
   */
    isLanguageSupported(language: string): boolean {
        return this.supportedLanguages.has(language.toLowerCase());
    }

    /**
   * Check if a language is actually registered with highlight.js
   */
    private isLanguageRegistered(language: string): boolean {
        const mappedLanguage = this.mapLanguage(language);
        try {
            // Try to get the language definition
            return hljs.getLanguage(mappedLanguage) !== undefined;
        } catch {
            return false;
        }
    }

    /**
   * Get list of supported languages
   */
    getSupportedLanguages(): string[] {
        return Array.from(this.supportedLanguages).sort();
    }

    /**
   * Map custom language names to highlight.js language names
   */
    private mapLanguage(language: string): string {
        const languageMap: Record<string, string> = {
            'csharp': 'cs',
            'cpp': 'cpp',
            'c': 'c',
            'javascript': 'javascript',
            'typescript': 'typescript',
            'python': 'python',
            'java': 'java',
            'html': 'html',
            'css': 'css',
            'json': 'json',
            'xml': 'xml',
            'sql': 'sql',
            'markdown': 'markdown',
            'bash': 'bash',
            'powershell': 'powershell',
            'plain': 'plaintext',
            'tt2': 'tt2',
            'tt2-pseudoperl': 'tt2-pseudoperl'
        };

        return languageMap[language.toLowerCase()] || language;
    }

    /**
   * Escape HTML characters for safe display
   */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
