import flyerContours from '../assets/brand/flyer-contours.webp';
import flyerTexture from '../assets/brand/flyer-texture.webp';
import { prizeWithImage } from '../data/rafflePrizes';

/**
 * Imagen del ganador para Instagram (Admin → Rifas → «Imagen para Instagram»).
 * Se dibuja en un <canvas> en el navegador: no se sube nada a ningún servidor ni se agregan dependencias.
 * Usa el arte del congreso que ya está en el proyecto (fondo «26» y textura del flyer, logo Arraigados, cita y logo RJDT) y la
 * fuente Antarctican (la de la portada), que trae acentos, ñ y «¡».
 *   · post  = 1080 × 1350 (4:5, publicación)
 *   · story = 1080 × 1920 (9:16, historia)
 */
export type WinnerImageFormat = 'post' | 'story';
export const IMAGE_SIZES: Record<WinnerImageFormat, { w: number; h: number; label: string }> = {
  post: { w: 1080, h: 1350, label: 'Publicación (4:5)' },
  story: { w: 1080, h: 1920, label: 'Historia (9:16)' },
};

export type WinnerImageInput = {
  /** Nombre tal como se va a publicar (el Admin lo puede editar). */
  name: string;
  kitName: string;
  format: WinnerImageFormat;
  /** Aviso debajo del premio (p. ej. cómo reclamarlo). Vacío = no se dibuja. */
  note?: string;
};

/** Aviso que sale por defecto debajo del premio (el Admin lo puede editar). */
export const DEFAULT_NOTE = 'Envía un mensaje a la Red Juvenil Tijuana para recibir las indicaciones de entrega de tu premio.';

const CREAM = '#f2f7d7';
const DEEP = '#1e0263';
const PURPLE = '#3e07a6';
const LAVENDER = '#c0b8df';
const FONT = 'Antarctican';

const FONT_FILES: [number, string][] = [
  [400, '/rcs/fonts/fonnts.com-Antarctican_Headline_Book.otf'],
  [700, '/rcs/fonts/fonnts.com-Antarctican_Headline_Bold.otf'],
  [900, '/rcs/fonts/fonnts.com-Antarctican_Headline_Black.otf'],
];

let fontsReady: Promise<void> | null = null;
/** Carga Antarctican con la API FontFace (el canvas no espera a las fuentes por su cuenta). */
function loadFonts(): Promise<void> {
  if (!fontsReady) {
    fontsReady = Promise.all(
      FONT_FILES.map(async ([weight, url]) => {
        const face = new FontFace(FONT, `url(${url})`, { weight: String(weight) });
        document.fonts.add(await face.load());
      }),
    ).then(() => undefined).catch(() => undefined); // sin la fuente se usa la de respaldo; la imagen se genera igual
  }
  return fontsReady;
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string): Promise<HTMLImageElement> {
  let hit = imageCache.get(src);
  if (!hit) {
    hit = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
      img.src = src;
    });
    imageCache.set(src, hit);
  }
  return hit;
}

