import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminShell from './AdminShell';
import { api } from '../lib/api';
import type { DiscountRole, DiscountType, TeamDiscountSummary } from '../../shared/api';
import c from './Descuentos.module.css';

/**
 * Admin -> Descuentos del equipo (se llega desde el Dashboard). SIMULACIÓN: no cobra ni cambia precios.
 * Cualquier Admin ve los números; solo las cuentas autorizadas (el servidor lo decide con la sesión y lo
 * manda en `canEdit`) pueden guardar. Aunque alguien forzara los controles, el servidor responde 403.
 */
const money = (cents: number) =>
  (cents / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 2 });

const ROLE_TITLE: Record<DiscountRole, string> = { STAFF: 'Staff', ADMIN: 'Admin' };

function RuleEditor({ role, data, onSaved }: { role: DiscountRole; data: TeamDiscountSummary; onSaved: (d: TeamDiscountSummary) => void }) {
  const rule = data.rules[role];
  const [type, setType] = useState<DiscountType>(rule.type);
  const [text, setText] = useState(String(rule.amount));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const editable = data.canEdit && data.configAvailable;

  useEffect(() => {
    setType(rule.type);
    setText(String(rule.amount));
  }, [rule.type, rule.amount]);

  const parsed = text.trim() === '' ? NaN : Number(text.replace(',', '.'));
  const problem = (() => {
    if (!Number.isFinite(parsed)) return 'Escribe un número.';
    if (parsed < 0) return 'No puede ser negativo.';
    if (Math.abs(parsed * 100 - Math.round(parsed * 100)) > 1e-6) return 'Máximo 2 decimales.';
    if (type === 'percent' && parsed > 100) return 'Máximo 100 %.';
    if (type === 'fixed' && parsed > 100000) return 'Máximo $100,000.';
    return '';
  })();
  const dirty = type !== rule.type || parsed !== rule.amount;

  const save = async () => {
    if (problem || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      onSaved(await api.updateTeamDiscount({ role, type, amount: parsed }));
      setMsg({ ok: true, text: 'Guardado.' });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={c.rule} aria-label={`Descuento ${ROLE_TITLE[role]}`}>
      <div className={c.ruleHead}>
        <h3 className={c.ruleTitle}>{ROLE_TITLE[role]}</h3>
        <span className={rule.active ? c.on : c.off}>
          {rule.active ? `Activo · ${rule.type === 'percent' ? `${rule.amount} %` : money(rule.amount * 100)}` : 'Sin descuento (0)'}
        </span>
      </div>
      <div className={c.seg} role="radiogroup" aria-label={`Tipo de descuento ${ROLE_TITLE[role]}`}>
        {(['percent', 'fixed'] as const).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={type === t} disabled={!editable || busy}
            className={type === t ? c.segOn : c.segBtn} onClick={() => setType(t)}>
            {t === 'percent' ? 'Porcentaje (%)' : 'Monto fijo (MXN)'}
          </button>
        ))}
      </div>
      <label className={c.field}>
        <span>{type === 'percent' ? 'Porcentaje de descuento' : 'Descuento en pesos MXN'}</span>
        <input inputMode="decimal" value={text} disabled={!editable || busy} onChange={(e) => setText(e.target.value)} aria-invalid={!!problem} />
      </label>
      {problem && <p className={c.bad}>{problem}</p>}
      {editable ? (
        <button type="button" className={c.save} disabled={!!problem || !dirty || busy} onClick={save}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      ) : (
        <p className={c.hint}>{data.configAvailable ? 'Solo lectura: tu cuenta no puede modificar los descuentos.' : 'Pendiente de la migración 013.'}</p>
      )}
      {msg && <p className={msg.ok ? c.ok : c.bad} role="status">{msg.text}</p>}
    </section>
  );
}

export default function Descuentos() {
  const [data, setData] = useState<TeamDiscountSummary | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    api.teamDiscounts().then((d) => { setData(d); setError(''); }).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  return (
    <AdminShell title="Descuentos del equipo">
      <p className={c.back}><Link to="/admin/dashboard">← Volver al Dashboard</Link></p>
      <p className={c.lead}>
        Esto es una <strong>simulación</strong>: compara el ingreso de referencia de los asistentes con lo que sería el equipo si tuviera descuento.
        No se cobra nada, no cambia ningún precio ni canje.
      </p>
      {error && <p className={c.bad} role="alert">{error}</p>}
      {!data && !error && <p className={c.hint}>Cargando…</p>}
      {data && (
        <>
          {!data.configAvailable && <p className={c.warn}>La configuración de descuentos aún no está habilitada en esta base (migración 013). Se muestran valores en 0.</p>}
          {!data.teamAvailable && <p className={c.warn}>Aún no existen las pulseras del equipo en esta base (migración 012): el equipo cuenta 0.</p>}
          <div className={c.rules}>
            <RuleEditor role="STAFF" data={data} onSaved={setData} />
            <RuleEditor role="ADMIN" data={data} onSaved={setData} />
          </div>

          <h2 className={c.h2}>Resumen simulado</h2>
          <dl className={c.kpis}>
            <div><dt>Asistentes considerados</dt><dd>{data.totals.attendees}</dd></div>
            <div><dt>Equipo con pulsera vinculada</dt><dd>{data.totals.team} <small>({data.totals.staff} Staff · {data.totals.admin} Admin)</small></dd></div>
            <div><dt>Ingreso de referencia · asistentes</dt><dd>{money(data.totals.attendeeRevenueCents)}</dd></div>
            <div><dt>Ingreso simulado · equipo</dt><dd>{money(data.totals.teamSimulatedCents)}</dd></div>
            <div><dt>Descuentos simulados</dt><dd>{money(data.totals.discountCents)}</dd></div>
            <div className={c.total}><dt>Ingreso simulado combinado</dt><dd>{money(data.totals.combinedCents)}</dd></div>
          </dl>
          <p className={c.hint}>
            «Referencia» = lo que corresponde a los asistentes al precio normal del kit. «Simulado» = lo que pagaría el equipo con el descuento configurado.
            Ninguno es un cobro real.
          </p>

          <h2 className={c.h2}>Por kit</h2>
          <div className={c.tableWrap}>
            <table className={c.table}>
              <thead>
                <tr><th>Kit</th><th>Precio normal</th><th>Asistentes</th><th>Staff</th><th>Admin</th><th>Referencia asistentes</th><th>Equipo simulado</th><th>Descuentos</th><th>Combinado</th></tr>
              </thead>
              <tbody>
                {data.byKit.map((k) => (
                  <tr key={k.packageId}>
                    <th scope="row">{k.name}</th><td>{money(k.priceCents)}</td><td>{k.attendees}</td><td>{k.staff}</td><td>{k.admin}</td>
                    <td>{money(k.attendeeRevenueCents)}</td><td>{money(k.teamSimulatedCents)}</td><td>{money(k.discountCents)}</td><td>{money(k.combinedCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AdminShell>
  );
}
