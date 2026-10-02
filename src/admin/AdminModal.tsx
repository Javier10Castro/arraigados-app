import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import s from './AdminModal.module.css';

/**
 * Modal del panel de Admin (mismo lenguaje que el modal de canje de Staff).
 * Se monta en <body> para quedar por encima de la barra inferior del celular.
 */
export default function AdminModal({
  title,
  onClose,
  busy = false,
  children,
}: {
  title: string;
  onClose: () => void;
  /** Mientras es true no se puede cerrar (evita cortar un guardado a la mitad). */
  busy?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, busy]);

  return createPortal(
    <div className={s.backdrop} onClick={() => !busy && onClose()}>
      <div
        ref={ref}
        className={s.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={s.close} aria-label="Cerrar" onClick={onClose} disabled={busy}>
          <X size={18} strokeWidth={2.4} />
        </button>
        <h2 className={s.title}>{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
