// Client module: registers a DBML grammar with the Prism instance Docusaurus' CodeBlock uses.
import { Prism } from 'prism-react-renderer';

const keywords =
  /\b(?:Project|Table|TablePartial|TableGroup|Ref|Enum|Note|Records|DiagramView|Metadata|Tables|Notes|TableGroups|Schemas|Indexes|indexes|checks|use|reuse|from|as|schema|table|tablepartial|tablegroup|enum|note|records)\b/;

Prism.languages['dbml'] = {
  comment: [
    { pattern: /\/\*[\s\S]*?\*\//, greedy: true },
    { pattern: /\/\/.*/, greedy: true },
  ],
  'front-matter': { pattern: /^---\n[\s\S]*?\n---(?=\n|$)/, greedy: true, alias: 'comment' },
  'triple-string': { pattern: /'''[\s\S]*?'''/, greedy: true, alias: 'string' },
  string: { pattern: /'(?:\\.|[^'\\\n])*'/, greedy: true },
  expression: { pattern: /`[^`]*`/, greedy: true, alias: 'template-string' },
  'quoted-name': { pattern: /"(?:\\.|[^"\\\n])*"/, greedy: true, alias: 'symbol' },
  color: { pattern: /#[\da-fA-F]{3,8}\b/, alias: 'number' },
  settings: {
    pattern: /\[[^\]\n]*\]/,
    inside: {
      punctuation: /[[\],:]/,
      string: /'(?:\\.|[^'\\])*'/,
      expression: { pattern: /`[^`]*`/, alias: 'template-string' },
      color: { pattern: /#[\da-fA-F]{3,8}\b/, alias: 'number' },
      keyword:
        /\b(?:pk|primary key|increment|not null|null|unique|default|note|ref|delete|update|cascade|restrict|set null|set default|no action|headercolor|color|name|type|check|inactive|example)\b/i,
      number: /-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/i,
      operator: /<>|[<>-]/,
    },
  },
  keyword: keywords,
  boolean: /\b(?:true|false|null)\b/,
  number: /-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/i,
  operator: /<>|[<>?-]|~/,
  punctuation: /[{}()[\].,:;*]/,
};
