import AvailabilityStatus from '../../components/AvailabilityStatus';
import { formatPrice } from '../../data/app';
import type { MenuPreviewItem } from '../../data/menuPreview';
import styles from './MenuPreview.module.css';

/**
 * Tarjeta de platillo (3 oct 2026, actualizada) -- toda la tarjeta es el
 * elemento clickeable (un <button>, no un <div onClick>, para que el teclado
 * y los lectores de pantalla la traten como lo que es), sin botón "Ver más"
 * adicional. Solo muestra foto, nombre, precio y disponibilidad -- la
 * descripción vive exclusivamente en el modal (ver DishModal.tsx).
 *
 * La foto va en un rectángulo con esquinas redondeadas (object-fit: cover),
 * sin máscara/recorte orgánico -- Javier prefirió esto a la primera versión.
 */
export default function DishCard({ item, onOpen }: { item: MenuPreviewItem; onOpen: () => void }) {
  return (
    <button type="button" className={styles.card} onClick={onOpen} aria-label={`Ver detalle de ${item.name}`}>
      <div className={styles.photoZone}>
        <img
          className={`${styles.dishPhoto} ${!item.available ? styles.dimmed : ''}`}
          src={item.image}
          alt={item.name}
          loading="lazy"
        />
      </div>
      <div className={styles.glassPanel}>
        <h3 className={styles.dishName}>{item.name}</h3>
        <div className={styles.panelRow}>
          <span className={styles.price}>{formatPrice(item.price)}</span>
          <AvailabilityStatus available={item.available} />
        </div>
      </div>
    </button>
  );
}
