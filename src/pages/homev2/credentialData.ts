import { SATURDAY_PROGRAM, SUNDAY_PROGRAM, SUNDAY_VENUE_BY_ZONE, resolveZoneForDisplay, type ProgramItem } from '../../data/program';
import type { MeResponse } from '../../../shared/api';
import { brand } from './brand';

export type ProgramDay = { id: string; dayLabel: string; dateLabel: string; blocks: { time: string; title: string }[] };

export type CredentialBadge = {
  theme: 'congreso';
  lanyardText: string;
  org: string;
  number: string;
  strapColor: string;
  strapEdge: string;
  edition: string;
  attendee: { id: string; fullName: string; church: string; presbytery: string; zone: string };
  pkg: { name: string };
  qr: { token: string };
  verse: typeof brand.verse;
  venue: { shortLabel: string; program: ProgramDay[] };
};

const blocks = (items: ProgramItem[]) => items.map((i) => ({ time: i.time, title: i.event }));

/**
 * Convierte la respuesta de /api/me (+ el token de la pulsera para el QR) en el objeto que consume la
 * credencial. Es el ÚNICO punto de unión entre los datos reales y la animación.
 * El programa sale de src/data/program.ts (el mismo de /home): sábado compartido + domingo de su sede.
 */
export function buildBadge(me: MeResponse, qrValue: string): CredentialBadge {
  const zone = resolveZoneForDisplay(me.attendee.zoneName);
  const sundayVenue = SUNDAY_VENUE_BY_ZONE[zone];
  return {
    theme: 'congreso',
    lanyardText: brand.eventMark,
    org: brand.organization,
    number: brand.edition,
    strapColor: brand.strap,
    strapEdge: brand.strapEdge,
    edition: brand.edition,
    attendee: {
      id: me.attendee.id,
      fullName: me.attendee.fullName,
      church: me.attendee.churchName,
      presbytery: me.attendee.presbyteryName,
      zone: me.attendee.zoneName,
    },
    pkg: { name: me.package.name },
    qr: { token: qrValue },
    verse: brand.verse,
    venue: {
      shortLabel: sundayVenue,
      program: [
        { id: 'sabado', dayLabel: 'Sábado', dateLabel: '17 de octubre', blocks: blocks(SATURDAY_PROGRAM) },
        { id: 'domingo', dayLabel: 'Domingo', dateLabel: '18 de octubre', blocks: blocks(SUNDAY_PROGRAM) },
      ],
    },
  };
}
