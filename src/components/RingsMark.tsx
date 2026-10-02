import styles from './RingsMark.module.css';

type Props = { className?: string; title?: string; variant?: 'cream' | 'morado' };

export default function RingsMark({ className, title = 'Red Juvenil Tijuana', variant = 'cream' }: Props) {
  return (
    <img
      className={`${styles.rings} ${className ?? ''}`}
      src={`/rcs/svg_editables/${variant === 'morado' ? 'RJDT_CIRCLES_Morado' : 'RJDT_CIRCLES_LOGO'}.svg`}
      alt={title}
      width="603"
      height="148"
      draggable={false}
    />
  );
}
