/**
 * Descarga de la credencial como imagen PNG, SIN dependencias nuevas.
 *
 * Técnica: se clona el DOM plano de la credencial, se "congela" el estilo calculado de cada nodo en línea,
 * se incrustan como data-URI las imágenes (logos, cita) y las fuentes, se envuelve todo en un SVG con
 * <foreignObject> y se dibuja en un <canvas>. Todo ocurre en el navegador; nada se envía a ningún servidor.
 */

const FONTS: { family: string; weight: number; url: string }[] = [
  { family: 'Antarctican', weight: 400, url: '/rcs/fonts/fonnts.com-Antarctican_Headline_Book.otf' },
  { family: 'Antarctican', weight: 700, url: '/rcs/fonts/fonnts.com-Antarctican_Headline_Bold.otf' },
  { family: 'Antarctican', weight: 900, url: '/rcs/fonts/fonnts.com-Antarctican_Headline_Black.otf' },
  { family: 'Degular Text', weight: 400, url: '/rcs/fonts/DegularTextDemo-Regular.otf' },
  { family: 'Degular Text', weight: 600, url: '/rcs/fonts/DegularTextDemo-Semibold.otf' },
];

const dataUriCache = new Map<string, Promise<string>>();

function toDataUri(url: string): Promise<string> {
  let hit = dataUriCache.get(url);
  if (!hit) {
    hit = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`No se pudo leer ${url}`);
        return r.blob();
      })
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result));
            fr.onerror = () => reject(fr.error);
            fr.readAsDataURL(blob);
          }),
      );
    dataUriCache.set(url, hit);
  }
  return hit;
}

/** Copia el estilo calculado de `src` a `dst` (y de sus descendientes), en paralelo. */
function freezeStyles(src: Element, dst: Element) {
  const cs = getComputedStyle(src);
  let css = '';
  for (let i = 0; i < cs.length; i++) {
    const prop = cs[i];
    if (prop.startsWith('animation') || prop.startsWith('transition')) continue;
    css += `${prop}:${cs.getPropertyValue(prop)};`;
  }
  (dst as HTMLElement).setAttribute('style', css);
  const a = src.children;
  const b = dst.children;
  for (let i = 0; i < a.length; i++) freezeStyles(a[i], b[i]);
}

async function inlineImages(root: Element) {
  const jobs: Promise<void>[] = [];
  root.querySelectorAll('image').forEach((el) => {
    const href = el.getAttribute('href') ?? el.getAttribute('xlink:href');
    if (href && !href.startsWith('data:')) jobs.push(toDataUri(href).then((d) => el.setAttribute('href', d)));
  });
  root.querySelectorAll('img').forEach((el) => {
    const src = el.getAttribute('src');
    if (src && !src.startsWith('data:')) jobs.push(toDataUri(src).then((d) => el.setAttribute('src', d)));
  });
  await Promise.all(jobs);
}

async function fontCss() {
  const rules = await Promise.all(
    FONTS.map(async (f) => `@font-face{font-family:'${f.family}';font-weight:${f.weight};src:url(${await toDataUri(f.url)}) format('opentype');}`),
  );
  return rules.join('');
}

/** `node` ya debe estar en el documento (aunque fuera de pantalla) para poder leer su estilo calculado. */
export async function nodeToPngBlob(node: HTMLElement, width: number, height: number, scale = 3): Promise<Blob> {
  if (document.fonts?.ready) await document.fonts.ready;
  const clone = node.cloneNode(true) as HTMLElement;
  freezeStyles(node, clone);
  clone.style.margin = '0';
  clone.style.position = 'static';
  await inlineImages(clone);

  const xhtml = new XMLSerializer().serializeToString(clone);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs><style>${await fontCss()}</style></defs>` +
    `<foreignObject x="0" y="0" width="${width}" height="${height}">${xhtml}</foreignObject></svg>`;

  const img = new Image();
  img.decoding = 'async';
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('No se pudo dibujar la credencial.'));
  });
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await loaded;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tu navegador no pudo crear la imagen.');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo crear la imagen.'))), 'image/png'));
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
