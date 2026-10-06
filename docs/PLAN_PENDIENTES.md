# Plan de lo que falta — Arraigados 2K26 (5 oct 2026)

Documento de trabajo con las decisiones del propietario y los planes de lo que quedó "por planear".
Nada de lo de las secciones 2–8 está implementado todavía (salvo donde se indica).

## 1. Estado de cada pendiente (respuestas del propietario, 5 oct 2026)

| # | Tema | Decisión / estado |
|---|---|---|
| 1–3 | Deploy de Notas, migraciones en producción, limpiar datos demo | ✅ Hecho por el propietario |
| 4 | Lista oficial de iglesias (~27 presbiterios, ~120 iglesias) | ⏳ **Pendiente** (esperando el listado) |
| 5 | Quitar "Datos de prueba" del Login | ✅ Ya no existe en el código (verificado) |
| 6 | Respaldo de la base | 📋 Plan en §2 |
| 7 | Variables de entorno en Netlify | ✅ Hecho |
| 8 | Instantáneas | 📝 **Solo documentar**: no se construirá en este proyecto (ver §8) |
| 9 | Recursos descargables | 📋 Plan en §3 |
| 10 | Programa con datos reales | ✅ `/programa` ya usa el programa oficial (`data/program.ts`, igual que `/home`) |
| 11 | Notificaciones (campana) | 🔎 A investigar — hallazgos y plan en §4 |
| 12 | Beneficios indexados por nombre | ✅ Sin cambios: los nombres de los kits **ya no cambiarán** |
| 13 | Etapa 5 – Paquetes | 📋 Definición de la versión en §5 |
| 14 | Etapa 8 – Auditoría | 📋 Diseño en §6 |
| 15 | Carrera al publicar notas | ✅ Corregido (candado por asistente, `pg_advisory_xact_lock`) |
| 16 | Retirar una nota desde Admin | ✅ Hecho (con motivo y AuditLog) |
| 17 | Lista de groserías + parte administrable | ✅ Hecho: lista ampliada y panel en Admin → Notas (`docs/MODERACION.md`) |
| 18 | Aviso de "le dio like a tu nota" | 📋 Plan en §4 |
| 19 | Rotar contraseña de Neon | Explicado al propietario (opcional) |
| 20 | Código sin uso | ✅ Documentado en `docs/CODIGO_SIN_USO.md` (no se borró nada) |
| 21 | Licencias de fuentes | Se deja como está por ahora |
| 22 | SVG pesados | ✅ `Cita_Beige.svg` y `Cita_Morado.svg`: 348 KB → 162 KB (−53 %), sin diferencia visible |
| 23 | Dos `schema.prisma` | Explicado al propietario; sin cambios |
| 24 | Detalles menores | ✅ Mensaje "72 bytes" corregido; comentario de AdminShell ya estaba bien; el bug de la contraseña ya estaba corregido (§27) |
| 25 | Pruebas automatizadas | Explicado al propietario |
| 26 | Migración a Cloudflare | Explicado al propietario; sin iniciar |

---

## 2. Respaldo de la base (punto 6) — plan

**Problema.** `npm run db:respaldo` solo respalda las tablas de *pruebas* (`Attendee`, `Batch`,
`Pulse`, `Redemption`, `Instant*` y parte de `AuditLog`) y existe para deshacer una limpieza. **No
cubre** `User`, `Package`, `Zone`, `Presbytery`, `Church`, `Note`, `NoteLike`, `BlockedWord`, `Dish`,
`Venue`, `MerchItem`, `MerchImage` ni los ajustes (que viven en `AuditLog` como `setting.update`).
Tampoco cubre las **fotos**: viven en **Netlify Blobs** (`dish-photos`, `merch-photos`), no en
Postgres.

**Propuesta (sin tocar el script actual):**
1. Nuevo `npm run db:respaldo-total` (solo lectura, `REPEATABLE READ READ ONLY`, igual que el actual):
   exporta **todas** las tablas del proyecto a `respaldos/total-AAAAMMDD-HHMM.json`, en orden de
   dependencias, con conteos verificados.
