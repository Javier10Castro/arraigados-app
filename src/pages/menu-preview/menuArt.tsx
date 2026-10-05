/**
 * Ilustraciones placeholder para /menu-preview (3 oct 2026) -- SOLO para los
 * 4 platillos sin foto real todavía (hamburguesa, hot dog, papas, nachos).
 * Deliberadamente NO fotorrealistas: trazo simple y plano en los tonos de
 * marca (crema / morado), para distinguirse con claridad de las 4 fotos
 * reales y dejar obvio que son temporales. Nada de esto se descarga de
 * internet -- son <svg> propios, inline, sin assets ni dependencias nuevas.
 */

import type { ComponentType } from 'react';

type ArtProps = { className?: string };

export function HamburguesaArt({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Ilustración de una hamburguesa">
      <path d="M30 66c0-19 22-34 50-34s50 15 50 34H30Z" fill="#F2F7D7" />
      <circle cx="56" cy="50" r="2.6" fill="#7B5BFF" />
      <circle cx="72" cy="44" r="2.6" fill="#7B5BFF" />
      <circle cx="90" cy="45" r="2.6" fill="#7B5BFF" />
      <circle cx="104" cy="51" r="2.6" fill="#7B5BFF" />
      <circle cx="80" cy="56" r="2.6" fill="#7B5BFF" />
      <path d="M26 72h108c3 0 5 5 1.5 9-6 6-10 6-16 6H40.5c-6 0-10 0-16-6-3.5-4-1.5-9 1.5-9Z" fill="#7B5BFF" />
      <rect x="28" y="90" width="104" height="14" rx="7" fill="#3E07A6" />
      <path d="M24 108c0-4 3-6 7-6h98c4 0 7 2 7 6s-5 14-15 14H39c-10 0-15-10-15-14Z" fill="#F2F7D7" />
      <path d="M38 116h84" stroke="#7B5BFF" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function HotDogArt({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Ilustración de un hot dog">
      <rect x="18" y="70" width="124" height="40" rx="20" fill="#F2F7D7" />
      <rect x="30" y="78" width="100" height="24" rx="12" fill="#3E07A6" />
      <path
        d="M34 86c6-4 10 4 16 0s10-4 16 0 10 4 16 0 10-4 16 0 10 4 16 0 6-4 12 0"
        stroke="#F2F7D7"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M22 72c4-10 12-16 58-16s54 6 58 16" stroke="#7B5BFF" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.5" />
    </svg>
  );
}

export function PapasArt({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Ilustración de papas a la francesa">
      <g stroke="#F2F7D7" strokeWidth="9" strokeLinecap="round">
        <path d="M58 92 50 34" />
        <path d="M72 88 68 26" />
        <path d="M86 88 90 26" />
        <path d="M100 92 108 34" />
        <path d="M44 96 34 48" />
        <path d="M114 96 124 48" />
      </g>
      <path d="M38 92h84l-9 46c-1 6-6 10-12 10H59c-6 0-11-4-12-10l-9-46Z" fill="#3E07A6" />
      <path d="M38 92h84l-2.5 13H40.5L38 92Z" fill="#7B5BFF" />
    </svg>
  );
}

export function NachosArt({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Ilustración de nachos">
      <path d="M40 112 76 40l10 72H40Z" fill="#F2F7D7" />
      <path d="M86 112 100 56l30 56H86Z" fill="#F2F7D7" />
      <path d="M58 100 82 60l8 52H58Z" fill="#7B5BFF" opacity="0.55" />
      <circle cx="68" cy="96" r="5" fill="#3E07A6" />
      <circle cx="100" cy="100" r="4.5" fill="#3E07A6" />
      <circle cx="116" cy="92" r="4" fill="#E5312B" />
      <circle cx="84" cy="104" r="3.5" fill="#E5312B" />
      <path d="M36 112h92" stroke="#3E07A6" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export const MENU_ART: Record<string, ComponentType<ArtProps>> = {
  hamburguesa: HamburguesaArt,
  'hot-dog': HotDogArt,
  papas: PapasArt,
  nachos: NachosArt,
};
