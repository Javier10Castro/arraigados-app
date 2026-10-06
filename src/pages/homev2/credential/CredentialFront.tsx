import CroppedArtwork from './CroppedArtwork';
import UserAvatar from '../../../components/UserAvatar';
import { brand as congresoBrand } from '../brand';
import type { CredentialBadge } from '../credentialData';

/**
 * Frente de la credencial.
 *
 * Jerarquía deliberada: el LOGO DE ARRAIGADOS es el protagonista y ocupa la
 * mayor parte del ancho; los datos del asistente van debajo, comprimidos en un
 * panel bajo que no compite con él.
 *
 * Recibe TODOS los datos por props.
 */
export default function CredentialFront({ badge }: { badge: CredentialBadge }) {
  const { attendee, pkg, edition, org } = badge;

  return (
    <div className="cred-print">
      <div className="cred-angle" aria-hidden="true" />
      <div className="cred-sheen" aria-hidden="true" />

      {/* Cabecera: [ LOGO RJDT ] [ AGUJERO ] [ WORDMARK DEL CONGRESO ]
          La columna central la ocupa la ranura, que se dibuja encima desde
          `.cred-slot`; los logos van en las columnas 1 y 3, pegados a los
          extremos. Antes esta fila era "Congreso Distrital 2K26" en texto. */}
      <div className="cred-head">
        <img
          src={congresoBrand.assets.rjdtCream}
          alt="RJDT"
          className="cred-head-logo is-left"
        />
        <CroppedArtwork
          artwork={congresoBrand.assets.marcaCongreso}
          className="cred-head-logo is-right"
          label="Congreso Distrital 2K26"
        />
      </div>

      {/* PROTAGONISTA */}
      <div className="cred-mark">
        <CroppedArtwork
          artwork={congresoBrand.assets.arraigadosCream}
          className="cred-arraigados"
          label="Arraigados"
        />
      </div>

      {/* Rótulo bajo el logotipo: Circles (RJDT). Se usa el SVG vectorial que ya
          tenía el proyecto — mismo diseño que el PNG entregado, pero sin pérdida
          de calidad al reducirlo. */}
      <div className="cred-mark-sub">
        <img src={congresoBrand.assets.rjdtCream} alt="RJDT Circles" className="cred-circles" />
      </div>

      {/* Información secundaria: panel compacto */}
      <div className="cred-panel">
        <div className="cred-identity">
          <div className="cred-identity-text">
            <span className="cred-label">Nombre</span>
            <span className="cred-name">{attendee.fullName}</span>
          </div>
          <UserAvatar className="cred-identity-avatar" attendeeId={attendee.id} name={attendee.fullName} />
        </div>

        {/* Iglesia | Presbiterio | Zona en UNA sola fila.
            Cada celda recorta a 2 líneas para que los nombres largos no
            desborden ni empujen hacia abajo el resto del panel. */}
        <div className="cred-triplet">
          <div className="cred-triplet-cell">
            <span className="cred-label">Iglesia</span>
            <span className="cred-triplet-value">{attendee.church}</span>
          </div>
          <div className="cred-triplet-cell">
            <span className="cred-label">Presbiterio</span>
            <span className="cred-triplet-value">{attendee.presbytery}</span>
          </div>
          <div className="cred-triplet-cell">
            <span className="cred-label">Zona</span>
            <span className="cred-triplet-value">{attendee.zone}</span>
          </div>
        </div>

        <div className="cred-package">
          <span className="cred-package-label">Paquete</span>
          <span className="cred-package-value">{pkg.name}</span>
        </div>
      </div>

      <div className="cred-foot">
        <span className="cred-foot-edition">{edition}</span>
        <span className="cred-foot-org">{org}</span>
      </div>
    </div>
  );
}