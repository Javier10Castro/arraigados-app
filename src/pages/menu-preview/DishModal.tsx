import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, X } from 'lucide-react';
import AvailabilityStatus from '../../components/AvailabilityStatus';
import { formatPrice } from '../../data/app';
import type { MenuPreviewItem } from '../../data/menuPreview';
import styles from './MenuPreview.module.css';

/**
 * Modal de detalle (3 oct 2026) -- misma mecánica que <RedeemModal> (ya
 * existente en components/, sin tocarlo): backdrop fijo que cierra al dar
 * clic fuera, Escape cierra, botón "Cerrar" visible, foco entra al abrir.
 * prefers-reduced-motion ya se respeta de forma global (tokens.css), así que
 * las animaciones de aquí no necesitan nada aparte.
 *
 * Se monta con un portal a document.body (no visible en AppShell.tsx/CSS,
 * que no se tocan): <main> en AppShell tiene position:relative + z-index:1,
 * así que cualquier position:fixed DENTRO de <main> -- como este backdrop --
 * queda atrapado en ese contexto de apilamiento y el nav inferior (fixed,
 * z-index:40, hermano de <main>) lo tapa en móvil. El portal lo saca de ahí.
 */
export default function DishModal({ item, onClose }: { item: MenuPreviewItem; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className={styles.backdrop} onClick={onClose}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dish-modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={styles.dialogClose} aria-label="Cerrar" onClick={onClose}>
          <X size={18} strokeWidth={2.4} />
        </button>

        <div className={styles.dialogPhotoZone}>
          <img
            className={`${styles.dialogPhoto} ${!item.available ? styles.dimmed : ''}`}
            src={item.image}
            alt={item.name}
          />
        </div>

        <div className={styles.dialogBody}>
          <h2 id="dish-modal-title" className={styles.dialogName}>
            {item.name}
          </h2>
          <div className={styles.dialogRow}>
            <span className={styles.dialogPrice}>{formatPrice(item.price)}</span>
            <AvailabilityStatus available={item.available} />
          </div>
          <p className={styles.dialogDesc}>{item.description}</p>
          <p className={styles.dialogVenue}>
            <MapPin size={14} strokeWidth={2.2} aria-hidden="true" />
            Sede: {item.venue}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
