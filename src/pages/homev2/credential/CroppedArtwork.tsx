import type { Artwork } from '../brand';

/** Muestra un recorte (viewBox) de un SVG/PNG con margen transparente. */
export default function CroppedArtwork({ artwork, className = '', label }: { artwork: Artwork; className?: string; label?: string }) {
  return (
    <svg
      className={className}
      viewBox={artwork.viewBox}
      preserveAspectRatio="xMidYMid meet"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <image href={artwork.src} x="0" y="0" width={artwork.sourceWidth} height={artwork.sourceHeight} />
    </svg>
  );
}
