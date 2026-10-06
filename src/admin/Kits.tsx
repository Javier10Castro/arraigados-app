import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/Button';
import AdminShell from './AdminShell';
import { ListSkeleton } from '../components/Skeleton';
import { api } from '../lib/api';
import { money } from './format';
import type { AdminKitsResponse } from '../../shared/api';
import s from './Usuarios.module.css';
import k from './Kits.module.css';

/**
 * Admin → Kits (solo lectura). Los kits son fijos: aquí se revisan sus datos y sus números en vivo
 * (pulseras, aguas canjeadas, ingreso esperado). Lo que incluye cada uno se edita en Beneficios.
 */
export default function KitsAdmin() {
  const [data, setData] = useState<AdminKitsResponse | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    api.adminKits().then(setData).catch((e: Error) => setError(e.message));
  };
  useEffect(load, []);

  return (
    <AdminShell title="Kits">
      {error && (
        <div className={s.notice} role="alert">
          <p>{error}</p>
          <Button size="sm" variant="outline" onClick={load}>
            Reintentar
          </Button>
        </div>
      )}
      {!data && !error && <ListSkeleton />}
      {data && (
        <>
          <p className={k.totals}>
            <span>
              <strong>{data.totals.total.toLocaleString('es-MX')}</strong> pulseras impresas
            </span>
            <span>
              <strong>{data.totals.active.toLocaleString('es-MX')}</strong> reclamadas
            </span>
            <span>
              Ingreso esperado: <strong>{money(data.totals.expectedIncome)}</strong>
            </span>
          </p>
          <div className={k.grid}>
            {data.kits.map((kit) => {
              const pct = kit.drinks.included ? Math.round((kit.drinks.used / kit.drinks.included) * 100) : 0;
              return (
                <article key={kit.id} className={k.card}>
                  <div className={k.head}>
                    <h2 className={k.name}>{kit.name}</h2>
                    <span className={k.price}>{money(kit.price)}</span>
                    {!kit.active && <span className={k.off}>Inactivo</span>}
                  </div>
                  <p className={k.meta}>
                    {kit.includedDrinks === 0
                      ? 'No incluye aguas frescas.'
                      : `Incluye ${kit.includedDrinks} ${kit.includedDrinks === 1 ? 'agua fresca' : 'aguas frescas'}.`}
                  </p>

                  <dl className={k.stats}>
                    <div className={k.stat}>
                      <dt>Impresas</dt>
                      <dd>{kit.pulses.total}</dd>
                    </div>
                    <div className={k.stat}>
                      <dt>Sin reclamar</dt>
                      <dd>{kit.pulses.unclaimed}</dd>
                    </div>
                    <div className={k.stat}>
                      <dt>Reclamadas</dt>
                      <dd>{kit.pulses.active}</dd>
                    </div>
                    <div className={k.stat}>
                      <dt>Deshabilitadas</dt>
                      <dd>{kit.pulses.invalidated}</dd>
                    </div>
                  </dl>

                  {kit.includedDrinks > 0 && (
                    <div>
                      <div className={k.bar} role="img" aria-label={`${pct}% de las aguas incluidas canjeadas`}>
                        <span style={{ width: `${pct}%` }} />
                      </div>
                      <p className={k.barText}>
                        Aguas canjeadas: <strong>{kit.drinks.used}</strong> de {kit.drinks.included} ({pct}%)
                      </p>
                    </div>
                  )}
                  <p className={k.barText}>
                    Ingreso esperado (reclamadas): <strong>{money(kit.expectedIncome)}</strong>
                  </p>

                  <h3 className={k.sub}>Incluye</h3>
                  {kit.benefits.length ? (
                    <ul className={k.list}>
                      {kit.benefits.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className={k.none}>Sin beneficios cargados.</p>
                  )}
                </article>
              );
            })}
          </div>
          <p className={k.totals}>
            <span>
              Para cambiar lo que incluye cada kit usa{' '}
              <Link to="/admin/beneficios" className={k.link}>
                Beneficios
              </Link>
              . El nombre, precio y aguas de los kits son fijos.
            </span>
          </p>
        </>
      )}
    </AdminShell>
  );
}
