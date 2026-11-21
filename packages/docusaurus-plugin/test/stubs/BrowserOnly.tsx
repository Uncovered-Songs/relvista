import { useEffect, useState, type ReactNode } from 'react';

// Like Docusaurus: the fallback on the server and in the hydration render, the children once the
// page is interactive.
export default function BrowserOnly({
  children,
  fallback,
}: {
  children: () => ReactNode;
  fallback?: ReactNode;
}): ReactNode {
  const [browser, setBrowser] = useState(false);
  useEffect(() => setBrowser(true), []);
  return browser ? children() : (fallback ?? null);
}
