import CroppedArtwork from './CroppedArtwork';
import { brand as congresoBrand } from '../brand';
import type { CredentialBadge } from '../credentialData';
import CredentialQr from './CredentialQr';

/**
 * Reverso de la credencial.
 *
 * Tres bloques, todos alimentados por props y en este orden de arriba abajo:
 *   1. Cita bíblica — arte definitivo, entra como imagen.
 *   2. Programa de la sede — los DÍAS de esa sede: sábado (compartido) y
 *      domingo (propio). Sólo hora y actividad.
 *   3. Código QR — token local de acceso, en la esquina inferior
 *      derecha para no competir con las 15 filas del programa.
 *
 * Mantiene la identidad visual del frente (misma paleta, mismos recursos) pero
 * con una distribución propia, pensada para información densa.
 */
export default function CredentialBack({ badge }: { badge: CredentialBadge }) {
  const { qr, verse, venue, attendee, pkg } = badge;
  const program = venue.program;

  return (
    <div className="cred-print cred-print-back">
      <div className="cred-angle" aria-hidden="true" />
      <div className="cred-sheen" aria-hidden="true" />

      {/* Misma cabecera que el frente: [ WORDMARK ] [ AGUJERO ] [ RJDT ], con la
          ranura como columna central. */}
      <div className="cred-back-head">
        <CroppedArtwork
          artwork={congresoBrand.assets.marcaCongreso}
          className="cred-head-logo is-left"
          label="Congreso Distrital 2K26"
        />
        <img
          src={congresoBrand.assets.rjdtCream}
          alt="RJDT"
          className="cred-head-logo is-right"
        />
      </div>

      <div className="cred-back-body">
        {/* B. Cita bíblica ---------------------------------------------
            Es el arte definitivo exportado desde Illustrator: entra como
            imagen para respetar la tipografía y la composición del original. */}
        <figure className="cred-verse">
          <img
            className="cred-verse-art"
            src={verse.image}
            alt={verse.alt}
            width={verse.width}
            height={verse.height}
            style={{ aspectRatio: String(verse.ratio) }}
          />
        </figure>

        {/* C. Programa de la sede --------------------------------------
            Se imprimen los DÍAS en orden (Sábado primero, después el Domingo de
            esta sede). El sábado es el mismo para ambas sedes; el domingo
            cambia, y por eso `venue.program` es una lista y no un objeto único. */}
        <div className="cred-days">
          {program.map((day) => (
            <section className="cred-day" key={day.id} aria-label={`Programa del ${day.dayLabel}`}>
              <header className="cred-day-head">
                <span className="cred-day-name">{day.dayLabel}</span>
                <span className="cred-day-meta">{day.dateLabel}</span>
              </header>
              <ul className="cred-day-rows">
                {day.blocks.map((block) => (
                  <li className="cred-day-row" key={`${day.id}-${block.time}-${block.title}`}>
                    <span className="cred-day-time">{block.time}</span>
                    <span className="cred-day-title">{block.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {/* A. Código QR -------------------------------------------------
            `tone="light"`: módulos blancos sobre el morado, sin recuadro ni
            caption. Va en la esquina para no robarle filas al programa, que
            necesita 15 en total. */}
        <div className="cred-qr-corner">
          <CredentialQr value={qr.token} size={54} />
        </div>
      </div>

      <div className="cred-back-foot">
        <span className="cred-back-holder">{attendee.fullName}</span>
        <span className="cred-back-venue">{venue.shortLabel}</span>
        <span className="cred-back-meta">{pkg.name}</span>
      </div>
    </div>
  );
}