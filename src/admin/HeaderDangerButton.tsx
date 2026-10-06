import { Trash2, type LucideIcon } from 'lucide-react';
import s from './HeaderDangerButton.module.css';

/**
 * Botón de acción destructiva para la cabecera de una pantalla del panel (slot `action` de AdminShell):
 * pegado al extremo derecho, centrado en la altura del título. En celular solo el ícono; desde 560px, ícono + texto.
 */
export default function HeaderDangerButton({ label, onClick, icon: Icon = Trash2 }: { label: string; onClick: () => void; icon?: LucideIcon }) {
  return (
    <button type="button" className={s.btn} onClick={onClick} aria-label={label}>
      <Icon size={17} aria-hidden="true" />
      <span className={s.text}>{label}</span>
    </button>
  );
}
