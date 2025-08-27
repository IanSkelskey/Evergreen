import hljs from 'highlight.js';

// Common TT2 keywords
const TT2_KEYWORDS = [
    'IF', 'ELSE', 'ELSIF', 'UNLESS', 'SWITCH', 'CASE', 'FOR', 'FOREACH',
    'WHILE', 'NEXT', 'LAST', 'RETURN', 'STOP', 'TRY', 'THROW', 'CATCH',
    'END', 'FILTER', 'MACRO', 'SET', 'DEFAULT', 'INSERT', 'INCLUDE',
    'PROCESS', 'WRAPPER', 'BLOCK', 'CALL', 'USE', 'DEBUG', 'TAGS', 'IN'
].join('|');

/**
 * Register TT2 Pseudo-Perl language grammar
 */
function registerTT2PseudoPerl(): void {
    hljs.registerLanguage('tt2-pseudoperl', (hljsInstance) => ({
        name: 'TT2 Pseudo-Perl',
        case_insensitive: false,
        contains: [
            // Comments and strings
            hljsInstance.HASH_COMMENT_MODE,
            hljsInstance.QUOTE_STRING_MODE,
            hljsInstance.APOS_STRING_MODE,
            hljsInstance.C_NUMBER_MODE,

            // TT2 Keywords
            {
                className: 'keyword',
                begin: `\\b(${TT2_KEYWORDS})\\b`,
                relevance: 10
            },

            // Method calls with dot-chaining
            {
                className: 'title.function',
                begin: /([a-zA-Z_]\w*)\.([a-zA-Z_]\w*)\s*\(/,
                end: /(?=\()/,
                returnBegin: true,
                contains: [
                    { className: 'variable', begin: /^[a-zA-Z_]\w*/ },
                    { className: 'property', begin: /\.[a-zA-Z_]\w*/, excludeBegin: true }
                ]
            },

            // Variables with $ prefix
            {
                className: 'variable',
                begin: /\$[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*/,
                relevance: 5
            },

            // Bare identifiers as variables
            {
                className: 'variable',
                begin: /\b[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*\b/,
                relevance: 0
            }
        ]
    }));
}

/**
 * Register Template Toolkit language grammar
 */
function registerTT2(): void {
    hljs.registerLanguage('tt2', (hljsInstance) => ({
        name: 'Template Toolkit',
        case_insensitive: false,
        subLanguage: 'xml',
        relevance: 0,
        contains: [
            {
                // TT2 blocks: [% ... %] or [%- ... -%]
                className: 'template-tag',
                begin: '\\[%-?',
                end: '-?%\\]',
                subLanguage: 'tt2-pseudoperl',
                excludeBegin: true,
                excludeEnd: true,
                relevance: 10
            }
        ]
    }));
}

/**
 * Register all custom language grammars
 */
export function registerCustomLanguages(): void {
    try {
        registerTT2PseudoPerl();
        registerTT2();
        console.log('Custom languages registered successfully');
    } catch (error) {
        console.warn('Failed to register custom languages:', error);
    }
}
