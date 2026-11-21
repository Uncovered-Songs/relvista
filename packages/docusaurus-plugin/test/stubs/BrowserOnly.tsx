import type { ReactNode } from 'react';

export default function BrowserOnly({ children }: { children: () => ReactNode }): ReactNode {
  return children();
}