2. Nuevo `npm run db:restaurar-total` para una base **vacía** (recuperación ante desastre), en una
   transacción, pidiendo escribir `RESTAURAR`. Se prueba restaurando a una base de prueba antes de
   confiar en él.
3. **Fotos:** script que baja las fotos de Blobs a `respaldos/fotos/` (o, como alternativa, volver a
   subirlas desde las que ya tienen; hoy cada foto se sube desde Admin).
4. **Calendario sugerido:** respaldo total (a) hoy, (b) la víspera del congreso (vie 16 oct),
   (c) al terminar el domingo 18. Guardar copia fuera de la computadora (nube personal).
5. Revisar en la consola de Neon **cuánta historia** conserva el plan (restauración a un punto en el
   tiempo / ramas); es la red de seguridad principal y no cuesta nada revisarla.

Esfuerzo: ~medio día incluyendo la prueba de restauración. **Decisión necesaria:** ¿dónde guardas las
copias? (el script solo escribe en `respaldos/`, que está en `.gitignore`).

---

## 3. Recursos descargables (punto 9) — plan

Hoy `/recursos` es una maqueta (`data/app.ts` → `resources`, tres tarjetas de ejemplo con filtros
Todos / Fondos / Stickers; el botón solo simula la descarga).

**Opción A — estática (recomendada para este congreso).** Los archivos van en
`public/recursos/` (`.png`, `.jpg`, `.pdf`, `.zip`…) y una lista en el código
(`src/data/resources.ts`: título, categoría, miniatura, archivo, peso). El botón es un `<a download>`
real. Cambiar un recurso = reemplazar el archivo y hacer deploy. Sin base de datos ni Admin: lo más
simple y rápido, adecuado si son pocos (fondos de pantalla, stickers, presentaciones) y no cambian
cada día.

**Opción B — administrable.** Misma receta que Mercancía (`/admin/merch`): tabla `Resource`, archivos
en Netlify Blobs, CRUD en `/admin/recursos`, descarga por endpoint. Se justifica solo si el equipo va
a subir o cambiar archivos durante el evento sin pasar por un deploy.

**Qué necesito para empezar:** los archivos reales (o su lista), sus categorías, y elegir A o B.
Quitar la maqueta no requiere nada: mientras no haya archivos, conviene **ocultar `/recursos` del menú
"Más"** para que nadie vea contenido de ejemplo.

---

## 4. Notificaciones (puntos 11 y 18) — hallazgos y plan

### Hallazgo (verificado en el código)
La campana de `/home` (`Home.tsx`, panel "Notificaciones") muestra **3 avisos escritos a mano**, iguales
para todos: *"La plenaria está en vivo · Auditorio Principal · hasta las 21:30"*, *"Comida lista ·
Recepción Norte · 14:00-15:30"* y *"Tu kit está disponible"*. **No son reales** ("Auditorio Principal" y
"Recepción Norte" no son las sedes) y hoy los ve cualquier asistente en producción. El punto rojo de
"sin leer" también es fijo.

### Qué se puede hacer (por fases, cada una útil por sí sola)
- **Fase 0 — inmediata (5 min, sin riesgo):** dejar la campana vacía con el texto *"Por ahora no tienes
  notificaciones"* mientras se construye lo real, o quitar la campana. Evita mostrar datos falsos.
