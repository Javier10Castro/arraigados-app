/**
 * Semillas de los avatares (Blobatar).
 *
 * Blobatar es determinista: la misma semilla dibuja siempre el mismo avatar.
 * Por eso la semilla NO es el nombre cuando hay un id estable: si un Admin
 * corrige el nombre de un asistente, su avatar no debe cambiar.
 *
 * - Cuentas de Staff/Admin (tabla "User")     → `user-<User.id>`
 * - Asistentes (tabla "Attendee")              → `attendee-<Attendee.id>`
 * - Sin id disponible                          → el nombre tal cual
 *
 * Los prefijos separan las dos tablas: un id de "User" y uno de "Attendee"
 * nunca deberían coincidir, pero así ni siquiera es posible.
 *
 * Nada de esto se guarda en la base: el avatar se genera en el navegador.
 */

export const userAvatarSeed = (id: string) => `user-${id}`;
export const attendeeAvatarSeed = (id: string) => `attendee-${id}`;

/** Semilla neutra para cuando todavía no hay id ni nombre (p. ej. mientras carga). */
export const FALLBACK_AVATAR_SEED = 'arraigados-2k26';
