import type { ReactNode } from 'react';
import type { Props as CodeBlockProps } from '@theme/CodeBlock';
import OriginalCodeBlock from '@theme-init/CodeBlock';
import DbmlDiagram from '@theme/DbmlDiagram';
import { parseDbmlMeta } from '../../meta.js';

const DBML_CLASS = /(?:^|\s)language-dbml(?:\s|$)/;

function textOf(children: ReactNode): string | null {
  if (typeof children === 'string') return children;
  if (Array.isArray(children) && children.every((c) => typeof c === 'string'))
    return children.join('');
  return null;
}

/**
 * Wraps the classic CodeBlock: a ` ```dbml ` fence becomes a diagram. Everything else (including
 * `<CodeBlock language="dbml">` and ` ```dbml static `) renders as code.
 */
export default function CodeBlockEnhancer(props: CodeBlockProps): ReactNode {
  const text = DBML_CLASS.test(props.className ?? '') ? textOf(props.children) : null;
  if (text === null) return <OriginalCodeBlock {...props} />;

  const meta = parseDbmlMeta(props.metastring);
  if (meta.static) return <OriginalCodeBlock {...props} />;
  const title = meta.title ?? (typeof props.title === 'string' ? props.title : undefined);
  return (
    <DbmlDiagram
      value={text.replace(/\n$/, '')}
      title={title}
      height={meta.height}
      view={meta.view}
      layout={meta.layout}
      source={meta.source}
      detailLevel={meta.detailLevel}
    />
  );
}