/** SVG del proyecto recortado a su arte (viewBox) para que se dibuje sin el margen transparente. */
function loadSvg(url: string, viewBox?: [number, number, number, number]): Promise<HTMLImageElement> {
  const key = `${url}#${viewBox?.join(',') ?? ''}`;
  let hit = imageCache.get(key);
  if (!hit) {
    hit = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`No se pudo leer ${url}`);
        return r.text();
      })
      .then((text) => {
        let svg = text;
        if (viewBox) {
          const [, , w, h] = viewBox;
          svg = svg.replace(/<svg\b[^>]*>/, (tag) =>
            tag
              .replace(/\swidth="[^"]*"/, '')
              .replace(/\sheight="[^"]*"/, '')
              .replace(/\sviewBox="[^"]*"/, '')
              .replace('<svg', `<svg width="${w}" height="${h}" viewBox="${viewBox.join(' ')}"`),
          );
        }
        const blobUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        return loadImage(blobUrl);
      });
    imageCache.set(key, hit);
  }
  return hit;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function setFont(ctx: CanvasRenderingContext2D, weight: number, size: number, spacing = 0) {
  ctx.font = `${weight} ${size}px "${FONT}", "Barlow Condensed", "Arial Narrow", sans-serif`;
  // letterSpacing no existe en todos los navegadores; donde no está, simplemente no se aplica.
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${spacing}px`;
}

/** Ajusta el nombre: el tamaño más grande que quepa; si es muy largo, en dos renglones. */
function fitName(ctx: CanvasRenderingContext2D, text: string, maxW: number): { lines: string[]; size: number } {
  for (let size = 132; size >= 70; size -= 4) {
    setFont(ctx, 900, size, 1);
    if (ctx.measureText(text).width <= maxW) return { lines: [text], size };
  }
  const words = text.split(/\s+/);
  let best = { lines: [text], size: 60 };
  for (let size = 120; size >= 56; size -= 4) {
    setFont(ctx, 900, size, 1);
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' ');
      const b = words.slice(i).join(' ');
      if (ctx.measureText(a).width <= maxW && ctx.measureText(b).width <= maxW) return { lines: [a, b], size };
    }
    best = { lines: [text], size };
  }
  return best;
}

/** Parte un texto en renglones que quepan en `maxW` (máximo `maxLines`; el último se recorta con «…»). */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(test).width <= maxW || !cur) cur = test;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}…`;
    return kept;
  }
  return lines;
}

/** Igual que wrapLines, pero con renglones de largo parecido (evita una palabra sola en el último). */
function balancedLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const base = wrapLines(ctx, text, maxW, maxLines);
  if (base.length < 2 || base.length >= maxLines + 1) return base;
  let lo = maxW / base.length;
  let hi = maxW;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (wrapLines(ctx, text, mid, 99).length <= base.length) hi = mid;
    else lo = mid;
  }
  return wrapLines(ctx, text, hi, maxLines);
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * s;
  const dh = img.naturalHeight * s;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/** Dibuja la imagen completa en `canvas` (le pone el tamaño final). */
