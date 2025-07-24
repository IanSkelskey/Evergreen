import hljs from 'highlight.js';

/**
 * Register TT2 Pseudo-Perl language grammar
 */
export function registerTT2PseudoPerl(): void {
  hljs.registerLanguage('tt2-pseudoperl', function (hljs) {
    return {
      name: 'TT2 Pseudo-Perl',
      case_insensitive: false,
      
      contains: [
        // # or ## line comments
        hljs.HASH_COMMENT_MODE,
        // Single and double quoted strings
        hljs.QUOTE_STRING_MODE,
        hljs.APOS_STRING_MODE,
        // Numbers
        hljs.C_NUMBER_MODE,
        
        // Keywords for TT2 directives
        {
          className: 'keyword',
          begin: /\b(IF|ELSE|ELSIF|UNLESS|SWITCH|CASE|FOR|FOREACH|WHILE|NEXT|LAST|RETURN|STOP|TRY|THROW|CATCH|END|FILTER|MACRO|SET|DEFAULT|INSERT|INCLUDE|PROCESS|WRAPPER|BLOCK|CALL|USE|DEBUG|TAGS)\b/,
          relevance: 10
        },
        
        // Function calls with optional dot-chaining
        {
          className: 'title.function',
          begin: /([a-zA-Z_]\w*)\.([a-zA-Z_]\w*)\s*\(/,
          end: /(?=\()/,
          returnBegin: true,
          contains: [
            {
              className: 'variable',
              begin: /^[a-zA-Z_]\w*/
            },
            {
              className: 'property',
              begin: /\.[a-zA-Z_]\w*/,
              excludeBegin: true
            }
          ]
        },
        
        // Variables with $ prefix
        {
          className: 'variable',
          begin: /\$[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*/,
          relevance: 5
        },
        
        // Bare identifiers as variables (lower relevance to not override keywords)
        {
          className: 'variable',
          begin: /\b[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*\b/,
          relevance: 0
        }
      ]
    };
  });
}

/**
 * Register Template Toolkit language grammar
 */
export function registerTT2(): void {
  hljs.registerLanguage('tt2', function (hljs) {
    return {
      name: 'Template Toolkit',
      case_insensitive: false,
      // Outside TT2 blocks → highlight as HTML/XML
      subLanguage: 'xml',
      relevance: 0,
      
      contains: [
        {
          // Match TT2 blocks: [% ... %] or [%- ... -%]
          className: 'template-tag',
          begin: '\\[%-?',
          end: '-?%\\]',
          subLanguage: 'tt2-pseudoperl',
          excludeBegin: true,
          excludeEnd: true,
          relevance: 10
        }
      ]
    };
  });
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
