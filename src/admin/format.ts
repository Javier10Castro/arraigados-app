import type { BatchStatus, PulseStatus } from '../../shared/api';

/** Centavos de MXN -> "$150". */
export const money = (cents: number) =>
  `$${(cents / 100).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/**
 * Fecha corta para el panel: "1 oct, 22:26". Sin año (todo es 2026) y en 24 h,
 * para que no ocupe tanto texto.
 */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', '');
  const time = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day}, ${time}`;
}

export const BATCH_STATUS_LABEL: Record<BatchStatus, string> = {
  ABIERTO: 'Abierto',
  CERRADO: 'Cerrado',
  CANCELADO: 'Cancelado',
};

export const PULSE_STATUS_LABEL: Record<PulseStatus, string> = {
  UNCLAIMED: 'Sin reclamar',
  ACTIVE: 'Reclamado',
  INVALIDATED: 'Deshabilitado',
};
