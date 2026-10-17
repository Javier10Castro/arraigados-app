import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { WalletDiagnosticsResponse } from '../../shared/api';
import c from './SelfRedeemPanel.module.css';

/**
 * Admin -> Configuración: estado de la credencial digital (Apple / Google Wallet).
 * Solo lee GET /api/wallet/diagnostics (ADMIN): muestra QUÉ variables de entorno faltan (nombres), nunca valores.
 * No configura nada: las variables se cargan en el panel del hosting, no desde esta pantalla.
 */
type Part = WalletDiagnosticsResponse['qr'];

function Row({ title, part, hint }: { title: string; part: Part; hint: string }) {
  return (
    <li className={c.row}>
      <div className={c.label}>
        <strong>{title}</strong>
        {part.ok ? (
          <span>Configurado.</span>
        ) : (
          <span>
            {part.issue ? `${part.issue}. ` : ''}
            {part.missing.length ? `Faltan: ${part.missing.join(', ')}. ` : ''}
            {hint}
          </span>
        )}
      </div>
      <span className={`${c.effective} ${part.ok ? c.yes : c.no}`}>{part.ok ? 'Listo' : 'No disponible'}</span>
    </li>
  );
}

export default function WalletPanel() {
  const [data, setData] = useState<WalletDiagnosticsResponse | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    api
      .walletDiagnostics()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'No se pudo consultar el estado de Wallet.'));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <section className={c.card} aria-label="Credencial digital">
      <div className={c.head}>
        <h2 className={c.title}>Credencial digital (Wallet)</h2>
        <p className={c.sub}>
          Mientras una plataforma no esté lista, el botón «Agregar a Wallet» no aparece (no se simula). Aquí solo se muestran los
          nombres de las variables que faltan; sus valores nunca salen del servidor.
        </p>
      </div>
      {error && <p className={c.error} role="alert">{error}</p>}
      {!data && !error && <p className={c.sub}>Consultando…</p>}
      {data && (
        <ul className={c.users}>
          <Row title="Firma de códigos QR" part={data.qr} hint="Sin esto no se emite ninguna credencial." />
          <Row title="Apple Wallet" part={data.apple} hint="Requiere cuenta de Apple Developer (Pass Type ID y certificado)." />
          <Row title="Google Wallet" part={data.google} hint="Requiere emisor de Google Wallet y cuenta de servicio." />
        </ul>
      )}
    </section>
  );
}
