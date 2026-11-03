import { useEffect, useRef, useState } from 'react';
import { Download, Share2 } from 'lucide-react';
import AdminModal from './AdminModal';
import type { AdminRaffleDetail } from '../../shared/api';
import { DEFAULT_NOTE, IMAGE_SIZES, canvasToBlob, drawWinnerImage, imageFileName, type WinnerImageFormat } from './winnerImage';
import c from './Rifas.module.css';

/**
 * «Imagen para Instagram» de una rifa: elige ganador, cómo se escribe su nombre y el formato; muestra la vista previa
 * y la descarga en PNG (o la comparte directo desde el celular, si el navegador lo permite).
 * El nombre empieza como está registrado y se puede editar antes de publicar (p. ej. solo nombre y primer apellido).
 */
export default function WinnerImageModal({ raffle, onClose }: { raffle: AdminRaffleDetail; onClose: () => void }) {
  const winners = raffle.winners.filter((w) => w.winner);
  const [pos, setPos] = useState(winners[winners.length - 1]?.position ?? 0);
  const current = winners.find((w) => w.position === pos) ?? winners[0];
  const [name, setName] = useState(current?.winnerName ?? '');
  const [format, setFormat] = useState<WinnerImageFormat>('post');
  const [note, setNote] = useState(DEFAULT_NOTE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canShare = typeof navigator !== 'undefined' && 'canShare' in navigator;

  useEffect(() => { if (current) setName(current.winnerName); }, [current?.position]); // eslint-disable-line react-hooks/exhaustive-deps

  // Redibuja la vista previa (con una pausa corta mientras se escribe el nombre).
  useEffect(() => {
    if (!canvasRef.current || !current) return undefined;
    const t = window.setTimeout(() => {
      drawWinnerImage(canvasRef.current!, { name, kitName: raffle.kitName, format, note })
        .then(() => setError(''))
        .catch((e: Error) => setError(e.message));
    }, 180);
    return () => window.clearTimeout(t);
  }, [name, format, note, raffle.kitName, current]);

  const fileName = imageFileName(raffle.kitName, name, format);

  const download = async () => {
    if (!canvasRef.current) return;
    setBusy(true);
    try {
      const blob = await canvasToBlob(canvasRef.current);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!canvasRef.current) return;
    setBusy(true);
    try {
      const file = new File([await canvasToBlob(canvasRef.current)], fileName, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: raffle.name });
      else await download();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminModal title="Imagen para Instagram" onClose={onClose} busy={busy}>
      {winners.length === 0 ? (
        <p className={c.note}>Esta rifa todavía no tiene ganador. Cuando salga, aquí podrás generar la imagen.</p>
      ) : (
        <div className={c.igWrap}>
          <div className={c.igControls}>
            {winners.length > 1 && (
              <label><span>Ganador</span>
                <select value={pos} onChange={(e) => setPos(Number(e.target.value))}>
                  {winners.map((w) => <option key={w.position} value={w.position}>#{w.position} · {w.winnerName}{w.extra ? ' (extra)' : ''}</option>)}
                </select>
              </label>
            )}
            <label><span>Nombre en la imagen</span>
              <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            </label>
            <label><span>Aviso debajo del premio (déjalo vacío para quitarlo)</span>
              <textarea rows={2} value={note} maxLength={160} onChange={(e) => setNote(e.target.value)} />
            </label>
            <div className={c.igFormats} role="radiogroup" aria-label="Formato">
              {(Object.keys(IMAGE_SIZES) as WinnerImageFormat[]).map((f) => (
                <button key={f} type="button" role="radio" aria-checked={format === f} className={format === f ? c.tabOn : c.tab} onClick={() => setFormat(f)}>
                  {IMAGE_SIZES[f].label}
                </button>
              ))}
            </div>
            <p className={c.note}>Puedes editar el nombre (por ejemplo, solo nombre y primer apellido) y el aviso antes de descargar.</p>
          </div>
          <div className={c.igPreview}>
            <canvas ref={canvasRef} className={format === 'story' ? c.igStory : c.igPost} aria-label={`Vista previa: ${name}, ${raffle.kitName}`} />
          </div>
          {error && <p className={c.bad} role="alert">{error}</p>}
          <div className={c.actions}>
            <button type="button" className={c.spin} disabled={busy} onClick={() => void download()}>
              <Download size={16} strokeWidth={2.4} style={{ verticalAlign: '-3px', marginRight: 6 }} />Descargar PNG
            </button>
            {canShare && (
              <button type="button" className={c.ghost} disabled={busy} onClick={() => void share()}>
                <Share2 size={14} strokeWidth={2.4} style={{ verticalAlign: '-2px', marginRight: 6 }} />Compartir
              </button>
            )}
          </div>
        </div>
      )}
    </AdminModal>
  );
}
