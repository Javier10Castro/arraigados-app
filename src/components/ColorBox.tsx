import { useRef } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import styles from './ColorBox.module.css';

/**
 * Recuadro de color: se arrastra un punto sobre una cuadrícula.
 *   horizontal = color (tono 0-359)
 *   vertical   = matiz, en `rows` franjas (con 1 sola fila solo se elige el color)
 * Táctil, mouse y teclado (flechas ←→ cambian el color, ↑↓ el matiz; Shift = salto grande).
 * `bg(hue, row)` devuelve el color real que se verá, así lo que se ve en el recuadro es lo que queda.
 */
type Props = {
  hue: number;
  row: number;
  rows: number;
  bg: (hue: number, row: number) => string;
  onChange: (hue: number, row: number) => void;
  label: string;
  /** Texto para lectores de pantalla de la franja actual (ej. «Vivo»). */
  rowLabel?: string;
  height?: number;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export default function ColorBox({ hue, row, rows, bg, onChange, label, rowLabel, height = 168 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || !box.width || !box.height) return;
    const x = clamp((e.clientX - box.left) / box.width, 0, 1);
    const y = clamp((e.clientY - box.top) / box.height, 0, 0.9999);
    onChange(Math.round(x * 359), Math.floor(y * rows));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 30 : 6;
    if (e.key === 'ArrowLeft') onChange(clamp(hue - step, 0, 359), row);
    else if (e.key === 'ArrowRight') onChange(clamp(hue + step, 0, 359), row);
    else if (e.key === 'ArrowUp') onChange(hue, clamp(row - 1, 0, rows - 1));
    else if (e.key === 'ArrowDown') onChange(hue, clamp(row + 1, 0, rows - 1));
    else return;
    e.preventDefault();
  };

  const rowStyles = Array.from({ length: rows }, (_, r) => ({
    background: `linear-gradient(90deg, ${Array.from({ length: 13 }, (_, i) => bg(Math.min(i * 30, 359), r)).join(', ')})`,
  }));

  return (
    <div
      ref={ref}
      className={styles.box}
      style={{ height }}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={hue}
      aria-valuetext={`${rowLabel ? `${rowLabel}, ` : ''}color ${hue}`}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        pick(e);
      }}
      onPointerMove={(e) => dragging.current && pick(e)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      {rowStyles.map((st, r) => (
        <div key={r} className={styles.row} style={st} />
      ))}
      <span
        className={styles.thumb}
        style={{ left: `${(hue / 359) * 100}%`, top: `${((row + 0.5) / rows) * 100}%`, background: bg(hue, row) }}
        aria-hidden="true"
      />
    </div>
  );
}
