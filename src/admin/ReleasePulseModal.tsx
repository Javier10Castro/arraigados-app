import { useState } from 'react';
import Button from '../components/Button';
import AdminModal from './AdminModal';
import { api } from '../lib/api';

/**
 * HERRAMIENTA DE PRUEBAS (solo cuenta dueña): confirma y desvincula la pulsera de su asistente
 * dejándola como recién creada. No queda en la bitácora.
 */
export default function ReleasePulseModal({
  pulseId,
  label,
  who,
  onClose,
  onDone,
}: {
  pulseId: string;
  /** Texto corto de la pulsera, ej. "#3" o su código. */
  label: string;
  /** Nombre del asistente vinculado. */
  who: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async () => {
    setBusy(true);
    setError('');
    try {
      await api.releasePulse(pulseId);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo desvincular.');
      setBusy(false);
    }
  };
  return (
    <AdminModal title="Desvincular pulsera" onClose={onClose} busy={busy}>
      <p style={{ margin: 0 }}>
        La pulsera <strong>{label}</strong> volverá a quedar como recién creada (sin dueño, lista para registrarse de nuevo).
      </p>
      <p style={{ margin: '8px 0 0' }}>
        Se elimina a <strong>{who}</strong> con sus canjes, notas y likes. <strong>No se puede deshacer</strong> ni queda en la bitácora.
      </p>
      {error && (
        <p role="alert" style={{ color: '#b3261e', margin: '10px 0 0' }}>
          {error}
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 16 }}>
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button onClick={() => void go()} disabled={busy}>
          {busy ? 'Desvinculando…' : 'Desvincular'}
        </Button>
      </div>
    </AdminModal>
  );
}
