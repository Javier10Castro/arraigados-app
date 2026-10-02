import styles from './Wordmark.module.css';

type Props = {
  className?: string;
  label?: string;
  variant?: 'original' | 'cream';
};

export default function Wordmark({ className = '', label = 'Arraigados', variant = 'original' }: Props) {
  return (
    <span className={`${styles.wordmark} ${className}`} role="img" aria-label={label}>
      <img
        className={styles.art}
        src={`/rcs/svg_editables/${variant === 'cream' ? 'LogoBage' : 'LogoMorado'}.svg`}
        alt=""
        width="2048"
        height="2048"
        draggable={false}
      />
    </span>
  );
}
