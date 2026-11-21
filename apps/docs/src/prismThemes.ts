/**
 * Code-block themes in the editor's Monaco colours (docs/design/brand.md §7), so a snippet looks
 * the same in the docs and in the editor. Every colour is at least 4.5:1 on its background.
 */
import type { PrismTheme } from 'prism-react-renderer';

interface Colours {
  background: string;
  text: string;
  keyword: string;
  string: string;
  comment: string;
  number: string;
  operator: string;
}

function theme(c: Colours): PrismTheme {
  return {
    plain: { color: c.text, backgroundColor: c.background },
    styles: [
      { types: ['comment', 'prolog', 'doctype', 'cdata'], style: { color: c.comment } },
      { types: ['namespace'], style: { opacity: 0.8 } },
      {
        types: ['keyword', 'builtin', 'atrule', 'important', 'boolean', 'tag', 'selector'],
        style: { color: c.keyword },
      },
      {
        types: ['string', 'char', 'attr-value', 'template-string', 'regex', 'url', 'inserted'],
        style: { color: c.string },
      },
      { types: ['number', 'constant', 'symbol', 'unit'], style: { color: c.number } },
      { types: ['operator', 'punctuation', 'deleted'], style: { color: c.operator } },
      { types: ['attr-name', 'property', 'class-name', 'function'], style: { color: c.text } },
      { types: ['title'], style: { color: c.keyword, fontWeight: 'bold' } },
      { types: ['italic'], style: { fontStyle: 'italic' } },
      { types: ['bold'], style: { fontWeight: 'bold' } },
    ],
  };
}

export const relvistaLight = theme({
  background: '#f6f7f9',
  text: '#1f2633',
  keyword: '#2560d6',
  string: '#0f7b6c',
  comment: '#5f6b7e',
  number: '#b45309',
  operator: '#c2410c',
});

export const relvistaDark = theme({
  background: '#1a1f28',
  text: '#e4e8ef',
  keyword: '#6f9bff',
  string: '#3cc7ae',
  comment: '#8d98ab',
  number: '#e6b836',
  operator: '#ff9e64',
});
