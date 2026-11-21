import type { ReactNode } from 'react';

export default function DbmlDiff(props: Record<string, unknown>): ReactNode {
  const data = Object.fromEntries(
    Object.entries(props)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [`data-${k}`, String(v)]),
  );
  return <div data-testid="diff" {...data} />;
}
