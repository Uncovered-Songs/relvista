import Link from '@docusaurus/Link';
import type { ReactNode } from 'react';
import styles from './styles.module.css';

export interface GalleryItem {
  to: string;
  number: string;
  title: string;
  description: string;
  stats: string;
}

export default function GalleryGrid({ items }: { items: GalleryItem[] }): ReactNode {
  return (
    <div className={styles.grid}>
      {items.map((item) => (
        <Link key={item.to} to={item.to} className={styles.card}>
          <span className={styles.number}>{item.number}</span>
          <span className={styles.title}>{item.title}</span>
          <span className={styles.description}>{item.description}</span>
          <span className={styles.stats}>{item.stats}</span>
        </Link>
      ))}
    </div>
  );
}
