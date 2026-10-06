# Plan de respaldo (actualizado 6 oct 2026)

**Estado:** el respaldo total, su restauración y la limpieza completa ya están construidos y probados
(contra una base de prueba con las mismas llaves foráneas: respaldo → limpiar → restaurar → comparación
fila por fila = idénticos). Falta lo que solo se puede hacer en Neon/Netlify (pasos 1 y 4).

## Comandos (se corren en `arraigados-app/`, con `DATABASE_URL` en `.env`)
| Comando | Qué hace | ¿Cambia la base? |
|---|---|---|
| `npm run db:respaldo-total` | Guarda **todas** las tablas (descubre la lista sola, así que cubre también lo que se agregue después) en `respaldos/total-AAAAMMDD-HHMM/datos.json` + las fotos si hay credenciales de Netlify. Verifica el archivo al terminar (huella SHA-256 y conteos). | No (solo lee) |
| `npm run db:restaurar-total -- respaldos/total-XXXX` | Restaura en una base **vacía**. Verifica el archivo antes, exige que existan todas las tablas, todo en una transacción. | Sí |
| `npm run db:restaurar-total -- respaldos/total-XXXX --reemplazar` | Igual, pero sobre una base con datos: antes guarda `antes-de-restaurar-…`, pide escribir `REEMPLAZAR TODO`, vacía y restaura. | Sí |
| `npm run db:limpiar-pruebas -- --simular` | Muestra qué se borraría y qué se conserva. No toca nada. | No |
| `npm run db:limpiar-pruebas` | Deja la base lista para el evento (ver abajo). Guarda **solo** un respaldo total antes (`antes-de-limpiar-…`) y pide escribir `LIMPIAR TODO`. | Sí |

`db:respaldo`, `db:restaurar` y `db:borrar-respaldo` (los anteriores) siguen existiendo pero **ya no hacen falta**:
el respaldo total los reemplaza.

## Qué borra y qué conserva `db:limpiar-pruebas`
- **Borra:** lotes, pulseras, asistentes (registros), canjes, notas y sus likes, avisos y el estado de la campana,
  instantáneas de prueba y la bitácora de esas pruebas.
- **Conserva:** **todas las cuentas** (Admin y Staff), paquetes, zonas, presbiterios, iglesias, sedes, menú, mercancía,
  beneficios, palabras bloqueadas, ajustes, fotos y la bitácora de cuentas/iglesias/ajustes. Tablas que el script no
  conoce: no se tocan. Si no hay ninguna cuenta Admin activa, se niega a limpiar. Señala (sin borrar) cuentas que
  parezcan de prueba (`demo`, `prueba`, `test`, `ejemplo`).
- ⚠ Borra **todas** las pulseras y lotes: si ya se imprimieron pulseras reales, se pierden sus QR (se pueden regresar
  con el respaldo). Hacerlo **antes** de generar los lotes definitivos.

## Fotos (platillos y mercancía, en Netlify Blobs)
Para incluirlas, poner en `.env` (ver `.env.example`): `NETLIFY_SITE_ID` y `NETLIFY_AUTH_TOKEN` (token personal de
Netlify). Sin ellas el respaldo guarda todos los datos y avisa que las fotos no se incluyeron. **Pendiente de
verificar con el servicio real de Netlify** (la lógica se probó con una tienda simulada; falta una corrida real).

## Qué hacer (en orden)
1. **Ya:** en Neon → *Branches* → crear una rama `respaldo-2026-10-06` desde `main` (copia completa e instantánea).
   Anotar aquí la ventana de restauración (*point-in-time*) que incluye el plan.
2. **Ya:** `npm run db:respaldo-total` y guardar la carpeta en un **segundo lugar** (disco externo o nube privada).
   Contiene datos personales y hashes de contraseñas: no subir a GitHub (`respaldos/` ya está en `.gitignore`).
3. **Probar la restauración una vez** contra una rama de Neon nueva (no contra producción):
   `DATABASE_URL` de la rama → `npm run db:migrar` → `npm run db:restaurar-total -- respaldos/total-XXXX`.
4. **Calendario:** respaldo total (a) hoy, (b) **vie 16 oct** por la noche, (c) **dom 18 oct** al terminar el congreso.
   Rama de Neon además antes de cada migración o limpieza.
5. **Antes del congreso (cuando se aprueben los lotes definitivos):** `npm run db:limpiar-pruebas -- --simular`, revisar,
   y luego `npm run db:limpiar-pruebas`.

## Regla
Antes de cualquier migración nueva o limpieza: rama de Neon + `db:respaldo-total`.
