import type { ReactNode } from 'react';
import CodeBlock from '@theme-original/CodeBlock';
import type CodeBlockType from '@theme/CodeBlock';
import type { WrapperProps } from '@docusaurus/types';

type Props = WrapperProps<typeof CodeBlockType>;

/**
 * The site's own swizzled wrapper (`docusaurus swizzle @docusaurus/theme-classic CodeBlock --wrap`):
 * every code block it renders carries `data-compat-codeblock`.
 */
export default function CodeBlockWrapper(props: Props): ReactNode {
  return (
    <div className="compat-codeblock" data-compat-codeblock="wrapped">
      <CodeBlock {...props} />
    </div>
  );
}
