/**
 * Texto público del evento que aparece en el pase. Es la misma información que muestra la pantalla /conocer
 * (src/data/app.ts → eventInfo); se repite aquí porque el servidor no puede importar ese archivo (arrastra imágenes
 * del cliente). Si cambian las fechas o sedes, actualizar AMBOS.
 */
export const WALLET_EVENT = {
  name: 'Arraigados 2K26',
  organizer: 'Red Juvenil Tijuana',
  dates: '17 y 18 de octubre',
  venues: '12va IAFCJ y 21ra IAFCJ',
  city: 'Tijuana, B.C.',
  /** Colores del congreso (src/pages/homev2/brand.ts). */
  background: '#3e07a6',
  foreground: '#f2f7d7',
  label: '#c0b8df',
} as const;

export type WalletSubject = {
  pulseId: string;
  kind: 'attendee' | 'team';
  holderName: string;
  /** Solo asistentes con iglesia registrada; el equipo no lleva iglesia. */
  churchName: string | null;
};
