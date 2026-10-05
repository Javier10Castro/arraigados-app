import styles from './AvailabilityStatus.module.css';

/**
 * Indicador discreto de disponibilidad -- punto + texto (3 oct 2026).
 * Nace para /menu-preview pero vive en components/ a propósito: la
 * disponibilidad es un estado que también querremos mostrar en el modal de
 * detalle y, más adelante, en /admin/menu -- no es exclusivo de la tarjeta.
 */
export default function AvailabilityStatus({ available, className = '' }: { available: boolean; className?: string }) {
  return (
    <span className={`${styles.status} ${available ? styles.available : styles.unavailable} ${className}`}>
      <span className={styles.dot} aria-hidden="true" />
      {available ? 'Disponible' : 'No disponible'}
    </span>
  );
}
