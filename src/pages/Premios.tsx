import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PRIZES } from '../data/rafflePrizes';
import s from './Premios.module.css';

/**
 * /premios — pantalla PÚBLICA con los premios de la rifa (uno por kit), pensada para el proyector o la pantalla grande.
 * Mismo fondo y tipografía que el proyector de la rifa (/rifa/:id). Sin datos de nadie: solo los premios.
 */
export default function Premios() {
  const navigate = useNavigate();
  const canGoBack = typeof window !== 'undefined' && window.history.length > 1;
  return (
    <main className={s.page}>
      {canGoBack && (
        <button type="button" className={s.back} aria-label="Volver" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} strokeWidth={2.2} />
        </button>
      )}
      <header className={s.top}>
        <p className={s.kicker}>Arraigados 2K26</p>
        <h1 className={s.title}>Premios de la rifa</h1>
        <p className={s.sub}>Un premio por kit · participan quienes respondieron las 3 preguntas en la app</p>
      </header>
      <ul className={s.grid}>
        {PRIZES.map((p, i) => (
          <li key={p.key} className={s.card} style={{ animationDelay: `${0.12 * i}s` }}>
            <span className={s.label}>{p.label}</span>
            <div className={`${s.art} ${s[`art_${p.key}`]}`}>
              <img src={p.image.src} width={p.image.width} height={p.image.height} alt={p.title} draggable={false} />
            </div>
            <strong className={s.prize}>{p.title}</strong>
            {p.detail && <span className={s.detail}>{p.detail}</span>}
          </li>
        ))}
      </ul>
    </main>
  );
}
