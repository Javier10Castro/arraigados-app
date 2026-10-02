import { MapPin } from 'lucide-react';
import Button from './Button';
import { VENUE_MAPS } from '../data/app';
import styles from './LocationButton.module.css';

/**
 * Botón "Obtener ubicación" (Google Maps) para una sede. Solo se dibuja si
 * `venue` tiene un enlace registrado en `VENUE_MAPS` (data/app.ts) -- p. ej.
 * "Ambas sedes" no tiene un único punto y no muestra botón.
 *
 * Reutiliza el componente `Button` existente (variante `href`, ver
 * Button.tsx) en vez de un `<a>` suelto, así conserva el estilo visual
 * actual. Abre en pestaña nueva (`target="_blank"` + `rel="noopener
 * noreferrer"`), como pidió Javier el 1 oct 2026.
 */
export default function LocationButton({ venue, size = 'sm' }: { venue: string; size?: 'md' | 'sm' }) {
  const url = VENUE_MAPS[venue];
  if (!url) return null;
  return (
    <Button
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      variant="outline"
      size={size}
      className={styles.btn}
      aria-label={`Obtener ubicación de ${venue} en Google Maps`}
    >
      <MapPin size={14} strokeWidth={2.2} aria-hidden="true" />
      Obtener ubicación
    </Button>
  );
}
