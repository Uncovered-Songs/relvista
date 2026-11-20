import type { ReactNode } from 'react';

export default function CodeBlock({ children }: { children: ReactNode }): ReactNode {
  return <pre data-testid="code">{children}</pre>;
}
