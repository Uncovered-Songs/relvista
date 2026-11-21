// Swizzled (safe) from @docusaurus/theme-classic: a branded 404 with links back into the site.
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Heading from '@theme/Heading';
import ThemedImage from '@theme/ThemedImage';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import styles from './styles.module.css';

export default function NotFoundContent({ className }: { className?: string }): ReactNode {
  return (
    <main className={clsx('container', styles.notFound, className)}>
      <ThemedImage
        className={styles.mark}
        alt=""
        aria-hidden="true"
        width={56}
        height={56}
        sources={{ light: useBaseUrl('/img/mark.svg'), dark: useBaseUrl('/img/mark-white.svg') }}
      />
      <Heading as="h1">Page not found</Heading>
      <p>This page does not exist or has moved.</p>
      <div className={styles.links}>
        <Link className="button button--primary" to="/docs/getting-started">
          Docs home
        </Link>
        <Link className="button button--secondary" to="pathname:///editor/" target="_self">
          Open the editor
        </Link>
        <Link className="button button--link" to="/">
          Home
        </Link>
      </div>
    </main>
  );
}
