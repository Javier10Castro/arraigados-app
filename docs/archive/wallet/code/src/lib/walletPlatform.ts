export type WalletPlatform = 'ios' | 'android' | 'other';

/** Plataforma probable del teléfono (por el navegador; no es infalible, por eso `other` ofrece las dos opciones). */
export function detectPlatform(ua: string, touchPoints = 0, platform = ''): WalletPlatform {
  if (/iPhone|iPad|iPod/i.test(ua) || (platform === 'MacIntel' && touchPoints > 1)) return 'ios'; // iPadOS se presenta como Mac
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}
