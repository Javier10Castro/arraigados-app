import type { ReactNode } from 'react';
import styles from './Badge.module.css';

type Props = {
  variant?: 'live' | 'tag' | 'plain' | 'dark';
  dot?: boolean;
  children: ReactNode;
  className?: string;
};

export default function Badge({ variant = 'tag', dot = false, children, className = '' }: Props) {
  return (
    <span className={[styles.badge, styles[variant], className].filter(Boolean).join(' ')}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  );
}
