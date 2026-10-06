import { useEffect } from 'react';
import { Check, CupSoda } from 'lucide-react';
import ScreenHeader from '../components/ScreenHeader';
import DrinkCups from '../components/DrinkCups';
import { DRINK_LABEL, formatPrice, packageContent } from '../data/app';
import { usePulseSession } from '../context/PulseSession';
import styles from './Beneficios.module.css';

/**
 * "Mi paquete" del asistente -- SOLO CONSULTA.
 * Paquete, precio y aguas frescas vienen de Neon; lo demás que incluye el
 * paquete es contenido fijo ligado al nombre (data/app.ts -> packageContent).
 * El canje lo hace únicamente Staff (Redemption.createdById).
 */
export default function Beneficios() {
  const { me, refresh } = usePulseSession();
  // Al abrir, trae el saldo actual (Staff pudo haber canjeado desde otro dispositivo).
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!me) return null; // RequireAttendee garantiza la sesión; esto solo satisface a TS.

  const { package: pkg, drinksUsed, drinksRemaining } = me;
  // Lista de la base (administrable en /admin/beneficios); si aún no existe, la fija de siempre.
  const items = pkg.benefits ?? packageContent[pkg.name] ?? [];

  return (
    <div className={`page-enter ${styles.page}`}>
      <ScreenHeader title="Mi kit" back="/home" />

      <div className={styles.packagePanel}>
        <section className={styles.priceCard}>
          <span className={styles.code}>{pkg.name}</span>
          <strong className={styles.price}>{formatPrice(pkg.price)}</strong>
        </section>

        <section className={styles.section}>
          <h2 className="label">Incluye</h2>
          {items.length > 0 ? (
            <ul className={styles.includes}>
              {items.map((item) => (
                <li key={item}>
                  <span className={styles.check} aria-hidden="true">
                    <Check size={13} strokeWidth={3.2} />
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>Pregunta al staff qué incluye tu kit.</p>
          )}
        </section>

        <section className={styles.section}>
          <h2 className="label">Aguas frescas</h2>
          {pkg.includedDrinks > 0 ? (
            <div className={styles.drinks}>
              <DrinkCups total={pkg.includedDrinks} used={drinksUsed} />
              <p className={styles.drinksCount}>
                <strong>{drinksRemaining}</strong> de {pkg.includedDrinks} disponibles
              </p>
              <p className={styles.muted}>
                <CupSoda size={14} strokeWidth={2.2} aria-hidden="true" /> Para canjear, muestra tu pulsera al staff.
                Cada vez que te entreguen una, aquí se marca como usada.
              </p>
            </div>
          ) : (
            <p className={styles.muted}>Tu kit no incluye {DRINK_LABEL}.</p>
          )}
        </section>
      </div>
    </div>
  );
}
