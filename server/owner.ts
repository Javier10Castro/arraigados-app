/**
 * Cuenta "dueña" de la app (Javier). Es la única que puede vaciar la bitácora y la única que NUNCA se puede eliminar.
 * Se puede cambiar con la variable de entorno OWNER_EMAIL (sin tocar código).
 */
export function isOwnerEmail(email: string | null | undefined): boolean {
  const owner = (process.env.OWNER_EMAIL || 'javiercastro9912@gmail.com').trim().toLowerCase();
  return String(email ?? '').trim().toLowerCase() === owner;
}
