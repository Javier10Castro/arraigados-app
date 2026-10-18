import { ExternalLink } from 'lucide-react';
import { PLAYLIST } from '../../data/homeCards';
import cover from '../../assets/brand/playlist-cover.webp';
import homeStyles from './Home.module.css';
import styles from './PlaylistCard.module.css';

/** "open.spotify.com" -> "Spotify"; cualquier otra plataforma se nombra por su dominio. */
function platformName(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host.includes('spotify')) return 'Spotify';
    if (host.includes('apple')) return 'Apple Music';
    if (host.includes('youtube')) return 'YouTube Music';
    return host;
  } catch {
    return '';
  }
}

/** Solo http(s): el enlace sale de data/homeCards.ts, pero no se abre nada con otro esquema. */
function safeUrl(url: string): string {
  return /^https:\/\//i.test(url) ? url : '';
}

/**
 * Tarjeta "Playlist" de /home (todos los usuarios, equipo y asistentes). Informativa: abre la playlist en la
 * plataforma de música en una pestaña nueva. Sin enlace configurado no se muestra en producción
 * (en desarrollo aparece una vista previa para poder diseñarla).
 */
export default function PlaylistCard() {
  const url = safeUrl(PLAYLIST.url);
  const preview = !url && import.meta.env.DEV;
  if (!url && !preview) return null;
  const platform = url ? platformName(url) : '';

  return (
    <section className={`${homeStyles.section} ${homeStyles.current}`} aria-labelledby="playlist-title">
      <h2 className="label" id="playlist-title">
        Playlist
      </h2>
      <a
        className={styles.card}
        href={url || undefined}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={url ? undefined : true}
        aria-label={`${PLAYLIST.title}${platform ? `, abrir en ${platform}` : ''}`}
      >
        <img className={styles.cover} src={cover} alt="" width={84} height={84} />
        <span className={styles.body}>
          <span className={styles.kicker}>ARRAIGADOS 2K26</span>
          <strong className={styles.title}>{PLAYLIST.title}</strong>
          <span className={styles.sub}>{PLAYLIST.subtitle}</span>
        </span>
        <span className={styles.cta}>
          {url ? (
            <>
              Escuchar{platform ? ` en ${platform}` : ''}
              <ExternalLink size={14} strokeWidth={2.4} aria-hidden="true" />
            </>
          ) : (
            'Vista previa: falta el enlace'
          )}
        </span>
      </a>
    </section>
  );
}
