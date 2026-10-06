import { useLayoutEffect, useRef, useState } from 'react';
import { Heart, Plus } from 'lucide-react';
import styles from './NoteBubble.module.css';

/**
 * Burbuja de Nota del carrusel (5 oct 2026): chica, centrada sobre el avatar, al
 * estilo de las Notas de Instagram. La misma pieza sirve para la nota propia
 * (botón: abre el panel) y para las de los demás (solo lectura).
 *
 * Variantes: filled (con texto) · invite (tu avatar sin nota) · muted (error) · loading.
 * No sabe nada de red.
 */
/**
 * Reparte el texto en DOS líneas parejas (cortando por palabras): "Honra a tu madre"
 * -> "Honra a" / "tu madre". Una sola palabra, o un texto muy corto, queda en una línea.
 */
export function splitLines(text: string): string[] {
  const t = text.trim().replace(/\s+/g, ' ');
  const words = t.split(' ');
  if (words.length < 2 || t.length < 9) return [t];
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const diff = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

type Props = {
  variant: 'filled' | 'invite' | 'muted' | 'loading';
  text?: string;
  /** Si viene, la burbuja es un botón (la nota propia). */
  onClick?: () => void;
  label?: string;
  /** Likes de la nota: pastilla con corazón y número pegada a la esquina de la burbuja (como Instagram). */
  likes?: number;
  /** Nota de OTRA persona que ya te gustó: solo el corazón, sin número (el total es del dueño). */
  liked?: boolean;
};

/**
 * Texto de la burbuja que SE ADAPTA al ancho real:
 *   1) cabe en una línea  -> una sola línea (burbuja baja);
 *   2) no cabe            -> dos líneas parejas (`splitLines`);
 *   3) aun así una línea se pasa -> dos líneas con letra un poco más chica (`tight`), para no cortar con "…".
 * Se mide en el navegador (useLayoutEffect) y se vuelve a medir si cambia el ancho o cargan las fuentes.
 */
type Fit = 'one' | 'two' | 'tight';
function BubbleText({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState<Fit>('one');
  const [epoch, setEpoch] = useState(0); // sube cuando hay que volver a medir desde cero

  const keyRef = useRef('');
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let width = el.getBoundingClientRect().width;
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width;
      if (Math.abs(w - width) > 1) {
        width = w;
        setEpoch((n) => n + 1);
      }
    });
    ro?.observe(el);
    let alive = true;
    document.fonts?.ready.then(() => alive && setEpoch((n) => n + 1)).catch(() => {});
    return () => {
      alive = false;
      ro?.disconnect();
    };
  }, []);

  // Medición. Si cambió el texto, el ancho o las fuentes se vuelve a empezar desde una sola línea;
  // si no, y una línea se sale del ancho, se pasa al siguiente modo (one -> two -> tight).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const key = `${text}|${epoch}`;
    if (keyRef.current !== key) {
      keyRef.current = key;
      if (fit !== 'one') {
        setFit('one');
        return;
      }
    }
    const lines = Array.from(el.children) as HTMLElement[];
    const over = lines.some((l) => l.scrollWidth > l.clientWidth + 0.5);
    if (!over) return;
    setFit((f) => (f === 'one' ? 'two' : f === 'two' ? 'tight' : f));
  }, [fit, text, epoch]);

  const lines = fit === 'one' ? [text.trim().replace(/\s+/g, ' ')] : splitLines(text);
  return (
    <span className={`${styles.text}${fit === 'tight' ? ` ${styles.tight}` : ''}`} ref={ref}>
      {lines.map((line, i) => (
        <span className={styles.line} key={i}>{line}</span>
      ))}
    </span>
  );
}

export default function NoteBubble({ variant, text, onClick, label, likes, liked }: Props) {
  if (variant === 'loading') return <span className={`${styles.bubble} ${styles.skeleton}`} aria-hidden="true" />;

  const content = (
    <>
      {variant === 'invite' && <Plus size={13} strokeWidth={2.8} aria-hidden="true" />}
      <BubbleText text={text ?? ''} />
      {variant === 'filled' && !likes && liked ? (
        <span className={`${styles.likes} ${styles.likesOnly}`} aria-label="Te gusta">
          <Heart size={11} fill="currentColor" strokeWidth={0} aria-hidden="true" />
        </span>
      ) : null}
      {variant === 'filled' && likes ? (
        <span className={styles.likes} aria-label={`${likes} me gusta`}>
          <Heart size={11} fill="currentColor" strokeWidth={0} aria-hidden="true" />
          {likes}
        </span>
      ) : null}
    </>
  );
  const cls = `${styles.bubble} ${styles[variant]}`;

  return onClick ? (
    <button type="button" className={cls} onClick={onClick} aria-label={label}>
      {content}
    </button>
  ) : (
    <span className={cls}>{content}</span>
  );
}
