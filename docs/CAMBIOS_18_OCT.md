# Cambios del 18 oct 2026 (domingo del congreso)

Resumen de lo hecho en esta jornada, qué ya está publicado y qué falta. Preparado con Claude.

## 1. Inscripción del domingo (reutilizar pulseras sin registrar)

**Motivo:** ya no se pueden imprimir más pulseras y el domingo la inscripción cuesta $30 sin beneficios.

**Qué se hizo en producción (Neon), con `scripts/db-lote-domingo.mjs`:**
- Se creó el kit **"Inscripción Domingo"**: $30.00, 0 aguas, sin beneficios, activo.
- Se movieron **299 pulseras sin registrar** (de 507 en total; 201 ya estaban registradas) de los lotes LOTE-A1…C4 al lote **`DOMINGO-1`**.
- No se tocaron: pulseras ya registradas, invalidadas, del equipo, ni las de lotes de prueba (`Lote-TEST`, `Test`, `Test-Admin`; el script ignora lotes con "test" en el código).
- Aviso: las primeras corridas del día (498 pulseras, lote `DOMINGO-2`) fueron contra la base *Wild Butterfly* cuando todavía **no era** la de producción (casi sin registros); esos datos se sobrescribieron al copiarle la producción real (ver sección 8).
- Respaldos: `respaldos/total-20261018-213749` y `respaldos/total-20261018-215156` (`npm run db:respaldo-total`, todas las tablas).

**Comandos:**
- Vista previa (no escribe): `npm run db:lote-domingo`
- Aplicar: `npm run db:lote-domingo -- --aplicar` (pide escribir `SI`; hacerlo sin demora, Neon corta la conexión inactiva)
- Deshacer (solo las que sigan sin registrar): `npm run db:lote-domingo -- --deshacer DOMINGO-1`
- Diagnóstico de solo lectura (pulseras por lote/kit/estado): `node scripts/db-diagnostico-lotes.mjs`
- Todo queda en la bitácora (`batch.reuse`, `batch.reuse_undo`; etiquetas en `shared/audit.ts`).

**Riesgo conocido:** toda pulsera sin registrar se tomó como sobrante. Si una vendida el sábado aún no se había registrado, ahora cuenta como domingo ($30, sin beneficios).

## 2. Dashboard
- Nueva tarjeta **"Inscripción Domingo"** (dinero y número de registros del kit), junto a "Valor estimado". Se muestra aunque tenga 0.
- "Valor estimado" y la tabla de kits siguen sumando todo, desglosado por kit. Es precio de lista, no dinero cobrado.
- **Avisos ocultos** (commit `519f8a7`): el bloque de alertas operativas no se muestra; para volver a verlo, quitar `false &&` en `src/admin/dashboard/Dashboard.tsx`.

## 3. Pantallas del asistente
- **Kits sin beneficios ni aguas** (Inscripción Domingo): no se muestra "Mi kit" en el inicio; en `/beneficios` dice "Tu inscripción no incluye beneficios."
- **Aguas frescas de los kits del sábado:** inactivas (vasos en gris) con el texto "Beneficio del día sábado. ¡Gracias por acompañarnos!". Es solo visual: el staff aún podría canjear desde su pantalla (la lógica del servidor no se cambió).

## 4. Tarjetas del inicio
- **Playlist:** link de Spotify configurado en `src/data/homeCards.ts` y carátula `src/assets/brand/playlist-cover.webp`.
- **Café (rediseño):** foto grande a todo el ancho (tarjeta vertical 4:5), panel de vidrio compacto con el texto y etiqueta de sede delgada arriba a la derecha del panel. Con una sola tarjeta, queda centrada.
- **Dos stands** (`CAFE_STANDS` en `src/data/homeCards.ts`): Salmos Café (12va IAFCJ) y Alfa y Omega (21ra IAFCJ).
- **Por sede:** cada asistente ve solo el stand de su sede. Sábado: todos en la 12va. Domingo: Zona 2 → 12va, Zona 1 → 21ra (`SUNDAY_VENUE_BY_ZONE`).
- **Menú:** solo platillos **disponibles de la sede del asistente**; si no hay ninguno, la sección no se muestra. Hoy solo hay comida en la 12va: dejar disponibles únicamente los platillos de la 12va en `/admin/menu`.

## 5. Estado en GitHub
- Publicado en `main`: `223aa45` (scripts del domingo, dashboard, kits sin beneficios, playlist), `02fdd2a` (café por sede, menú por sede, foto provisional de Alfa y Omega, documentación) y `519f8a7` (avisos del dashboard ocultos).
- Con este documento y el README actualizado se sube la documentación de la migración de base (sección 8).

