import { useState } from 'react';
import AdminShell from './AdminShell';
import { downloadFile } from '../lib/api';
import { useStaffSession } from '../context/StaffSession';
import c from './Rifas.module.css';

/**
 * Admin -> Secreto (solo cuenta propietaria). Tres botones: cada uno descarga un .txt con "Nombre - Iglesia" de los
 * asistentes con pulsera activa de ese kit. Solo lectura. El servidor vuelve a exigir que sea la cuenta propietaria.
 */
const KITS = [
  { id: 'a', label: 'Kit A' },
  { id: 'b', label: 'Kit B' },
  { id: 'especial', label: 'Kit Especial' },
] as const;

export default function Secreto() {
  const { user } = useStaffSession();
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const get = async (id: string, label: string) => {
    if (busy) return;
    setBusy(id);
    setMsg(null);
    try {
      await downloadFile(`/api/admin/secreto?kit=${id}`, 'text/plain', `lista-${id}.txt`);
      setMsg({ ok: true, text: `Descargaste la lista de ${label}.` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy('');
    }
  };

  return (
    <AdminShell title="Secreto">
      {!user?.isOwner ? (
        <p className={c.bad} role="alert">No tienes acceso a esta sección.</p>
      ) : (
        <section className={c.create} aria-label="Listas por kit">
          <p className={c.lead}>
            Descarga un .txt con <strong>Nombre - Iglesia</strong>, una línea por asistente con pulsera activa del kit, en orden alfabético.
          </p>
          <div className={c.actions}>
            {KITS.map((k) => (
              <button key={k.id} type="button" className={c.spin} disabled={busy !== ''} onClick={() => void get(k.id, k.label)}>
                {busy === k.id ? 'Generando…' : k.label}
              </button>
            ))}
          </div>
          {msg && <p className={msg.ok ? c.ok : c.bad} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
        </section>
      )}
    </AdminShell>
  );
}