export async function drawWinnerImage(canvas: HTMLCanvasElement, input: WinnerImageInput): Promise<void> {
  const { w: W, h: H } = IMAGE_SIZES[input.format];
  const story = input.format === 'story';
  const prize = prizeWithImage(input.kitName);
  await loadFonts();
  const [bg, texture, logo, verse, rjdt, prizeImg] = await Promise.all([
    loadImage(flyerContours),
    loadImage(flyerTexture).catch(() => null),
    loadSvg('/rcs/svg_editables/LogoBage.svg', [176, 786, 1653, 603]),
    loadSvg('/rcs/svg_editables/Cita_Beige.svg').catch(() => null),
    loadSvg('/rcs/svg_editables/RJDT_CIRCLES_LOGO.svg').catch(() => null),
    prize ? loadImage(prize.image.src).catch(() => null) : Promise.resolve(null),
  ]);

  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // Fondo: arte «26» del flyer + textura de película suave + velo morado para que el texto se lea.
  drawCover(ctx, bg, W, H);
  if (texture) {
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.28;
    drawCover(ctx, texture, W, H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  const veil = ctx.createLinearGradient(0, 0, 0, H);
  veil.addColorStop(0, 'rgba(19, 4, 63, 0.72)');
  veil.addColorStop(0.45, 'rgba(30, 2, 99, 0.58)');
  veil.addColorStop(1, 'rgba(14, 2, 48, 0.9)');
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 0.47, 0, W / 2, H * 0.47, W * 0.7);
  glow.addColorStop(0, 'rgba(123, 91, 255, 0.38)');
  glow.addColorStop(1, 'rgba(123, 91, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Marco fino.
  ctx.strokeStyle = 'rgba(242, 247, 215, 0.55)';
  ctx.lineWidth = 3;
  roundRect(ctx, 34, 34, W - 68, H - 68, 36);
  ctx.stroke();

  // Bloques de arriba hacia abajo; el espacio que sobra se reparte igual (así sirve para post e historia).
  const name = input.name.trim().toUpperCase() || 'GANADOR';
  const fitted = fitName(ctx, name, W - 170);
  const nameLineH = fitted.size * 1.02;
  // Aviso debajo del premio: renglones y alto de su caja.
  const note = (input.note ?? '').replace(/\s+/g, ' ').trim();
  const noteSize = story ? 34 : 29;
  setFont(ctx, 400, noteSize, 0.5);
  const noteLines = note ? balancedLines(ctx, note, W - 260, 3) : [];
  const noteLineH = noteSize * 1.3;
  const noteH = noteLines.length ? noteLines.length * noteLineH + 34 : 0;
  const logoW = story ? 640 : noteLines.length > 2 ? 470 : 520;
  const logoH = (logoW * 603) / 1653;
  const cardH = 236;
  const blocks = {
    logo: logoH,
    sub: 34,
    pill: 74,
    congrats: story ? 124 : 112,
    name: nameLineH * fitted.lines.length,
    won: 40,
    card: cardH,
    note: noteH,
    footer: 96,
  };
  const used = Object.values(blocks).reduce((a, b) => a + b, 0);
  const top = story ? 150 : 92;
  const bottom = story ? 140 : 84;
  const gaps = [26, 46, 34, 22, 40, 16, noteH ? 18 : 26, noteH ? 18 : 0]; // pesos del espacio entre bloques
  const free = Math.max(0, H - top - bottom - used);
  const unit = free / gaps.reduce((a, b) => a + b + 1, 0);
  const gap = (i: number) => (gaps[i] + 1) * unit;
  let y = top;

  // Logo Arraigados
  ctx.drawImage(logo, (W - logoW) / 2, y, logoW, logoH);
  y += blocks.logo + gap(0);

  // Línea del evento
  ctx.fillStyle = LAVENDER;
  setFont(ctx, 400, 28, 7);
  ctx.fillText('CONGRESO 2K26 · RED JUVENIL TIJUANA', W / 2, y + 26);
  y += blocks.sub + gap(1);

  // Píldora con la rifa
  const pillText = (prize?.label ?? `Rifa ${input.kitName}`).toUpperCase();
  setFont(ctx, 700, 34, 4);
  const pillW = ctx.measureText(pillText).width + 84;
  ctx.fillStyle = CREAM;
  roundRect(ctx, (W - pillW) / 2, y, pillW, blocks.pill, blocks.pill / 2);
  ctx.fill();
  ctx.fillStyle = PURPLE;
  ctx.fillText(pillText, W / 2, y + 50);
  y += blocks.pill + gap(2);

  // ¡FELICIDADES!
  ctx.fillStyle = CREAM;
  setFont(ctx, 900, story ? 112 : 100, 3);
  ctx.shadowColor = 'rgba(8, 0, 32, 0.55)';
  ctx.shadowBlur = 24;
  ctx.fillText('¡FELICIDADES!', W / 2, y + blocks.congrats * 0.86);
  y += blocks.congrats + gap(3);

  // Nombre del ganador (lo más grande)
  setFont(ctx, 900, fitted.size, 1);
  ctx.fillStyle = '#ffffff';
  fitted.lines.forEach((line, i) => ctx.fillText(line, W / 2, y + nameLineH * (i + 0.84)));
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  y += blocks.name + gap(4);

  // «Ganó»
  ctx.fillStyle = LAVENDER;
  setFont(ctx, 700, 32, 8);
  ctx.fillText(prize ? 'SE LLEVA' : 'GANÓ LA RIFA', W / 2, y + 30);
  y += blocks.won + gap(5);

  // Tarjeta del premio
  const cardW = W - 190;
  const cx = (W - cardW) / 2;
  ctx.fillStyle = CREAM;
  ctx.shadowColor = 'rgba(8, 0, 32, 0.45)';
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 14;
  roundRect(ctx, cx, y, cardW, cardH, 34);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.shadowColor = 'transparent';
  const art = cardH - 44;
  const ax = cx + 22;
  const ay = y + 22;
  const artBg = ctx.createLinearGradient(ax, ay, ax + art, ay + art);
  artBg.addColorStop(0, DEEP);
  artBg.addColorStop(1, PURPLE);
  ctx.fillStyle = artBg;
  roundRect(ctx, ax, ay, art, art, 26);
  ctx.fill();
  if (prizeImg) {
    const s = Math.min((art * 0.8) / prizeImg.naturalWidth, (art * 0.86) / prizeImg.naturalHeight);
    const dw = prizeImg.naturalWidth * s;
    const dh = prizeImg.naturalHeight * s;
    ctx.drawImage(prizeImg, ax + (art - dw) / 2, ay + (art - dh) / 2, dw, dh);
  }
  ctx.textAlign = 'left';
  const tx = ax + art + 34;
  const tMax = cx + cardW - tx - 30;
  ctx.fillStyle = DEEP;
  const title = (prize?.title ?? input.kitName).toUpperCase();
  let tSize = 56;
  setFont(ctx, 900, tSize, 0.5);
  // Título del premio en 1 o 2 renglones
  const words = title.split(' ');
  let lines = [title];
  while (ctx.measureText(lines[0]).width > tMax && tSize > 34) {
    tSize -= 2;
    setFont(ctx, 900, tSize, 0.5);
  }
  if (ctx.measureText(title).width > tMax) {
    tSize = 46;
    setFont(ctx, 900, tSize, 0.5);
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' ');
      const b = words.slice(i).join(' ');
      if (ctx.measureText(a).width <= tMax && ctx.measureText(b).width <= tMax) { lines = [a, b]; break; }
    }
  }
  const detail = prize?.detail ?? '';
  const blockH = lines.length * tSize * 1.02 + (detail ? 58 : 0);
  let ty = y + (cardH - blockH) / 2 + tSize * 0.86;
  lines.forEach((l) => { ctx.fillText(l, tx, ty); ty += tSize * 1.02; });
  if (detail) {
    setFont(ctx, 700, 28, 1);
    const dw = ctx.measureText(detail).width + 40;
    ctx.fillStyle = PURPLE;
    roundRect(ctx, tx, ty - tSize * 0.86 + 12, dw, 44, 22);
    ctx.fill();
    ctx.fillStyle = CREAM;
    ctx.fillText(detail, tx + 20, ty - tSize * 0.86 + 44);
  }
  ctx.textAlign = 'center';
  y += cardH + gap(6);

  // Aviso (cómo reclamar el premio): caja translúcida con el texto centrado.
  if (noteLines.length) {
    const boxW = W - 190;
    ctx.fillStyle = 'rgba(242, 247, 215, 0.12)';
    ctx.strokeStyle = 'rgba(242, 247, 215, 0.45)';
    ctx.lineWidth = 2;
    roundRect(ctx, (W - boxW) / 2, y, boxW, noteH, 24);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = CREAM;
    setFont(ctx, 400, noteSize, 0.5);
    noteLines.forEach((line, i) => ctx.fillText(line, W / 2, y + 17 + noteLineH * i + noteSize * 1.02));
    y += noteH + gap(7);
  }

  // Pie: cita bíblica y logo RJDT
  const footY = H - bottom - blocks.footer;
  if (verse) {
    const vw = 470;
    const vh = (vw * verse.naturalHeight) / verse.naturalWidth;
    ctx.globalAlpha = 0.92;
    ctx.drawImage(verse, 96, footY + (blocks.footer - vh) / 2, vw, vh);
    ctx.globalAlpha = 1;
  }
  if (rjdt) {
    const rw = 300;
    const rh = (rw * rjdt.naturalHeight) / rjdt.naturalWidth;
    ctx.drawImage(rjdt, W - 96 - rw, footY + (blocks.footer - rh) / 2, rw, rh);
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen.'))), 'image/png'));
}

/** «Rifa Kit - A» + «Ana López» -> «ganador-rifa-kit-a-ana-lopez.png» */
export function imageFileName(kitName: string, name: string, format: WinnerImageFormat) {
  const slug = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `ganador-rifa-${slug(kitName)}-${slug(name) || 'ganador'}${format === 'story' ? '-historia' : ''}.png`;
}
