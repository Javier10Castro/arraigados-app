import { useEffect, useRef, useState } from 'react';
import { Search, UserPlus } from 'lucide-react';
import AdminModal from './AdminModal';
import { api } from '../lib/api';
import type { AdminRaffleEntriesResponse, RaffleCandidate } from '../../shared/api';
import c from './Rifas.module.css';

/**
 * «Agregar persona» (Admin → Rifas → Inscritos, migración 019): busca asistentes registrados por nombre o iglesia y los
 * agrega a la rifa del kit de SU pulsera activa. El kit lo decide el servidor; aquí solo se muestra.
 */
export default function AddRaffleEntryModal({
  onAdded,
  onClose,
}: {
  onAdded: (data: AdminRaffleEntriesResponse, who: RaffleCandidate) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<RaffleCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); return undefined; }
    const my = ++seq.current;
    const t = window.setTimeout(() => {
      setLoading(true);
      api.raffleCandidates(term)
        .then((r) => { if (my === seq.current) { setResults(r); setError(''); } })
        .catch((e: Error) => { if (my === seq.current) setError(e.message); })
        .finally(() => { if (my === seq.current) setLoading(false); });
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const add = async (who: RaffleCandidate) => {
    setBusyId(who.attendeeId);
    setError('');
    try {
      const data = await api.addRaffleEntry({ attendeeId: who.attendeeId });
      setAdded((a) => [...a, who.attendeeId]);
      setResults((rs) => rs?.map((r) => (r.attendeeId === who.attendeeId ? { ...r, status: 'entered' } : r)) ?? rs);
      onAdded(data, who);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const label: Record<Exclude<RaffleCandidate['status'], 'available'>, string> = {
    entered: 'Ya está en la rifa',
    removed: 'Fue quitado · usa «Restaurar»',
    no_raffle: 'Su kit no tiene rifa',
  };

  return (
    <AdminModal title="Agregar persona a la rifa" onClose={onClose} busy={busyId !== null}>
      <div className={c.addWrap}>
        <p className={c.note}>
          Busca entre los asistentes registrados. Se agrega a la rifa del <strong>kit de su pulsera</strong>, sin respuestas, aunque las inscripciones estén cerradas.
        </p>
        <label className={c.addSearch}>
          <Search size={16} strokeWidth={2.4} aria-hidden="true" />
          <input autoFocus type="search" placeholder="Nombre o iglesia (mínimo 2 letras)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar asistente" />
        </label>
        {error && <p className={c.bad} role="alert">{error}</p>}
        {loading && <p className={c.note}>Buscando…</p>}
        {results && !loading && results.length === 0 && <p className={c.note}>No encontré asistentes con pulsera activa con «{q.trim()}».</p>}
        {results && results.length > 0 && (
          <ul className={c.addList}>
            {results.map((r) => (
              <li key={r.attendeeId}>
                <span className={c.addWho}>
                  <strong>{r.fullName}</strong>
                  <span>{r.churchName || 'Sin iglesia'}</span>
                </span>
                <span className={c.addKit}>{r.kitName}</span>
                {r.status === 'available' ? (
                  <button type="button" className={c.spin} disabled={busyId !== null} onClick={() => void add(r)}>
                    <UserPlus size={15} strokeWidth={2.4} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                    {busyId === r.attendeeId ? 'Agregando…' : 'Agregar'}
                  </button>
                ) : (
                  <span className={added.includes(r.attendeeId) ? c.addDone : c.addState}>{added.includes(r.attendeeId) ? '✓ Agregado' : label[r.status]}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminModal>
  );
}
