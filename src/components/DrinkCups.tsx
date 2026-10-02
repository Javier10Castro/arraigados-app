import { CupSoda } from 'lucide-react';
import styles from './DrinkCups.module.css';

type Props = {
  /** Total incluido en el paquete (Package.includedDrinks, de Neon). */
  total: number;
  /** Ya canjeadas (Pulse.drinksUsed, de Neon). */
  used: number;
  size?: number;
  tone?: 'light' | 'dark';
  className?: string;
};

/**
 * Aguas frescas como vasos: sólidos = disponibles, punteados = ya canjeadas.
 * Lo usan "Mi paquete" (asistente, solo lectura) y el modal de canje de Staff.
 */
export default function DrinkCups({ total, used, size = 34, tone = 'light', className = '' }: Props) {
  const usedClamped = Math.min(Math.max(used, 0), total);
  const available = total - usedClamped;
  return (
    <div
      className={`${styles.cups} ${tone === 'dark' ? styles.dark : ''} ${className}`}
      role="img"
      aria-label={`${available} de ${total} aguas frescas disponibles`}
    >
      {Array.from({ length: total }, (_, i) => {
        const isAvailable = i < available;
        return (
          <span key={i} className={`${styles.cup} ${isAvailable ? styles.available : styles.used}`}>
            <CupSoda size={size} strokeWidth={isAvailable ? 1.9 : 1.6} />
          </span>
        );
      })}
    </div>
  );
}
