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
/**
 * Reparte el texto en DOS líneas parejas (cortando por palabras): "Honra a tu madre"
 * -> "Honra a" / "tu madre". Una sola palabra, o un texto muy corto, queda en una línea.
 */
export function splitLines(text: string): string[] {
  const t = text.trim().replace(/\s+/g, ' ');
  const words = t.split(' ');
  if (words.length < 2 || t.length < 9) return [t];
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const diff = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

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
      <span className={styles.text}>
        {splitLines(text ?? '').map((line, i) => (
          <span className={styles.line} key={i}>{line}</span>
        ))}
      </span>
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