- **Fase 1 — "En vivo / Siguiente" real, sin base de datos.** `Home.tsx` ya calcula la actividad en
  curso a partir de `data/program.ts`. Esa misma lógica puede generar los avisos ("Ahora: Plenaria 1 ·
  12va IAFCJ", "En 15 min: Break").
- **Fase 2 — "A {nombre} le dio like a tu nota" (punto 18).** *No requiere tabla nueva*: los likes ya
  están en `NoteLike` (con fecha). Diseño propuesto:
  - Endpoint `GET /api/notes/likes-received` (por `x-pulse-token`): likes recibidos en tus notas de
    las últimas 24 h (y/o la nota activa), con `attendeeId` y **solo nombre de pila** de quien dio like
    (mismo nivel de privacidad que el carrusel), fecha y nota.
  - En la campana: fila con el **avatar** de quien dio like (`UserAvatar`) + ♥ + "A Ana le gustó tu
    nota". Si hay varios: "A Ana y 3 personas más les gustó tu nota" + contador.
  - **Punto de "sin leer"** real: se guarda localmente la fecha de la última vez que se abrió la
    campana (`localStorage`); todo lo posterior cuenta como nuevo (para que sea por dispositivo/cuenta
    a futuro habría que guardarlo en base de datos).
  - Se actualiza con el mismo refresco de 60 s del carrusel.
- **Fase 3 — Avisos del equipo (administrable).** Tabla `Announcement` (título, detalle, vigencia) y
  pantalla `/admin/avisos`, para mensajes tipo "Cambio de sede", "Comida lista"… Entran a la misma
  campana. Solo si el equipo realmente va a enviar avisos.

**Decisiones necesarias:** (1) ¿Fase 0 ya, quitando los avisos falsos de producción? (2) ¿Quiénes
reciben avisos del equipo: todos, o por zona/sede? (3) ¿Quieres notificación de like también como
aviso emergente (toast) o solo dentro de la campana?

---

## 5. Etapa 5 — Paquetes (punto 13): definición de la versión

**Contexto.** Los kits ya existen en Neon (`Package`: nombre, precio en centavos, `includedDrinks`,
`active`) y están **fijos** (se confirmó que no cambiarán de nombre). Hoy: Kit - A $100 (0 aguas),
Kit - B $150 (3), Especial $200 (3). Los *beneficios* son texto en el código (`packageContent`,
indexado por nombre). Lotes, asistentes, canje y Dashboard ya leen de esa tabla.

**Versión propuesta (v1): "Kits" de solo lectura, con números reales.** `/admin/paquetes` (ya está en el
menú, deshabilitada como "Etapa 5"). Una tarjeta por kit con:
- Nombre, precio, aguas incluidas y estado (activo/inactivo).
- **Contenido** del kit (el texto que ve el asistente en `/beneficios`), para revisarlo en un solo lugar.
- **Números en vivo:** pulseras impresas · sin reclamar · activas · invalidadas, asistentes registrados,
  aguas canjeadas vs. incluidas (y % de uso), ingresos esperados (precio × pulseras activas).
- Enlaces a los lotes y asistentes de ese kit (ya filtrables).

**Fuera de la v1 (a propósito):**
- **Editar precio, aguas incluidas o nombre.** Cambiar `includedDrinks` con canjes ya hechos rompe
  saldos; cambiar precio no afecta pulseras ya impresas; el nombre amarra el contenido de `/beneficios`.
  Como los kits ya no cambian, editarlos solo agrega riesgo.
- Crear/eliminar kits.
- Mover `packageContent` a la base de datos (no hace falta si el contenido no cambia).

**Esfuerzo:** ~1 día (1 endpoint `GET /api/admin/packages` con agregados SQL + pantalla; sin migración;
sin tablas nuevas). **Pregunta para cerrar la definición:** ¿la v1 de solo lectura te sirve, o necesitas
poder **activar/desactivar** un kit (por ejemplo para dejar de ofrecer uno)? Eso último es un solo
interruptor y es seguro.

---

## 6. Etapa 8 — Auditoría (punto 14): diseño

**Buena noticia:** la tabla `AuditLog` **ya existe y ya se llena**; solo falta la pantalla para verla.
Acciones que se registran hoy:

| Acción | Origen |
|---|---|
| `user.create` · `user.update` · `user.password_reset` · `user.password_change` | Usuarios y cuenta propia |
| `batch.create` | Lotes |
| `attendee.update` | Corrección de datos de un asistente (guarda antes y después) |
| `pulse.reassign` | Reemplazo de pulsera desde Staff |
| `redemption.void` | Anulación de un canje (con motivo) |
| `setting.update` | Ajustes (p. ej. avatar Blobatar/Iniciales) |
| `note.retire` · `blocked_word.add` · `blocked_word.remove` | Moderación de Notas (5 oct) |

**Pantalla `/admin/auditoria` (solo ADMIN, solo lectura):**
- Tabla **paginada en servidor** (regla global, §37): fecha y hora · quién (nombre de la cuenta) ·
  acción en español ("Anuló un canje", "Retiró una nota") · sobre qué (enlace a la ficha cuando existe).
- **Filtros:** categoría (Usuarios, Lotes, Asistentes, Pulseras, Canjes, Notas, Ajustes), persona,
  rango de fechas, búsqueda por id/texto. Orden: más reciente primero.
- **Detalle** (panel al hacer clic): el `metadata` formateado por tipo de acción (motivo, antes →
  después, texto de la nota), no JSON crudo.
- Respeta el esqueleto de carga, estado vacío y error de las demás pantallas.
- Un solo endpoint `GET /api/admin/audit` + un catálogo `acción → etiqueta/categoría` en `shared/`.

**Lo que hoy NO queda auditado** (y convendría agregar, cada uno es una línea en su función de
servidor): alta/edición/baja de **platillos** y de **mercancía**, y los **canjes** nuevos (la tabla
`Redemption` ya los guarda, pero no escriben `AuditLog`; se pueden mostrar uniendo ambas tablas).

**Esfuerzo:** ~1–1.5 días (pantalla + endpoint + catálogo; sin migración). **Decisiones:** ¿incluimos
los canjes y los cambios de menú/mercancía en la bitácora? ¿Se conserva para siempre o se purga después
del evento?

---

## 7. Orden sugerido para lo que sigue
1. **Fase 0 de notificaciones** (quitar avisos falsos de producción) — minutos.
2. **Lista de iglesias** (cuando llegue el listado) — lo más importante antes de repartir pulseras.
3. **Respaldo total** y probar la restauración — antes del 16 oct.
4. **Auditoría** (§6) y **Kits** (§5) — ambas sin migración y de bajo riesgo.
5. **Likes en la campana** (§4 fase 2) y **Recursos** (§3) según archivos disponibles.

## 8. Instantáneas (punto 8) — documentado, no se construirá
Decisión del propietario (5 oct 2026): **no se desarrollará en este proyecto**. Hoy `/instantaneas` es
una maqueta con datos de ejemplo que se pierden al recargar (`data/app.ts` → `stories`) y existen
tablas `Instant*` heredadas en Neon sin uso (`InstantConfig`, `Instant`, `InstantCredit`,
`InstantView`). El concepto correcto sería "Instants" (como Instagram), no "stories". Recomendación:
**ocultar la entrada "Instantáneas" del menú "Más"** para que nadie vea contenido falso, y dejar la
sección "Etapa 9" del Admin deshabilitada como está.

## 9. Decisiones del 5 oct 2026 (noche)
- **Campana (fase 0) HECHA:** se quitaron las 3 notificaciones inventadas y el punto rojo; el panel dice
  "Por ahora no tienes notificaciones". El sistema real de notificaciones se diseñará (§4 fases).
- **Auditoría HECHA:** `/admin/auditoria` (solo ADMIN, solo lectura; `shared/audit.ts`, `server/audit.ts`,
  `netlify/functions/admin-audit.mts`, `src/admin/Auditoria.tsx`). Nunca muestra la huella de contraseña.
  No audita aún: cambios de platillos/mercancía ni canjes nuevos.
- **Recursos:** lista **estática** en `src/data/resources.ts` (hoy vacía → "Pronto habrá recursos
  disponibles"). Para agregar: archivo en `public/recursos/` + una entrada. Sin panel admin.
- **Respaldo:** plan en `docs/PLAN_RESPALDO.md` (no hay ningún respaldo hoy). Pendiente construir scripts.
- **Iglesias:** se quedan como están hasta tener el listado nuevo.
- **Hosting:** se queda en Netlify Pro (Cloudflare no se planea). **Neon:** contraseña sin cambios por ahora.
- **Pruebas automáticas:** no urgen.
- **Menú/comidas:** se dejan estáticos por ahora (aún no hay datos reales).
- **Kits (Etapa 5):** pendiente de decidir si se quiere el resumen de solo lectura.
- **`schema.prisma`:** no borrar a ciegas ni ejecutar Prisma; esta app no lo usa.

## 10. Sistema de notificaciones — decisiones (5 oct 2026, entrevista)
- **Tipos:** likes a mi nota (agrupados: "Ana y 4 más… ❤", avatares), avisos del equipo, recordatorios del programa.
- **Avisos del equipo:** los escribe **solo Admin** en una pantalla nueva `/admin/avisos`; destino **todos, por sede o por zona**; se pueden **programar** y **retirar** (no se editan: se retira y se crea otro).
- **Recordatorios:** **automáticos** desde `data/program.ts` (ej. "En 15 min empieza…"), sin intervención.
- **Lectura:** al abrir la campana se marca todo como leído; se guarda en BD (igual en cualquier dispositivo).
- **Duración:** se conservan todo el congreso (últimas ~30 visibles).
- **Canal:** por ahora solo dentro de la app (campana). Deseo futuro: toast dentro de la app y push real al teléfono.
- **Orden:** Fase 1 avisos (tabla + admin + campana real) → Fase 2 likes agrupados → Fase 3 recordatorios automáticos + toast.
- **Por decidir al implementar:** migración (006), auditoría de `aviso.create/retire`, filtro de lenguaje en avisos, tope de longitud.

### 10.1 Estado de la Fase 1 — avisos + campana (HECHA en código, 5 oct 2026)
- **Migración nueva `006_announcements.sql`** (tablas `"Announcement"` y `"NotificationState"`). **Hay que correr `npm run db:migrar` antes de usarla.** Sin la migración la app NO se rompe: la campana queda vacía y `/admin/avisos` muestra error al listar.
- Admin: `/admin/avisos` (solo ADMIN): crear (ahora o programado, hora de Tijuana), retirar/cancelar, filtro por estado, paginado. Destino: Todos / Zona 1 / Zona 2 (el domingo la sede sale de la zona: Zona 1 → 21ra, Zona 2 → 12va).
- Asistente: campana de `/home` con avisos reales, punto rojo si hay sin leer, filas nuevas resaltadas mientras el panel está abierto; abrir la campana marca todo como leído (guardado en BD). Refresco cada minuto.
- Auditoría: `announcement.create` / `announcement.retire`, categoría "Avisos".
- Decisiones al implementar: el título (60) y mensaje (280) tienen tope; programar hasta 60 días adelante; una hora ya pasada = publicar ahora; los avisos NO pasan por el filtro de lenguaje (los escribe solo un Admin); tope de 30 notificaciones visibles.
- Probado: API (zona, programado oculto, retirado, ya-retirado, 404, 401), UI escritorio y móvil, sin migración.
- **Siguiente:** Fase 2 (likes agrupados, reutiliza `NotificationState.seenAt`) y Fase 3 (recordatorios automáticos + aviso emergente).

### 10.2 Fase 2 adelantada + plantillas (5 oct 2026, noche)
- **Likes en la campana (HECHO):** una fila por nota con quien dio el like más reciente: `[avatar con corazón] Ana le ha dado like a tu nota` / `Ana y 3 más le dieron like a tu nota`. La fila no muestra el texto de la nota (decisión del propietario, 5 oct noche); el corazón va en un círculo rojo sobre el avatar con el total de likes al lado. El avatar sigue el ajuste global (Blobatar/Iniciales). Solo se muestra el primer nombre. No genera filas por quien se da like a sí mismo.
- **"En vivo" (HECHO):** el Admin puede marcar un aviso con la etiqueta roja **EN VIVO** (migración nueva `007_announcement_live.sql`; **correr `npm run db:migrar` ANTES de publicar el código**; sin ella la campana queda vacía en vez de romper).
- **Plantillas (HECHO):** en `/admin/avisos` → Nuevo aviso hay 6 plantillas (En vivo ahora, Recordatorio, Cambio de horario, Aguas frescas, Aviso importante, Bienvenida), vista previa "Así se verá en la campana" y un panel "Cómo se ven las notificaciones" con ejemplos de aviso, En vivo, like y varios likes.
- **Pendiente (Fase 3):** recordatorios automáticos desde el programa y aviso emergente (toast).
- **Palabras bloqueadas:** lista visible/editable, probador y filtro de variantes más robusto; ver `docs/MODERACION.md`.
- **Probar los likes sin esperar a otra persona:** `npm run db:likes-demo` (no es migración; agrega likes de asistentes demo `demo-likes-*` a una nota activa que elijas; `-- --n=5` cambia la cantidad; `-- --limpiar` los borra). Requiere las migraciones 002 (Notas) y el código de la campana desplegado.

### 10.3 Likes en notas (5 oct 2026, noche) — HECHO en código
- Indicadores de like unificados con la campana (círculo rojo + corazón blanco + número); pastilla tipo Instagram sobre la burbuja; lista "quién le dio like" en la hoja de tu nota (`GET /api/notes/likers`). Detalle en `CLAUDE_HANDOFF.md` §49.
- Pendiente: Fase 3 (recordatorios automáticos del programa + toast), respaldo completo, Kits (resumen de solo lectura, sin decidir).

### 10.4 /homev2 (6 oct 2026) — HECHO en código
- Animación del gafete antes del Home (ver `CLAUDE_HANDOFF.md` §50). Pendiente de decidir: ¿una vez por sesión en lugar de siempre (`SHOW_INTRO` en `HomeV2.tsx`)?, ¿sustituir `/home` por `/homev2` cuando se apruebe?, ¿mostrar el mismo gafete en otra pantalla (p. ej. Beneficios)?

## 11. Plan — lo que sigue (6 oct 2026)
**A. Antes de desplegar (hoy)**
1. `npm run db:migrar` (aplica 007, "EN VIVO"). Sin esto la campana de avisos sale vacía en producción.
2. Crear una rama de respaldo en Neon (ver `PLAN_RESPALDO.md`): hoy NO hay respaldo.
3. `git add -A` · commit · push (Netlify despliega solo).
4. Probar en un celular real: `/homev2`, "Mi gafete" (descarga de imagen en iPhone/Safari y Android/Chrome), likes en notas y la lista de quién dio like.
5. `npm run moderacion:probar` en tu máquina.

**B. Decisiones pendientes (una línea cada una)**
- ¿`/homev2` reemplaza a `/home` al aprobarlo? ¿La animación "siempre" o "una vez por sesión" (`SHOW_INTRO` en `HomeV2.tsx`)?
- ¿"Mi gafete" también en la pantalla Beneficios?
- Kits: ¿resumen de solo lectura en Admin? (sin decidir)

**C. Construcción (en este orden)**
1. Notificaciones Fase 3: recordatorios automáticos del programa (p. ej. "Empieza el culto en 15 min") + aviso emergente (toast) en la app. Reutiliza `Announcement`/campana; el programa ya está en `src/data/program.ts`.
2. Respaldo completo: `db:respaldo-total` + restauración probada (`PLAN_RESPALDO.md`).
3. Menú de alimentos (`/comida`) con fotos y platillos reales cuando se tengan; luego `/admin/menu` ya existe para administrarlos.
4. Pruebas automáticas mínimas (no urgentes): moderación, notificaciones, QR.
5. Tras el congreso: limpiar datos de prueba (`db:limpiar-pruebas`), archivar avisos y notas.
