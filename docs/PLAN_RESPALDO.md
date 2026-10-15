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

## Fotos de perfil (store `profile-photos`): respaldo, limpieza y recuperación (14 oct 2026)
**Estado honesto:** la limpieza al borrar asistentes está implementada y probada con un almacén simulado; el **respaldo de las fotos de perfil NO existe** y la conexión real a Blobs/Neon **no se ha probado**.

### Qué contienen hoy los respaldos
| | ¿Incluido en `db:respaldo-total`? |
|---|---|
| Tabla `AttendeeProfile` (`kind`, `avatarId`, `initialsId`, `photoKey`, `updatedAt`) | **Sí** (el respaldo descubre todas las tablas) |
| **Archivos** de las fotos de perfil (`profile-photos`) | **No.** `FOTO_STORES` (`scripts/_respaldo.mjs`) solo lista `dish-photos` y `merch-photos` |
Al restaurar, las filas vuelven con su `photoKey`: si el archivo sigue en Blobs la foto reaparece; si ya se borró, la app lo tolera (se ve como iniciales/avatar, sin imagen rota) y la foto **no se puede recuperar**. **No se ha verificado ninguna recuperación de fotos de perfil.**

### Cómo se limpian las fotos
| Acción | Qué pasa con el archivo |
|---|---|
| Subir otra foto / «Eliminar mi foto» / moderación del Admin | Se borra el anterior **después** de actualizar la fila |
| **Desvincular pulsera** (`releasePulse`) y **borrar lote** (`deleteBatch`) | Se leen las llaves **dentro de la transacción, antes del DELETE** (la fila se borra en cascada) y los archivos se borran **después del COMMIT**. Si la transacción se revierte no se borra nada |
| `db:limpiar-pruebas` | **No** borra archivos (avisa al terminar). Usar `db:fotos-huerfanas` |

### Si la base confirma y falla el borrado en Blobs
- La operación del usuario/Admin **termina bien** (no se revierte). El archivo queda **huérfano**: sin fila que lo apunte; nadie puede pedirlo salvo con una URL firmada ya emitida (válida hasta 24–48 h; después, inaccesible pero **sigue almacenado**).
- Se registra en los logs de la función (Netlify → Logs → Functions) una línea `[profile:huerfana] key=<llave> no se pudo borrar de Blobs: <motivo>`. No incluye tokens, URLs firmadas ni nombres.
- **No hay cola persistente**: no se reintenta solo. Es una limitación real (ver propuesta abajo).

### Identificar y reintentar de forma segura
```
npm run db:fotos-huerfanas             # SOLO LEE: lista huérfanas, referencias rotas y archivos recientes
npm run db:fotos-huerfanas -- --borrar # pide escribir BORRAR y elimina solo las huérfanas
```
- Necesita `DATABASE_URL`, `NETLIFY_SITE_ID` y `NETLIFY_AUTH_TOKEN` en el `.env` local (git lo ignora). El token **no se imprime** ni se guarda. Apúntalo al sitio/rama de **pruebas** antes de usarlo en producción.
- Seguridad: solo toca llaves con el formato de este módulo (`<id>-<18 hex>.jpg`); nunca una llave que alguna fila apunte; no borra nada de **menos de 1 h** (puede haber una subida en curso); informa las filas cuyo archivo no existe sin tocarlas. Repetirlo es seguro.
- ⚠️ **Probado solo la lógica de clasificación** (pruebas unitarias); **no** contra Blobs ni Neon reales.
- ⚠️ Como estas fotos no están respaldadas, **no lo corras con `--borrar` mientras pienses restaurar** un respaldo anterior a una limpieza: perderías las fotos para siempre.

### Respaldar y restaurar fotos sin hacerlas públicas ni exponer credenciales — PROPUESTA (no implementada ni probada)
1. Agregar `profile-photos` a `FOTO_STORES`: `respaldarFotos`/`restaurarFotos` ya copian a `respaldos/fotos/<store>/` con huella SHA-256 y usan el token personal del `.env`.
2. El store sigue **privado**; la carpeta `respaldos/` está en `.gitignore` y contendría datos personales (fotos): guardarla fuera de la computadora en un lugar privado, **nunca** en un repositorio, correo o chat. Nunca pegar `NETLIFY_AUTH_TOKEN` en commits, logs ni capturas.
3. Probar una restauración real en un sitio/rama de pruebas **antes** de afirmar que están respaldadas. Decisión pendiente del propietario (ver `PLAN_PENDIENTES.md`).

### Verificaciones antes de desplegar el perfil
1. Rama de Neon nueva → `DATABASE_URL` de la rama → `npm run db:migrar` → comprobar `AttendeeProfile` (columna `initialsId` y restricción `AttendeeProfile_consistent`).
2. Despliegue de prueba en Netlify (deploy preview/sitio de pruebas) con esa base: `SESSION_SECRET` ≥ 32 caracteres.
3. `npx tsc --noEmit` y `npm run build` sin errores.
4. Pruebas manuales con servicios reales (README §7.4): foto real de celular, cambiar a Avatar (queda «Guardada»), eliminar, ver el perfil en otro dispositivo, Admin → Quitar foto, **desvincular una pulsera de prueba y confirmar en Netlify (Blobs → `profile-photos`) que el archivo desaparece**, y el mensaje «Espera N s» al guardar dos veces seguidas.
5. Tras las pruebas, buscar en los logs de funciones `[profile:huerfana]` y `[me] no se pudo leer el perfil`: no deben aparecer.
6. `npm run db:fotos-huerfanas` (sin `--borrar`) debe decir «Nada que limpiar».
7. Respaldo total + rama de Neon, y solo entonces aplicar 009 y 010 en producción **antes** de desplegar el código.

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
