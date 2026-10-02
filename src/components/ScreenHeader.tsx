import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import styles from './ScreenHeader.module.css';

type Props = {
  title: string;
  back?: string;
  right?: ReactNode;
  light?: boolean;
};

export default function ScreenHeader({ title, back, right, light = false }: Props) {
  const navigate = useNavigate();
  return (
    <header className={`${styles.header} ${light ? styles.light : ''}`}>
      <div className={styles.side}>
        {back && (
          <button
            type="button"
            className={styles.back}
            aria-label="Volver"
            onClick={() => navigate(back)}
          >
            <ArrowLeft size={20} strokeWidth={2.2} />
          </button>
        )}
      </div>
      <h1 className={styles.title}>{title}</h1>
      <div className={`${styles.side} ${styles.right}`}>{right}</div>
    </header>
  );
}
