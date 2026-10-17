/**
 * Comprime EN EL NAVEGADOR una foto que pese más de `maxBytes` (3 MB por defecto) antes de subirla.
 * Si ya pesa menos, se devuelve tal cual (sin pérdida). Si no, se redibuja en canvas (respeta la orientación de la
 * cámara y la transparencia), se reduce a máx. 2400 px y se codifica como WebP bajando calidad y tamaño hasta caber.
 * El servidor VUELVE a validar tipo y peso (no confía en esto).
 */
export const TARGET_IMAGE_BYTES = 3 * 1024 * 1024;
const START_SIDE = 2400;

const toBlob = (c: HTMLCanvasElement, type: string, q: number) => new Promise<Blob | null>((r) => c.toBlob(r, type, q));

export async function compressImage(file: File, maxBytes = TARGET_IMAGE_BYTES): Promise<File> {
  if (file.size <= maxBytes) return file;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(`No pudimos leer «${file.name}». Prueba con otra imagen.`);
  }
  try {
    let side = Math.min(START_SIDE, Math.max(bmp.width, bmp.height));
    for (let round = 0; round < 8; round++) {
      const k = side / Math.max(bmp.width, bmp.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bmp.width * k));
      canvas.height = Math.max(1, Math.round(bmp.height * k));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Tu navegador no pudo comprimir la foto.');
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      for (const q of [0.88, 0.78, 0.68, 0.58]) {
        const blob = await toBlob(canvas, 'image/webp', q);
        if (blob && blob.type === 'image/webp' && blob.size <= maxBytes) {
          return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
        }
      }
      side = Math.round(side * 0.8); // sigue pesando de más: reduce dimensiones y reintenta
    }
    throw new Error(`No pudimos reducir «${file.name}» a 3 MB. Prueba con otra imagen.`);
  } finally {
    bmp.close();
  }
}
