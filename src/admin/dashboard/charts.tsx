import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { fmtInt, fmtPct } from './format';
import c from './charts.module.css';

/**
 * Gráficas del Dashboard, hechas con HTML/CSS/SVG propios (sin librería):
 * el proyecto no tenía ninguna y estas formas (barras, columnas, dona,
 * medidor) no la justifican. Reglas que siguen todas (skill de dataviz):
 * - Marcas delgadas, puntas redondeadas de 4px, 2px de separación entre segmentos.
 * - El texto usa los colores de texto, nunca el de la serie.
 * - Cada marca tiene tooltip al pasar el cursor/foco y el valor visible o en
 *   una tabla para lectores de pantalla (nunca solo color).
 * - Una serie = sin leyenda (el título la nombra). Colores de kit fijos por
 *   kit (orden de precio), nunca por posición en el ranking.
 */

/** Paleta categórica validada (scripts/validate_palette.js, superficie crema #f2f7d7 y blanco). */
export const SERIES = {
  primary: '#5b2bd6', // morado (registros)
  drinks: '#1d8a66', // verde (aguas / canjes)
} as const;
const KIT_PALETTE = ['#5b2bd6', '#b8740c', '#1d8a66'];
const KIT_OTHER = '#8a8496';
/** Color de un kit según su posición en la lista de kits ordenada por precio (fija). */
export const kitColor = (index: number) => KIT_PALETTE[index] ?? KIT_OTHER;

/* ------------------------------------------------------------------ */

export type BarItem = { id: string; label: ReactNode; sub?: ReactNode; value: number; href?: string; lead?: ReactNode; tip?: string };

/** Barras horizontales con etiqueta y valor directo. Clic opcional (href). */
export function BarList({
  items,
  color = SERIES.primary,
  total,
  empty = 'Sin datos todavía.',
  ranked = false,
  label,
}: {
  items: BarItem[];
  color?: string;
  /** Si se da, muestra el % de cada barra respecto a este total. */
  total?: number;
  empty?: string;
  /** Muestra 01, 02, 03… antes de cada fila. */
  ranked?: boolean;
  label: string;
}) {
  if (!items.length || items.every((i) => i.value === 0)) return <p className={c.empty}>{empty}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ol className={c.barList} aria-label={label}>
      {items.map((item, i) => {
        const pct = total ? fmtPct(item.value, total) : null;
        const body = (
          <>
            {ranked && <span className={c.rank}>{String(i + 1).padStart(2, '0')}</span>}
            {item.lead}
            <span className={c.barMain}>
              <span className={c.barHead}>
                <span className={c.barLabel}>{item.label}</span>
                <span className={c.barValue}>
                  {fmtInt(item.value)}
                  {pct && <em> · {pct}</em>}
                </span>
              </span>
              {item.sub && <span className={c.barSub}>{item.sub}</span>}
              <span className={c.track} aria-hidden="true">
                <span className={c.fill} style={{ width: `${(item.value / max) * 100}%`, background: color }} />
              </span>
            </span>
          </>
        );
        return (
          <li key={item.id} title={item.tip}>
            {item.href ? (
              <Link to={item.href} className={`${c.barRow} ${c.barLink}`}>
                {body}
              </Link>
            ) : (
              <div className={c.barRow}>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ */

export type Column = { key: string; label: string; value: number; tip: string; muted?: boolean };

/**
 * Columnas verticales (por día / por hora). Etiquetas del eje cada `labelEvery`
 * columnas; el valor exacto está en el tooltip y en la tabla oculta.
 */
export function Columns({
  data,
  color = SERIES.primary,
  height = 150,
  labelEvery = 1,
  label,
  empty = 'Sin datos todavía.',
}: {
  data: Column[];
  color?: string;
  height?: number;
  labelEvery?: number;
  label: string;
  empty?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 0);
  if (!data.length || max === 0) return <p className={c.empty}>{empty}</p>;
  const nice = niceMax(max);
  return (
    <figure className={c.columnsFig}>
      <div className={c.columns} style={{ height }} role="img" aria-label={label}>
        <span className={c.gridTop} aria-hidden="true">
          {fmtInt(nice)}
        </span>
        <span className={c.gridMid} aria-hidden="true" />
        {data.map((d, i) => (
          <span key={d.key} className={c.col} data-tip={d.tip} tabIndex={-1}>
            <span
              className={`${c.colBar} ${d.muted ? c.colMuted : ''}`}
              style={{ height: `${(d.value / nice) * 100}%`, background: d.value ? color : 'transparent' }}
            />
            <span className={c.colLabel} aria-hidden="true">
              {i % labelEvery === 0 ? d.label : ''}
            </span>
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.label}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Tope "redondo" del eje (1, 2, 5 × 10ⁿ) para que la línea guía tenga un número legible. */
function niceMax(v: number) {
  if (v <= 5) return 5;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/* ------------------------------------------------------------------ */

export type Segment = { key: string; label: string; value: number; color: string };

/** Dona con el total al centro. 2px de separación entre segmentos. */
export function Donut({ segments, size = 168, center, label }: { segments: Segment[]; size?: number; center: ReactNode; label: string }) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  const r = 42;
  const circ = 2 * Math.PI * r;
  const gap = total > 0 && segments.filter((s) => s.value > 0).length > 1 ? 1.4 : 0; // ≈2px a este tamaño
  let offset = 0;
  return (
    <div className={c.donut} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(30, 2, 99, 0.08)" strokeWidth="12" />
        {total > 0 &&
          segments.map((s) => {
            if (!s.value) return null;
            const len = (s.value / total) * circ;
            const dash = Math.max(len - gap, 0.01);
            const el = (
              <circle
                key={s.key}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth="12"
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 50 50)"
              >
                <title>{`${s.label}: ${fmtInt(s.value)} (${fmtPct(s.value, total)})`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
      </svg>
      <div className={c.donutCenter}>{center}</div>
    </div>
  );
}

/** Barra apilada horizontal (distribución), con 2px entre segmentos. */
export function StackBar({ segments, label }: { segments: Segment[]; label: string }) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  return (
    <div className={c.stack} role="img" aria-label={label}>
      {total === 0 ? (
        <span className={c.stackEmpty} />
      ) : (
        segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <span
              key={s.key}
              className={c.stackSeg}
              style={{ flexGrow: s.value, background: s.color }}
              data-tip={`${s.label}: ${fmtInt(s.value)} (${fmtPct(s.value, total)})`}
            />
          ))
      )}
    </div>
  );
}

/** Medidor simple (parte de un total). */
export function Meter({ value, max, color = SERIES.primary, label }: { value: number; max: number; color?: string; label: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <span
      className={c.meter}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <span className={c.meterFill} style={{ width: `${pct}%`, background: color }} />
    </span>
  );
}

/** Leyenda con muestra de color + texto (la identidad nunca va solo por color). */
export function Legend({ items }: { items: { key: string; label: ReactNode; color: string }[] }) {
  return (
    <ul className={c.legend}>
      {items.map((i) => (
        <li key={i.key}>
          <span className={c.swatch} style={{ background: i.color }} aria-hidden="true" />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
