import { PROFILE_PHOTO_PX } from '../../shared/profile';

/**
 * Prepara la foto de perfil EN EL NAVEGADOR antes de subirla: respeta la orientación de la cámara,
 * recorta al centro en cuadrado, la reduce a 512 px y la vuelve a codificar como JPEG.
 * Efectos buscados: archivo ligero (~50-150 KB) y sin metadatos (el re-dibujado en canvas elimina EXIF/GPS).
 * El servidor VUELVE a validar todo (no confía en esto).
 */
const MAX_INPUT_BYTES = 20 * 1024 * 1024; // una foto de cámara pesa 2-8 MB; más que esto casi seguro no es una foto

export class PhotoError extends Error {}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* se intenta con <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new PhotoError('No pudimos leer esa foto. Prueba con otra imagen.'));
      i.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

export async function preparePhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new PhotoError('Elige un archivo de imagen.');
  if (file.size > MAX_INPUT_BYTES) throw new PhotoError('Esa foto pesa demasiado. Elige una más ligera.');
  const img = await decode(file);
  try {
    if (!img.width || !img.height) throw new PhotoError('No pudimos leer esa foto. Prueba con otra imagen.');
    const side = Math.min(img.width, img.height);
    const out = Math.min(PROFILE_PHOTO_PX, side);
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new PhotoError('Tu navegador no pudo preparar la foto.');
    ctx.fillStyle = '#fff'; // fondos transparentes (PNG) quedan sobre blanco, no negro
    ctx.fillRect(0, 0, out, out);
    ctx.drawImage(img.source, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    if (!blob) throw new PhotoError('No pudimos preparar la foto. Prueba con otra.');
    return blob;
  } finally {
    img.close();
  }
}
