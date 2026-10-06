# Código y archivos que hoy NO se usan

> Revisado el 5 oct 2026 (actualizado en la noche) buscando cada archivo/exportación en todo `src/`, `server/`, `shared/` y
> `netlify/`. **Nada de esto se borró**: es solo el inventario para limpiar con calma (cada punto se
> puede borrar por separado; `npm run build` avisa si algo sí se usaba).

## 1. Archivos de código sin ningún `import`
| Archivo | Peso | Nota |
|---|---|---|
| `src/components/Wallpaper.tsx` | 11 KB | Fondo antiguo. Solo lo nombra un comentario de `global.css`. |
| `src/data/churches.ts` | 15 KB | Lista de iglesias vieja; la real viene de Neon (`/api/churches`). |
| `src/pages/Inicio.tsx` + `Inicio.module.css` | 4 KB + 4 KB | Pantalla anterior; `/inicio` redirige a `/home`. Contiene las notificaciones de relleno ("Auditorio Principal"). `Home.module.css` es copia de este CSS, así que borrar `Inicio.*` no afecta a `/home`. |
| `src/pages/menu-preview/*` + `src/data/menuPreview.ts` + ruta `/menu-preview` en `App.tsx` | ~20 KB | Maqueta con datos ficticios del menú. El menú real vive en `pages/home/MenuCarousel.tsx` y `admin/Menu.tsx`. **Conservar `components/AvailabilityStatus.tsx`** (lo usa Admin → Menú). Al borrar la ruta, quitar también su `import` en `App.tsx`. |

## 2. Imágenes y recursos sin referencia
| Archivo | Peso | Nota |
|---|---|---|
| `src/assets/img/merch-{pulsera,stickers,tote,vaso}.webp` | 112 KB | Quedaron huérfanas al borrar `data/merch.ts`; la mercancía real está en Netlify Blobs. |
| `src/assets/brand/logo.png` | **631 KB** | Sin referencia. |
| `src/assets/brand/flyer-bg.webp`, `flyer-bg-wide.webp` | 135 KB | Sin referencia (sí se usan `flyer-contours`, `flyer-texture` y `flyer-shapes`). |
| `src/assets/img/avatar.webp` | 10 KB | Sin referencia. |
| `src/assets/img/{fondos,stickers,presentaciones}.webp` | — | Fotos de las tarjetas de ejemplo de `/recursos`, ya eliminadas (5 oct). Reutilizables como `thumb` cuando haya recursos reales (`data/resources.ts`). |
| `public/rcs/svg_editables/Cita_Morado.svg` | 162 KB | Sin referencia (se usa `Cita_Beige.svg`). |
| `public/rcs/fonts/` — Degular Demo, la mayoría de Pressio y de Antarctican | ver `CLAUDE_HANDOFF.md` §45 | Solo se cargan Antarctican Book/Bold/Black/Ultrabold, Pressio `No.35` y Degular Text Regular/Semibold/Bold. Ojo con las **licencias** antes de hacer público el repo. |

> Las imágenes de `src/assets` que no se importan **no entran al build** (Vite solo empaqueta lo
> importado), así que no pesan para el usuario: es limpieza del repositorio, no de rendimiento.

## 3. Datos de ejemplo en `src/data/app.ts` que ya nadie lee
(`resources` ya se eliminó: `/recursos` lee `data/resources.ts`.) `schedule` (ya no lo usa `/programa`, que desde el 5 oct lee `data/program.ts`), `nowEvent`
(solo se nombra en un comentario de `Home.tsx`) y el tipo `EventItem`. **Siguen en uso:**
`upcomingEvents` (lo importa `Home.tsx` aunque `SHOW_UPCOMING_EVENTS = false` lo oculta; si se borra,
quitar también esa sección y `EventCard`), `foodDays`/`foodMenu` (`/comida`), `stories`
(`/instantaneas`), `eventInfo`, `packageContent`, `packagesPreview`.

## 3b. Pantallas que existen pero muestran contenido de ejemplo o están apagadas
| Qué | Estado |
|---|---|
| `/instantaneas` (`pages/Instantaneas.tsx`, `data/app.ts` → `stories`) | Maqueta: las "stories" son de mentira y se pierden al recargar. Decisión: no se desarrolla; conviene ocultar la entrada del menú "Más". |
| Tablas `Instant*` en Neon (`InstantConfig`, `Instant`, `InstantCredit`, `InstantView`) | Heredadas del proyecto anterior, sin uso. No borrar sin respaldo. |
| Admin → **Kits** (Etapa 5) y **Instantáneas** (Etapa 9) | Aparecen en el menú pero deshabilitadas ("Etapa 5/9"). Kits está pendiente de decidir; Instantáneas no se hará. |
| `/comida` (`foodDays`/`foodMenu` en `data/app.ts`) | Estático a propósito hasta tener el menú real (Admin → Menú ya funciona con datos reales). |
| `SHOW_UPCOMING_EVENTS = false` en `Home.tsx` | La sección "Próximos eventos" de `/home` está apagada; sus datos (`upcomingEvents`) y `EventCard` siguen en el código. |
| `/recursos` | Funciona, pero `data/resources.ts` está vacío hasta tener archivos. |
| Datos de `data/app.ts`: `schedule`, `nowEvent`, tipo `EventItem` | Sin ningún lector (ver §3). |
| Tablas/columnas nuevas | Todas se usan: `Note`, `NoteLike`, `BlockedWord`, `Announcement`, `NotificationState`. |

## 3c. Limpieza del 5 oct (noche)
- Se quitó de `Home.module.css` el CSS de las filas antiguas de la campana (`.panelItem/.panelIcon/.panelBody/.panelLive`); ahora las pinta `components/notifications/NotificationRow`.
- `api/merch-image/:key` no se llama desde el cliente a propósito: el servidor arma esas URLs en las respuestas de mercancía (sí se usa).

## 4. Ya resuelto (no hay que hacer nada)
- `src/context/AuthContext.tsx` (con contraseñas demo en texto plano) **ya no existe**.
- El recuadro "Datos de prueba" del Login **ya no existe**.
- `waves.html` y `src/data/merch.ts` ya se borraron (§45 del handoff).

## 5. Por limpiar fuera del repo (no es código)
- Cuentas/lotes/asistentes de prueba en Neon: `TEST-*` (6 lotes) y los asistentes demo
  (`npm run db:notas-demo -- --limpiar`).
- Los respaldos locales de `respaldos/` (están en `.gitignore`).
