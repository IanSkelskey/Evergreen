import {Injectable} from '@angular/core';
import sanitizeHtml from 'sanitize-html';

const ENTITY_REGEX = /&[^\s]+;/;

/**
 * Translates HTML text into plain text.
 */

@Injectable()
export class HtmlToTxtService {

    unEscapeHtml(text: string): string {
        text = text.replace(/&quot;/g, '"');
        text = text.replace(/&nbsp;/g, ' ');
        text = text.replace(/&lt;/g, '<');
        text = text.replace(/&gt;/g, '>');
        text = text.replace(/&amp;/g, '&');
        return text;
    }

    // https://stackoverflow.com/questions/7394748
    entityToChars(text: string): string {
        if (text && text.match(ENTITY_REGEX)) {
            const node = document.createElement('textarea');
            node.innerHTML = text;
            return node.value;
        }
        return text;
    }

    // Translate an HTML string into plain text.
    // Removes HTML elements.
    // Replaces <li> with "*"
    // Replaces HTML entities with their character equivalent.
    htmlToTxt(html: string): string {
        if (!html || html === '') {
            return '';
        }

        // First remove multi-line comments.
        // NOTE: the regexp was originally /<!--(.*?)-->/gs
        //       but as of 2019-12-27 Firefox does not support
        //       the ES2018 regexp dotAll flag and Angular/tsc doesn't
        //       seem set up to transpile it
        let previousHtml;
        do {
            previousHtml = html;
            html = html.replace(/<!--([^]*?)-->/g, '');
        } while (html !== previousHtml);

        const lines = html.split(/\n/);
        const newLines = [];

        lines.forEach(line => {

            if (!line) {
                newLines.push(line);
                return;
            }

            line = this.unEscapeHtml(line);
            line = this.entityToChars(line);

            line = sanitizeHtml(line, {
                allowedTags: [],
                allowedAttributes: {}
            });

            if (line) { newLines.push(line); }
        });

        return newLines.join('\n');
    }
}
