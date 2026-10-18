# Cambios del 18 oct 2026 (domingo del congreso)

Resumen de lo hecho en esta jornada, qué ya está publicado y qué falta. Preparado con Claude.

## 1. Inscripción del domingo (reutilizar pulseras sin registrar)

**Motivo:** ya no se pueden imprimir más pulseras y el domingo la inscripción cuesta $30 sin beneficios.

**Qué se hizo en Neon (datos reales), con `scripts/db-lote-domingo.mjs`:**
- Se creó el kit **"Inscripción Domingo"**: $30.00, 0 aguas, sin beneficios, activo.
- Se movieron **498 pulseras sin registrar** de los lotes LOTE-A1…C4 al lote **`DOMINGO-2`**.
- No se tocaron: pulseras ya registradas, invalidadas, del equipo, ni las de lotes de prueba (`Lote-TEST`, `Test-Admin`; el script ignora lotes con "test" en el código).
- `DOMINGO-1` quedó **vacío** (se aplicó y se deshizo por error; ya no se usa). Se puede borrar desde Admin → Lotes.
- Respaldo previo: `npm run db:respaldo` (archivo en `respaldos/`; solo cubre pulseras, asistentes, canjes, etc., no la tabla de kits).

**Comandos:**
- Vista previa (no escribe): `npm run db:lote-domingo`
- Aplicar: `npm run db:lote-domingo -- --aplicar` (pide escribir `SI`; hacerlo sin demora, Neon corta la conexión inactiva)
- Deshacer (solo las que sigan sin registrar): `npm run db:lote-domingo -- --deshacer DOMINGO-2`
- Diagnóstico de solo lectura (pulseras por lote/kit/estado): `node scripts/db-diagnostico-lotes.mjs`
- Todo queda en la bitácora (`batch.reuse`, `batch.reuse_undo`; etiquetas en `shared/audit.ts`).

**Riesgo conocido:** toda pulsera sin registrar se tomó como sobrante. Si una vendida el sábado aún no se había registrado, ahora cuenta como domingo ($30, sin beneficios).

## 2. Dashboard
- Nueva tarjeta **"Inscripción Domingo"** (dinero y número de registros del kit), junto a "Valor estimado". Se muestra aunque tenga 0.
- "Valor estimado" y la tabla de kits siguen sumando todo, desglosado por kit. Es precio de lista, no dinero cobrado.

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
- **Ya publicado** (commit `223aa45` en `main`): scripts del domingo, `shared/audit.ts`, `package.json`, tarjeta del dashboard, "Mi kit" oculto y aguas inactivas, link y carátula de la playlist.
- **Pendiente de subir** (hechos después): rediseño del café, filtro por sede de café y menú, nueva foto de Salmos Café y este documento.
  Archivos: `src/data/homeCards.ts`, `src/assets/brand/alfa-omega-stand.webp`, `src/pages/home/CafeStandCard.tsx`, `src/pages/home/CafeStandCard.module.css`, `src/pages/home/Home.tsx`, `src/pages/home/MenuCarousel.tsx`, `src/assets/brand/salmos-stand.webp`, `docs/CAMBIOS_18_OCT.md`.

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
