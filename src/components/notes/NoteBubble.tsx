import { Plus } from 'lucide-react';
import styles from './NoteBubble.module.css';

/**
 * Burbuja de Nota del carrusel (5 oct 2026): chica, centrada sobre el avatar, al
 * estilo de las Notas de Instagram. La misma pieza sirve para la nota propia
 * (botón: abre el panel) y para las de los demás (solo lectura).
 *
 * Variantes: filled (con texto) · invite (tu avatar sin nota) · muted (error) · loading.
 * No sabe nada de red.
 */
type Props = {
  variant: 'filled' | 'invite' | 'muted' | 'loading';
  text?: string;
  /** Si viene, la burbuja es un botón (la nota propia). */
  onClick?: () => void;
  label?: string;
};

export default function NoteBubble({ variant, text, onClick, label }: Props) {
  if (variant === 'loading') return <span className={`${styles.bubble} ${styles.skeleton}`} aria-hidden="true" />;

  const content = (
    <>
      {variant === 'invite' && <Plus size={13} strokeWidth={2.8} aria-hidden="true" />}
      <span className={styles.text}>{text}</span>
    </>
  );
  const cls = `${styles.bubble} ${styles[variant]}`;

  return onClick ? (
    <button type="button" className={cls} onClick={onClick} aria-label={label}>
      {content}
    </button>
  ) : (
    <span className={cls}>{content}</span>
  );
}
