import { useState } from 'react';
import type { ReactNode } from 'react';
import Button from '../components/Button';
import AdminModal from './AdminModal';
import s from './Usuarios.module.css';

/**
 * Confirmación "escribe la palabra" para acciones que NO se pueden deshacer (borrar un lote,
 * vaciar la bitácora). El botón queda deshabilitado hasta que lo escrito coincide.
 * La palabra también la valida el servidor.
 */
export default function ConfirmTypeModal({
  title,
  word,
  actionLabel,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  /** Texto exacto que hay que escribir. */
  word: string;
  actionLabel: string;
  /** Debe lanzar Error con mensaje legible si falla. */
  onConfirm: () => Promise<void>;
  onClose: () => void;
  children: ReactNode;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
  const ok = norm(text) === norm(word);

  const go = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar.');
      setBusy(false);
    }
  };

  return (
    <AdminModal title={title} onClose={onClose} busy={busy}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}
        style={{ display: 'grid', gap: 12, minWidth: 0 }}
      >
        <div style={{ fontSize: 14, lineHeight: 1.5 }}>{children}</div>
        <label style={{ display: 'grid', gap: 6, fontSize: 13.5, fontWeight: 700 }}>
          Para confirmar, escribe: <strong style={{ userSelect: 'all' }}>{word}</strong>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(0,0,0,.25)', font: 'inherit', width: '100%', boxSizing: 'border-box', minWidth: 0 }}
          />
        </label>
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <div className={s.actions} style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr)' }}>
          <Button type="button" variant="outline" style={{ minWidth: 0, whiteSpace: 'normal' }} onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" variant="outline" className={s.dangerBtn} style={{ minWidth: 0, whiteSpace: 'normal' }} disabled={!ok || busy}>
            {busy ? 'Borrando…' : actionLabel}
          </Button>
        </div>
      </form>
    </AdminModal>
  );
}
