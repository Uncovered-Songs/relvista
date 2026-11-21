// Swizzled (safe) from @docusaurus/theme-classic: only the page title's wording changes.
import Layout from '@theme/Layout';
import NotFoundContent from '@theme/NotFound/Content';
import type { ReactNode } from 'react';

export default function NotFound(): ReactNode {
  return (
    <Layout title="Page not found">
      <NotFoundContent />
    </Layout>
  );
}
