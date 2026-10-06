# Plan de respaldo (5 oct 2026)

**Situación hoy:** no existe ningún respaldo de la base ni de las fotos. El script `npm run db:respaldo`
solo guarda las tablas de **pruebas** (pulseras, lotes, asistentes, canjes, instantáneas, parte del
historial); sirve para limpiar datos de prueba, **no** como respaldo del sistema.

## Qué hay que proteger
| Dato | Dónde vive | ¿Lo cubre `db:respaldo`? |
|---|---|---|
| Usuarios (Admin/Staff) y sus contraseñas (hash) | Neon `User` | No |
| Paquetes, zonas, presbiterios, iglesias | Neon `Package`, `Zone`, `Presbytery`, `Church` | No |
| Pulseras, lotes, asistentes, canjes | Neon | Sí |
| Notas, likes, palabras bloqueadas | Neon `Note`, `NoteLike`, `"BlockedWord"` | No |
| Platillos, sedes, mercancía (datos) | Neon `Dish`, `Venue`, `MerchItem`, `MerchImage` | No |
| Historial de auditoría y ajustes | Neon `AuditLog` (+ ajustes) | Parcial |
| **Fotos** de platillos y mercancía | Netlify Blobs (`dish-photos`, `merch-photos`) | No |

## Plan (en orden)
1. **Hoy, sin código:** en Neon → *Branches* → crear una rama `respaldo-AAAA-MM-DD` desde `main`
   (copia completa e instantánea). Revisar en la consola de Neon qué ventana de restauración
   (*point-in-time*) incluye el plan actual y anotarla aquí.
2. **Script `db:respaldo-total`** (por construir; solo lee): vuelca **todas** las tablas de la lista
   anterior a un JSON fechado en `respaldos/`, más una copia de las fotos de Blobs. Contraseñas: solo
   los hashes que ya están en la base; el archivo es **sensible** (no subir a GitHub; `respaldos/`
   ya está en `.gitignore`, verificar).
3. **Script `db:restaurar-total`** (por construir): solo contra una base **vacía**, pide escribir una
   confirmación, restaura en una transacción. Se prueba una vez contra una rama de Neon antes del evento.
4. **Calendario:** respaldo total (a) cuando esté construido, (b) **vie 16 oct** por la noche, (c) **dom 18 oct**
   al terminar el congreso. Rama de Neon además antes de cada cambio grande (migraciones, limpieza).
5. **Dónde guardar las copias:** al menos 2 lugares (la computadora y un disco/nube personal). Decisión
   pendiente del propietario.

## Regla
Antes de `db:limpiar-pruebas` o de cualquier migración nueva: rama de Neon + respaldo.
