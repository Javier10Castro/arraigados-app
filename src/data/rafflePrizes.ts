import type { RafflePrize, RafflePrizeKey } from '../../shared/raffle';
import { RAFFLE_PRIZES, prizeForKit } from '../../shared/raffle';
import echoPop from '../assets/premios/premio-echo-pop.webp';
import owala from '../assets/premios/premio-owala.webp';
import amazon from '../assets/premios/premio-amazon.webp';

/**
 * Imágenes de los premios de la rifa (recortadas de «Premios.pdf», fondo transparente). Los textos y qué kit gana
 * qué viven en shared/raffle.ts (los usa también el servidor). Para cambiar un premio: texto allá, imagen aquí.
 */
export const PRIZE_IMAGES: Record<RafflePrizeKey, { src: string; width: number; height: number }> = {
  especial: { src: echoPop, width: 520, height: 554 },
  kitb: { src: owala, width: 360, height: 1247 },
  kita: { src: amazon, width: 584, height: 367 },
};

export type PrizeWithImage = RafflePrize & { image: (typeof PRIZE_IMAGES)[RafflePrizeKey] };

const withImage = (p: RafflePrize): PrizeWithImage => ({ ...p, image: PRIZE_IMAGES[p.key] });

export const PRIZES: PrizeWithImage[] = RAFFLE_PRIZES.map(withImage);

export function prizeWithImage(kitName: string | null | undefined): PrizeWithImage | null {
  const p = prizeForKit(kitName);
  return p ? withImage(p) : null;
}
