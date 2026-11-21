import type { ReactNode } from 'react';
import type { Props as MDXCodeProps } from '@theme/MDXComponents/Code';
import OriginalMDXCode from '@theme-init/MDXComponents/Code';
import DbmlDiagram from '@theme/DbmlDiagram';
import DbmlDiff from '@theme/DbmlDiff';
import { parseDbmlMeta, splitDiffFence } from '../../../meta.js';

const DBML_CLASS = /(?:^|\s)language-dbml(?:\s|$)/;
const DBML_DIFF_CLASS = /(?:^|\s)language-dbml-diff(?:\s|$)/;

function textOf(children: ReactNode): string | null {
  if (typeof children === 'string') return children;
  if (Array.isArray(children) && children.every((c) => typeof c === 'string'))
    return children.join('');
  return null;
}

/** MDX passes the fence's info string after the language as `metastring`. */
type Props = MDXCodeProps & { metastring?: string; title?: unknown };

/**
 * Wraps the MDX `code` element (`@theme-init/MDXComponents/Code`): a ` ```dbml ` fence becomes a
 * diagram and a ` ```dbml-diff ` fence (old and new version separated by a line `---`) a schema
 * diff; every other fence goes on to the site's `CodeBlock` unchanged.
 *
 * relvista hooks in here rather than at `@theme/CodeBlock` on purpose. `CodeBlock` is where other
 * plugins (`@docusaurus/theme-live-codeblock`) and sites (`swizzle CodeBlock --wrap`) add their own
 * behaviour, and only one `@theme-init/CodeBlock` wrapper can be active: two plugins wrapping it
 * silently disable one another. Nothing else wraps `MDXComponents/Code`, so relvista, live code
 * blocks, mermaid and a site's own `CodeBlock` wrapper all work together, whatever their order
 * (relvista only has to load after the classic theme, see `registrationProblem`).
 * `<CodeBlock language="dbml">` and ` ```dbml static ` stay code.
 */
export default function MDXCodeWithDbml(props: Props): ReactNode {
  const className = props.className ?? '';
  const diff = DBML_DIFF_CLASS.test(className);
  const text = diff || DBML_CLASS.test(className) ? textOf(props.children) : null;
  if (text === null) return <OriginalMDXCode {...props} />;

  const meta = parseDbmlMeta(props.metastring);
  if (meta.static) return <OriginalMDXCode {...props} />;
  const title = meta.title ?? (typeof props.title === 'string' ? props.title : undefined);
  if (diff) {
    // Without a `---` line the whole body is the new version, and the diff says the old is missing.
    const parts = splitDiffFence(text) ?? { new: text.replace(/\n$/, '') };
    return (
      <DbmlDiff
        {...parts}
        title={title}
        height={meta.height}
        view={meta.view}
        layout={meta.layout}
        detailLevel={meta.detailLevel}
        ssr={meta.ssr}
        id={meta.id}
        summary={meta.summary}
      />
    );
  }
  return (
    <DbmlDiagram
      value={text.replace(/\n$/, '')}
      title={title}
      height={meta.height}
      view={meta.view}
      layout={meta.layout}
      source={meta.source}
      detailLevel={meta.detailLevel}
      ssr={meta.ssr}
      id={meta.id}
    />
  );
}
