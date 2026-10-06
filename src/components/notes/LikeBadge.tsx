import { Heart } from 'lucide-react';
import styles from './LikeBadge.module.css';

/**
 * Los likes de una nota se ven SIEMPRE igual que en la campana: un círculo rojo sólido con el corazón en
 * negativo (blanco) y el número a un lado. `on={false}` es la versión "todavía no le diste like": círculo
 * con borde rojo y corazón vacío. `size` en px del círculo. El color del número hereda de `--like-num`.
 */
export default function LikeBadge({
  count,
  label,
  on = true,
  size = 20,
  className,
}: {
  /** Total de likes; si es undefined/0 solo se ve el círculo (y `label`, si lo hay). */
  count?: number;
  /** Texto en lugar del número (ej. "Me gusta" cuando todavía no hay likes). */
  label?: string;
  on?: boolean;
  size?: number;
  className?: string;
}) {
  const shown = count && count > 0 ? String(count) : label;
  return (
    <span className={`${styles.root}${className ? ` ${className}` : ''}`}>
      <span className={`${styles.dot} ${on ? styles.on : styles.off}`} style={{ width: size, height: size }} aria-hidden="true">
        <Heart size={Math.round(size * 0.55)} strokeWidth={on ? 0 : 2.6} fill={on ? 'currentColor' : 'none'} />
      </span>
      {shown && <span className={styles.num}>{shown}</span>}
    </span>
  );
}