## 6. Otros cambios del 17–18 oct (antes sin documentar)
- **Gafete (`/home`):** al voltearlo se veía el frente al revés (Safari/WebKit y `backface-visibility`). Se agregó un respaldo en `src/pages/homev2/homev2.css` que alterna la visibilidad de cada cara a mitad de la animación. Confirmado por el usuario.
- **Recursos oculto:** sin enlaces en la barra, el menú lateral ni «Más»; `/recursos` redirige a `/home`. Para reactivarlo hay comentarios en `AppShell.tsx`, `Mas.tsx` y `App.tsx`.
- **Compresor de imágenes en Mercancía:** las fotos de más de 3 MB se comprimen solas a WebP en el navegador (`src/lib/compressImage.ts`, usado por `src/admin/Merch.tsx`).
- **Secreto (solo dueño):** `/admin/secreto` con 3 botones (Kit A, Kit B, Kit Especial) que descargan `lista-<kit>-<fecha>.txt` con `Nombre completo - Iglesia`. API `GET /api/admin/secreto?kit=a|b|especial` (`403` si no es el dueño). Código: `server/secreto.ts`, `netlify/functions/admin-secreto.mts`, `src/admin/Secreto.tsx`; pruebas en `tests/team-pulse/secreto.test.mts`.
- **Ruleta de rifa (pospuesta):** prototipo hecho (`Ruleta.tsx`) pero **no está en el proyecto**; se retomará en una rama aparte (`ruleta-prueba`), solo para pruebas.

## 7. Pendientes
- **Foto de Alfa y Omega:** hoy usa una foto de **prueba** (matcha fresa, `src/assets/brand/alfa-omega-stand.webp`), no la oficial. Reemplazar ese archivo (o cambiar la importación en `CAFE_STANDS`, `src/data/homeCards.ts`) cuando llegue la real.
- **Equipo en modo visitante:** sin zona propia se toma como Zona 1 (21ra el domingo), por lo que ve Alfa y Omega y no el menú de la 12va. Decidir si el equipo debe ver todo.
- **Menú:** los asistentes de la 21ra pueden ver un instante los cuadros de carga antes de que la sección desaparezca.
- **Bloquear canje de aguas en servidor** para los kits del sábado, si se quiere (hoy solo es visual).
- Prueba con una pulsera real de domingo (registro → $30, sin aguas ni beneficios → la tarjeta del dashboard marca 1 registro).
- Otros pendientes ya conocidos: migración 011 (RateLimit) sin aplicar en Neon; quitar el `console.log` de diagnóstico en `server/db.ts`; rotar la contraseña de `.env` si se expuso.
- Quitar el carácter de prueba de la descripción de un platillo (menú) y borrar/revisar la cuenta de prueba creada el 18 oct (solo existía en la base vieja).
- **Divine Block** (proyecto «Arraigados 2K26»): dejarla unos días como respaldo y luego restablecer su contraseña o eliminarla (la cadena de conexión se compartió en un chat).
- Variables de Netlify: solo *Production* apunta a Wild Butterfly; *Deploy Previews* y *Branch deploys* siguen con su valor anterior.

## 8. Producción pasó a la base Wild Butterfly (18 oct)
**Motivo:** la base del congreso debe vivir en la cuenta del congreso (proyecto Neon «Red Juvenil Tijuana», host `ep-wild-butterfly-b4zek5ka`), no en la cuenta personal (proyecto «Arraigados 2K26», host `ep-divine-block-b5qzod6q`), que era la que usaba Netlify.

**Qué pasó:**
1. Se descubrió que los scripts (`.env` local) apuntaban a Wild Butterfly mientras Netlify usaba Divine Block; por eso el lote Domingo no se veía en el sitio.
2. Se aplicó el lote Domingo directo en Divine Block (299 pulseras → `DOMINGO-1`).
3. `npm run db:respaldo-total` de Divine Block (`respaldos/total-20261018-215156`) y `npm run db:restaurar-total -- … --reemplazar` en Wild Butterfly (conteos idénticos: 200 asistentes, 507 pulseras, 95 notas, 125 canjes, 14 lotes). Copia previa de lo que había en Wild: `respaldos/antes-de-restaurar-20261018-215315`.
4. En Netlify se cambió `DATABASE_URL` **solo en Production** y se redesplegó.
5. Verificación: tras guardar un cambio en el admin, la auditoría de Wild Butterfly subió (93) y la de Divine Block se quedó en 95.

**Limitaciones:** las fotos (platillos y mercancía) viven en Netlify Blobs y no se copian con la base. Lo que se hizo en Divine Block entre la copia y el cambio (3 acciones de prueba: avatar, cuenta y platillo) no pasó a Wild Butterfly. El `.env` local apunta ahora a producción.
