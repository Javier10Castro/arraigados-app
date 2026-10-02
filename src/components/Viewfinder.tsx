import type { ReactNode } from 'react';
import styles from './Viewfinder.module.css';

type Props = {
  children?: ReactNode;
  className?: string;
  size?: 'md' | 'lg';
};

export default function Viewfinder({ children, className = '', size = 'md' }: Props) {
  return (
    <div className={[styles.frame, styles[size], className].filter(Boolean).join(' ')}>
      <span className={`${styles.corner} ${styles.tl}`} />
      <span className={`${styles.corner} ${styles.tr}`} />
      <span className={`${styles.corner} ${styles.bl}`} />
      <span className={`${styles.corner} ${styles.br}`} />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
