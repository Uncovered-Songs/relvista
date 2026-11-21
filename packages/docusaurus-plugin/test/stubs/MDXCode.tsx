import type { ReactNode } from 'react';

export default function MDXCode({ children }: { children?: ReactNode }): ReactNode {
  return <code data-testid="mdx-code">{children}</code>;
}
