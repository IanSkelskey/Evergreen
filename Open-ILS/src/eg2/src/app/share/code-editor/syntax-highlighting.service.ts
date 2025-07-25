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
    private readonly languageMap: Record<string, string> = {
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
        'tt2-pseudoperl': 'tt2-pseudoperl',
        'php': 'php',
        'ruby': 'ruby',
        'go': 'go',
        'rust': 'rust',
        'kotlin': 'kotlin',
        'swift': 'swift',
        'dart': 'dart',
        'scala': 'scala',
        'yaml': 'yaml',
        'dockerfile': 'dockerfile',
        'nginx': 'nginx',
        'apache': 'apache'
    };

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
        // Handle empty or null code
        if (!code?.trim()) {
            return { html: '', language, valid: true };
        }

        try {
            const mappedLanguage = this.getMappedLanguage(language);
            
            // Try specific language first, then auto-detect
            const result = this.isLanguageAvailable(mappedLanguage)
                ? hljs.highlight(code, { language: mappedLanguage })
                : hljs.highlightAuto(code);

            return {
                html: result.value,
                language: result.language || language,
                valid: true
            };
        } catch (error) {
            console.warn('Syntax highlighting failed:', error);
            return {
                html: this.escapeHtml(code),
                language,
                valid: false
            };
        }
    }

    /**
     * Get list of supported languages
     */
    getSupportedLanguages(): string[] {
        return Object.keys(this.languageMap).sort();
    }

    /**
     * Check if a language is supported
     */
    isLanguageSupported(language: string): boolean {
        return language.toLowerCase() in this.languageMap;
    }

    /**
     * Get the mapped language name for highlight.js
     */
    private getMappedLanguage(language: string): string {
        return this.languageMap[language.toLowerCase()] || language;
    }

    /**
     * Check if a language is available in highlight.js
     */
    private isLanguageAvailable(language: string): boolean {
        try {
            return hljs.getLanguage(language) !== undefined;
        } catch {
            return false;
        }
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
