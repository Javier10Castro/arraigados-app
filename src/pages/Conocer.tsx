import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Check, MapPin, QrCode, ScanLine, UserRoundPen } from 'lucide-react';
import Ambient from '../components/Ambient';
import Button from '../components/Button';
import RingsMark from '../components/RingsMark';
import Wordmark from '../components/Wordmark';
import { eventInfo, formatPrice, packageItems, packagesPreview } from '../data/app';
import { api } from '../lib/api';
import type { PackageSummary } from '../../shared/api';
import styles from './Conocer.module.css';

const steps = [
  {
    Icon: QrCode,
    title: 'Recibe tu pulsera',
    text: 'Cada pulsera trae un código QR único, ligado al kit que elegiste.',
  },
  {
    Icon: ScanLine,
    title: 'Escanea el QR',
    text: 'Con la cámara de tu celular. Si no se puede escanear, pide ayuda al Staff.',
  },
  {
    Icon: UserRoundPen,
    title: 'La primera vez, regístrate',
    text: 'Nombre, iglesia y rango de edad. Tu presbiterio y zona se asignan solos.',
  },
  {
    Icon: Check,
    title: 'Después, entras directo',
    text: 'Vuelve a escanear tu pulsera y llegas a tu inicio: programa, kit y beneficios.',
  },
];

export default function Conocer() {
  const navigate = useNavigate();
  // Precio y aguas frescas reales de Neon; mientras carga (o si falla), el respaldo.
  const [packages, setPackages] = useState<PackageSummary[]>(packagesPreview);
  useEffect(() => {
    api
      .packages()
      .then((list) => list.length > 0 && setPackages(list))
      .catch(() => {});
  }, []);

  return (
    <div className={`page-enter ${styles.screen}`}>
      <Ambient variant="dark" />

      <header className={styles.header}>
        <button type="button" className={styles.back} aria-label="Volver" onClick={() => navigate('/')}>
          <ArrowLeft size={20} strokeWidth={2.2} />
        </button>
        <div className={styles.brand}>
          <Wordmark className={styles.mark} variant="cream" />
          <span className={styles.brandLabel}>Congreso 2K26</span>
        </div>
        <span className={styles.spacer} />
      </header>

      <main className={styles.body}>
        <section className={styles.hero}>
          <img
            className={styles.verseArt}
            src="/rcs/svg_editables/Cita_Beige.svg"
            alt="Por tanto, de la manera que habéis recibido al Señor Jesucristo, andad en él; arraigados y sobreedificados en él, y confirmados en la fe, así como habéis sido enseñados, abundando en acciones de gracias. Colosenses 2:6-7"
            width="1438"
            height="269"
            draggable={false}
          />
        </section>

        <section className={styles.facts} aria-label="Datos del congreso">
          <div className={styles.fact}>
            <CalendarDays size={18} strokeWidth={2} aria-hidden="true" />
            <div>
              <strong>{eventInfo.dates}</strong>
              <span>{eventInfo.datesDetail}</span>
            </div>
          </div>
          <div className={styles.fact}>
            <MapPin size={18} strokeWidth={2} aria-hidden="true" />
            <div>
              <strong>{eventInfo.venues}</strong>
              <span>{eventInfo.city}</span>
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <h2 className="label">Kits</h2>
          <ul className={styles.packages}>
            {packages.map((p) => (
              <li key={p.name} className={styles.package}>
                <div className={styles.packageHead}>
                  <span className={styles.packageCode}>{p.name}</span>
                  <span className={styles.packagePrice}>{formatPrice(p.price)}</span>
                </div>
                <ul className={styles.includes}>
                  {packageItems(p).map((item) => (
                    <li key={item}>
                      <span className={styles.check} aria-hidden="true">
                        <Check size={10} strokeWidth={3.4} />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.panel}>
          <h2 className="label">Cómo funciona tu pulsera</h2>
          <ol className={styles.steps}>
            {steps.map(({ Icon, title, text }) => (
              <li key={title} className={styles.step}>
                <span className={styles.stepIcon} aria-hidden="true">
                  <Icon size={18} strokeWidth={2} />
                </span>
                <div>
                  <strong>{title}</strong>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className={styles.cta}>
          <Button block onClick={() => navigate('/registro')}>
            Mi registro
          </Button>
        </div>

        <RingsMark className={styles.rings} />
      </main>
    </div>
  );
}
