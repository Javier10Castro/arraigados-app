# Referencia de la API — Arraigados 2K26

Referencia **completa** de los endpoints `/api/*`. La forma exacta (campos, opcionales, uniones) de cada petición y respuesta está en TypeScript y es la **fuente de verdad**:

- [`shared/api.ts`](../shared/api.ts) — asistente, Staff, lotes, asistentes, canjes, dashboard, notas, menú, mercancía, iglesias, beneficios, kits.
- [`shared/notifications.ts`](../shared/notifications.ts) — avisos y campana.
- [`shared/audit.ts`](../shared/audit.ts) — auditoría.
- La lógica de cada endpoint vive en [`server/`](../server/) y cada ruta se declara en [`netlify/functions/`](../netlify/functions/) (`export const config = { path: ... }`).

El cliente del frontend que consume todo esto es [`src/lib/api.ts`](../src/lib/api.ts) (una función por endpoint).

---

## 1. Convenciones generales

| Tema | Regla |
|---|---|
| **Base** | `/api` en el mismo dominio que el sitio (`https://redjuveniltijuana.com/api/...`; en local `http://localhost:8888/api/...`). |
| **Formato** | JSON (`content-type: application/json`) salvo: PDF, PNG y Excel (binarios) y `multipart/form-data` en Menú y Mercancía. |
| **Idioma de errores** | Español, pensados para mostrarse tal cual al usuario. |
| **Cuerpo de error** | `{ "error": "mensaje", "status"?, "mustChangePassword"?, "code"? }` |
| **Caché** | `no-store` en todo, salvo `/api/churches` (5 min) e imágenes (caché larga: la *key* cambia al reemplazar). |
| **Fechas** | ISO 8601 en **UTC** (`2026-10-17T15:00:00.000Z`). El congreso usa la zona `America/Tijuana` para agrupar por día/hora. Los filtros `from`/`to`/`period` son `YYYY-MM-DD` en hora de Tijuana. |
| **Dinero** | **Centavos** enteros (`15000` = $150.00). |
| **Paginación** | `?page=` (desde **0**) y `?pageSize=` (**10**, 25 o 50; otro valor → 10). Respuesta: `{ total, page, pageSize, rows, ... }`. Si `page` se pasa del final, el servidor lo ajusta. |
| **Búsqueda `q`** | Cada palabra debe aparecer (sin importar mayúsculas ni acentos). |
| **Ids** | Cadenas tipo cuid (`ckeo33ijtdfczvxyqr1iuoivf`). |

### Códigos de estado

| Código | Significado |
|---|---|
| `200` / `201` | Correcto / creado. |
| `400` | Datos inválidos o regla de negocio incumplida (el mensaje dice cuál). |
| `401` | Sin sesión (`Inicia sesión.`). |
| `403` | Sin permiso (rol insuficiente, cuenta sin cambiar contraseña temporal, o acción no permitida para esa cuenta). |
| `404` | No existe. |
| `405` | Método no permitido (cabecera `allow` indica los válidos). |
| `409` | Conflicto (duplicado, pulsera en estado incompatible, migración pendiente…). |
| `422` | Moderación: la nota contiene lenguaje no permitido. |
| `500` | Error inesperado; mensaje genérico (el detalle queda en el log del servidor). |

### Autenticación

| Símbolo | Mecanismo |
|---|---|
| 🌐 | Público, sin credenciales. |
| 🎫 | **Asistente**: cabecera `x-pulse-token: <qrToken de 16 caracteres>`. La identidad sale del token; ningún endpoint acepta un id de asistente enviado por el cliente. |
| 👷 | **Staff o Admin**: cookie `arr_staff` (httpOnly, `SameSite=Lax`, firmada, 12 h) que se obtiene en `POST /api/auth/login`. |
| 🛡️ | **Solo Admin** (misma cookie, rol `ADMIN`; Staff recibe `403`). |

Cada petición con cookie **revalida en la base de datos**: cuenta activa, rol, y que la contraseña no haya cambiado. Si la cuenta usa una **contraseña temporal**, todo responde `403` con `{ "mustChangePassword": true }` excepto `/api/auth/me` y `/api/auth/password` (y `/api/auth/logout`, que no requiere sesión).

---

## 2. Público y asistente

### `GET /api/churches` 🌐
Iglesias para el formulario de registro, ordenadas, con presbiterio y zona. Caché 5 min.

### `GET /api/packages` 🌐
Kits **activos**: `[{ id, name, price, includedDrinks }]`.

### `GET /api/pulse/:token` 🌐
Estado público de una pulsera (sin datos personales). Solo acepta el `qrToken` (16 alfanuméricos), **no** el código manual.

```json
{ "status": "unclaimed", "package": { "name": "Kit - B", "price": 15000, "includedDrinks": 3 } }
```
`status`: `not_found` · `invalidated` · `active` · `unclaimed` (solo esta incluye `package`).

### `POST /api/claim` 🌐
Reclama una pulsera (registro).

```json
{ "token": "AbCdEfGh12345678", "fullName": "María López", "ageRange": "19-21", "churchId": "<id>" }
```
`ageRange` ∈ `16-18, 19-21, 22-24, 25-27, 28-30, 31-34, 35+`. Respuesta `{ "outcome": "claimed" | "already_active" | "invalidated" | "not_found" }`. Es seguro reintentar: reclamar dos veces la misma pulsera devuelve `already_active`.

### `GET /api/me` 🎫
Datos del asistente.

```json
{
  "attendee": { "id": "…", "fullName": "María López", "ageRange": "19-21",
                "churchName": "…", "presbyteryName": "…", "zoneName": "Zona 1" },
  "package": { "name": "Kit - B", "price": 15000, "includedDrinks": 3,
               "benefits": ["Bote personalizado", "Botella de agua", "Rifa categoría 2"] },
  "drinksUsed": 1, "drinksRemaining": 2
}
```
`package.benefits` viene de la tabla `PackageBenefit`; si falta la migración 008 el campo se omite y el frontend usa su lista fija.

### `GET /api/menu` 🌐
`{ "dishes": [{ id, name, description, price, venueId, venueName, imageUrl }] }` — solo platillos **disponibles**.

### `GET /api/merch` 🌐
`{ "items": [{ id, name, description, price | null, availability: "tbd"|"onsite", images: [url] }] }` — `price: null` = "Por definir".

### `GET /api/dish-image/:key` · `GET /api/merch-image/:key` 🌐
Sirven la imagen (Netlify Blobs). Caché agresiva (la `key` cambia al reemplazar la foto).

### `GET /api/settings` 🌐
`{ "avatarMode": "blobatar" | "initials" }`.

### Notas (🎫)

| Endpoint | Descripción |
|---|---|
| `GET /api/notes` | `{ notes: Note[] }` — mis notas (activas y vencidas). |
| `POST /api/notes` `{ "text": "…" }` | Publica (máx. **60** caracteres, vigente **24 h**, siempre una activa: reemplaza la anterior). `422` si hay lenguaje no permitido. → `{ note }`. |
| `DELETE /api/notes` | Quita (vence) la nota activa. → `{ "removed": 0 \| 1 }`. |
| `GET /api/notes/feed` | `{ notes: NoteFeedItem[] }` — notas vigentes públicas de **otros** (solo `firstName` y `attendeeId` para el avatar). |
| `POST /api/notes/:id/like` | Alterna like → `{ liked, likeCount }`. No se puede dar like a la propia. |
| `GET /api/notes/likers` | `{ likers: [{ attendeeId, firstName }] }` — quién dio like a mis notas. |

`Note` = `{ id, text, createdAt, expiresAt, visibility, likeCount, likedByMe }`.

### Notificaciones (🎫)

| Endpoint | Descripción |
|---|---|
| `GET /api/notifications` | `{ items, unread }` — máximo 30. Cada item es `{ kind: "announcement", id, title, body, live, at, unread }` `{ kind: "like", id, likerAttendeeId, likerFirstName, count, at, unread }` o `{ kind: "reminder", id, title, body, at, unread }` (recordatorio automático del programa: aparece 10 min antes de Bienvenida, Plenarias, Inicio de culto y Predicación, y deja de mostrarse 3 h después de que empieza; se calcula al leer, no se guarda; `PROGRAM_REMINDERS=off` lo apaga). Los avisos y la sede de los recordatorios dependen de la **zona** del asistente. |
| `POST /api/notifications/seen` | Marca todo como visto (al abrir la campana). |

---

## 3. Sesión y Staff

### `POST /api/auth/login` 🌐
```json
{ "email": "persona@redjuveniltijuana.com", "password": "********" }
```
→ `200` con `{ id, name, email, role, mustChangePassword }` y cabecera `Set-Cookie: arr_staff=…`. `401` si los datos no coinciden o la cuenta está desactivada.

### `POST /api/auth/logout` 🌐
Borra la cookie (no requiere sesión).

### `GET /api/auth/me` 👷
`{ id, name, email, role, mustChangePassword? }` — el usuario de la sesión vigente.

### `POST /api/auth/password` 👷
`{ "currentPassword": "…", "newPassword": "…" }`. Cambia la contraseña, **cierra las demás sesiones** de la cuenta y emite una sesión nueva. Es lo único permitido con contraseña temporal.

### `GET /api/staff/pulse?token=<qrToken>` o `?code=AR26-XXXXX` 👷
Consulta una pulsera por QR o código manual.
`status`: `not_found` · `unclaimed` (+`manualCode`, `packageName`) · `invalidated` · `active` (+`attendee`, `package`, `drinksUsed`, `drinksRemaining`).

### `GET /api/staff/search?q=&churchId=` 👷
Busca asistentes con pulsera **activa**: `[{ manualCode, fullName, churchName, packageName, includedDrinks, drinksRemaining }]`.

### `POST /api/staff/redeem` 👷
Descuenta exactamente 1 agua fresca.
```json
{ "manualCode": "AR26-7K3MQ", "idempotencyKey": "<uuid generado al abrir el modal>" }
```
`outcome`: `ok` (+`drinksRemaining`) · `already_processed` (misma `idempotencyKey`: **no** vuelve a descontar) · `insufficient_balance` · `pulse_not_active`. El canje queda a nombre del Staff de la **sesión**.

### `POST /api/staff/reassign` 👷
Reemplaza una pulsera: `{ "manualCode": "<actual>", "newToken": "<qrToken de la nueva>" }`.
`outcome`: `ok` (+`newCode`, `drinksUsed`, `drinksRemaining`) · `old_not_active` · `new_not_found` · `new_not_available` (+`status`) · `same_pulse` · `different_kit` (+`oldKit`, `newKit`). La actual queda `INVALIDATED`, la nueva `ACTIVE`, y se conservan las aguas ya canjeadas.

### `GET /api/staff/history` 👷
`{ rows: [{ id, createdAt, attendeeName, pulseLabel, quantity, status }] }` — **solo** los canjes del Staff de la sesión.

---

## 4. Admin 🛡️

Todos requieren cookie de **Admin**.

### 4.1 Dashboard

| Endpoint | Descripción |
|---|---|
| `GET /api/admin/dashboard` | Métricas operativas. Filtros: `period` (`all`, `today`, `yesterday` o `YYYY-MM-DD`), `zoneId`, `presbyteryId`, `churchId`, `packageId`. Devuelve `registered`, `valueCents`, `drinks{included,used,remaining}`, `kits[]`, `coverage`, `pulses{total,active,unclaimed,invalidated}`, series por hora/día, ranking y alertas (ver `DashboardResponse`). |
| `GET /api/admin/dashboard/export?format=pdf\|xlsx&...` | Mismos filtros; devuelve el **archivo** (PDF o Excel), nunca JSON salvo error. |

### 4.2 Lotes

| Endpoint | Descripción |
|---|---|
| `GET /api/admin/batches` | `{ batches: AdminBatchRow[], packages }` con conteos `total/unclaimed/active/invalidated`. |
| `GET /api/admin/batches/next-code` | `{ code, min, max }` — siguiente nombre sugerido `LOTE-AAAA-NNN`. |
| `POST /api/admin/batches` `{ code, packageId, quantity }` | Crea el lote y sus pulseras (1–500) en una transacción → `201 { id, code, quantity }`. Nombre: ≤40 caracteres, letras/números/`. _ - /` y espacios; `400` si ya existe. |
| `GET /api/admin/batches/:id?page=&pageSize=&q=&status=` | Detalle + una página de pulseras (`status` ∈ `UNCLAIMED, ACTIVE, INVALIDATED`; `q` busca token, código, nombre o número). Incluye `qrBase`. |
| `GET /api/admin/batches/:id/pdf?size=a4\|letter\|tabloid` | PDF de impresión (`application/pdf`, tarjetas de 50 × 35 mm). |
| `GET /api/admin/batches/:id/pulses/:pulseId/qr` | PNG de la tarjeta de una pulsera. `409` si está deshabilitada. |
| `DELETE /api/admin/batches/:id` `{ "confirm": "<código exacto del lote>" }` | **Borra** el lote: sus pulseras, los canjes hechos con ellas y los asistentes que solo tenían pulseras de este lote (con notas, likes y estado de campana). Los asistentes con pulsera en otro lote se conservan. Una sola transacción; auditoría `batch.delete` con los conteos. → `{ code, pulses, attendees, redemptions, notes }`. `400` si la confirmación no coincide. |

### 4.3 Asistentes

| Endpoint | Descripción |
|---|---|
| `GET /api/admin/attendees` | Filtros: `q`, `zoneId`, `presbyteryId`, `churchId`, `packageId`, `drinks` (`available` \| `exhausted` \| `none`), `page`, `pageSize`. → `{ total, page, pageSize, rows }`. |
| `GET /api/admin/attendees/catalog` | Zonas, presbiterios, iglesias y kits para los filtros. |
| `GET /api/admin/attendees/:id` | Detalle: datos, todas sus pulseras (la activa primero) y sus canjes. |
| `PATCH /api/admin/attendees/:id` `{ fullName, ageRange, churchId }` | Corrige datos (auditoría `attendee.update` con antes/después). |

### 4.4 Kits y Beneficios

| Endpoint | Descripción |
|---|---|
| `GET /api/admin/packages` | **Solo lectura.** `{ kits[], totals }`; por kit: `id, name, price, includedDrinks, active, benefits[], pulses{total,unclaimed,active,invalidated}, drinks{included,used}, expectedIncome` (precio × reclamadas). |
| `GET /api/admin/benefits` | `{ ready, labelMax, perKitMax, kits[{ id, name, price, includedDrinks, active, benefits[{ id, label }] }] }`. `ready:false` = falta la migración 008. |
| `POST /api/admin/benefits` `{ packageId, label }` | Agrega al final → `201 { id }`. Límite 80 caracteres y 20 por kit; `409` si ya existe en ese kit (sin importar mayúsculas/acentos); `404` si el kit no existe. |
| `PATCH /api/admin/benefits/:id` `{ label }` | Renombra. |
| `DELETE /api/admin/benefits/:id` | Quita el beneficio del kit. |
| `POST /api/admin/benefits/:id/reorder` `{ "dir": -1 \| 1 }` | Sube/baja una posición. |

### 4.5 Canjes

| Endpoint | Descripción |
|---|---|
| `GET /api/admin/redemptions` | Filtros: `q` (nombre), `manualCode`, `status` (`VALIDO` \| `ANULADO`), `staffId`, `from`, `to`, `page`, `pageSize`. |
| `GET /api/admin/redemptions/catalog` | `{ staff: [{ id, name }] }` para el filtro. |
| `POST /api/admin/redemptions/:id/void` `{ "reason": "…" }` | Anula (nunca borra); el motivo es **obligatorio**. `outcome`: `ok` (+`restored`) · `already_voided` · `not_found`. Devuelve el agua al saldo. |

### 4.6 Menú y Mercancía (`multipart/form-data`)

| Endpoint | Descripción |
|---|---|
| `GET /api/admin/dishes` | `{ dishes: AdminDishRow[], venues }` (todos, disponibles o no). |
| `POST /api/admin/dishes` | Auditoría `dish.create`. Campos: `name`, `description`, `price` (centavos, como texto), `available` (`true`/`false`), `venueId`, `image` (opcional; JPG/PNG/WebP ≤ 4 MB). → `{ dish }`. |
| `PATCH /api/admin/dishes/:id` | Mismos campos; `image` solo si se **reemplaza** la foto. Auditoría `dish.update` (solo los campos que cambiaron; si no cambió nada, no registra). |
| `DELETE /api/admin/dishes/:id` | Elimina el platillo y su foto. Auditoría `dish.delete`. |
| `POST /api/admin/dish-image-search` `{ query, exclude? }` | Busca una foto automáticamente (Openverse) → `{ result \| null }`. |
| `GET /api/admin/merch` | `{ items: AdminMerchItem[] }` con galería. |
| `POST /api/admin/merch` | Auditoría `merch.create`. Campos: `name`, `description`, `price` (centavos o vacío = "Por definir"), `availability` (`tbd`/`onsite`), `images` (0 o más archivos). |
| `PATCH /api/admin/merch/:id` | Igual + `removeImageIds` (JSON de ids a quitar) e `imageOrder` (JSON con el orden final; `"new:N"` = N-ésima foto nueva). Auditoría `merch.update` (solo cambios). |
| `DELETE /api/admin/merch/:id` | Elimina el artículo y sus fotos. Auditoría `merch.delete`. |
| `POST /api/admin/merch/:id/reorder` `{ "dir": -1 \| 1 }` | Mueve el artículo en la vitrina. |

### 4.7 Notas y moderación

| Endpoint | Descripción |
|---|---|
| `GET /api/admin/notes` | Filtros: `q`, `status` (`ACTIVA` \| `VENCIDA`), `zoneId`, `presbyteryId`, `churchId`, `likes` (`with` \| `without`), `from`, `to`, `sort` (`recent` \| `likes`), `page`, `pageSize`. Incluye `summary`. |
| `POST /api/admin/notes/:id/retire` `{ "reason": "…" }` | Retira una nota activa (queda vencida; se registra). `outcome`: `ok` · `not_found` · `already_expired`. |
| `GET /api/admin/blocked-words` | `{ words, max }` (se suman a la lista fija de `shared/moderation.ts`). |
| `POST /api/admin/blocked-words` `{ "word": "…" }` | → `{ outcome: "ok" \| "exists", word }`. |
| `PATCH /api/admin/blocked-words/:id` `{ "word": "…" }` · `DELETE …/:id` | Corregir / quitar. |

### 4.8 Avisos

| Endpoint | Descripción |
|---|---|
| `GET /api/admin/announcements?status=&page=&pageSize=` | `status` ∈ `PROGRAMADO, PUBLICADO, RETIRADO`. Incluye `summary`. |
| `POST /api/admin/announcements` | `{ title (≤60), body (≤280), audience: "ALL" \| "Zona 1" \| "Zona 2", live?, publishAt? (ISO UTC; vacío = ahora) }` → `{ id, status }`. |
| `POST /api/admin/announcements/:id/retire` | `outcome`: `ok` · `already_retired`. |

### 4.9 Iglesias

| Endpoint | Descripción |
|---|---|
| `GET /api/admin/churches` | `{ churches[{ id, name, presbyteryId, presbyteryName, zoneName, attendees }], presbyteries[{ id, name, zoneName }], nameMax }`. |
| `POST /api/admin/churches` `{ name, presbyteryId }` | Agrega → `201`. Nombre único dentro del presbiterio. |
| `PATCH /api/admin/churches/:id` `{ name, presbyteryId }` | Renombra y/o la mueve de presbiterio (solo uno). |
| `DELETE /api/admin/churches/:id` | Solo si **no tiene asistentes**. |

Presbiterios y zonas son **fijos** (no hay endpoints para modificarlos).

### 4.10 Usuarios

| Endpoint | Descripción |
|---|---|
| `GET /api/admin/users` | `[{ id, name, email, role, active, createdAt, pendingPassword, protected }]`. `protected: true` = cuenta protegida (nunca eliminable). |
| `POST /api/admin/users` `{ name, email, role: "ADMIN"\|"STAFF", temporaryPassword }` | Crea la cuenta con contraseña **temporal** (8 a 72 bytes) → `201 { id }`. |
| `PATCH /api/admin/users/:id` `{ name?, role?, active? }` | No puedes quitarte el rol ni desactivarte; siempre debe quedar un Admin activo. |
| `POST /api/admin/users/:id/password` `{ temporaryPassword }` | Restablece (nueva temporal) y cierra las sesiones de esa cuenta. |
| `DELETE /api/admin/users/:id` | **Elimina** la cuenta. `400` si es la cuenta protegida, la propia, el último Admin activo, o si tiene historial que la referencia (en ese caso: desactívala). Auditoría `user.delete`. |

### 4.11 Auditoría

| Endpoint | Descripción |
|---|---|
| `GET /api/admin/audit` | Filtros: `q`, `category` (`usuarios, lotes, asistentes, pulseras, canjes, notas, avisos, iglesias, beneficios, menu, mercancia, ajustes, otros`), `actorId`, `from`, `to`, `page`, `pageSize`. → `{ total, page, pageSize, rows, summary{total,last24h,actors}, actors[] }`. Cada fila: `{ id, createdAt, action, entityType, entityId, entityName, entityEmail, entityCode, relatedCode, actorId, actorName, metadata }` (la huella `fp` de contraseñas nunca se devuelve). `entityName/entityEmail/entityCode/relatedCode` salen de uniones con las tablas actuales y solo sirven de **respaldo** para registros viejos; los registros nuevos guardan los nombres y códigos en `metadata`, así que el historial se lee igual aunque el elemento ya no exista. Los textos en español («Desactivó la cuenta…», «Reemplazó la pulsera de…») se arman en `shared/audit.ts` (`auditSummary`, `auditDetails`, `auditTarget`). |

Acciones registradas (`action`): `user.create/update/password_reset/password_change/delete`, `batch.create/delete`, `attendee.update`, `pulse.reassign`, `redemption.void`, `note.retire`, `blocked_word.add/update/remove`, `announcement.create/retire`, `church.create/update/delete`, `benefit.create/update/delete/move`, `setting.update`. (Menú y Mercancía no registran bitácora.)

### 4.12 Ajustes

| Endpoint | Descripción |
|---|---|
| `GET /api/admin/settings` | Igual que `/api/settings`. |
| `PATCH /api/admin/settings` `{ "avatarMode": "blobatar" \| "initials" }` | Cambia el modo de avatar para toda la app (auditoría `setting.update`). |

---

## 5. Ejemplos completos (curl)

```bash
# 1) Iniciar sesión y guardar la cookie
curl -i -c cookies.txt -H 'content-type: application/json' \
  -d '{"email":"admin@ejemplo.com","password":"********"}' \
  https://redjuveniltijuana.com/api/auth/login

# 2) Crear un lote de 50 pulseras del kit indicado
curl -b cookies.txt -H 'content-type: application/json' \
  -d '{"code":"LOTE-2026-001","packageId":"<id del kit>","quantity":50}' \
  https://redjuveniltijuana.com/api/admin/batches

# 3) Descargar el PDF de impresión en tamaño Carta
curl -b cookies.txt -o lote-001.pdf \
  'https://redjuveniltijuana.com/api/admin/batches/<id>/pdf?size=letter'

# 4) Registro de un asistente (público)
curl -H 'content-type: application/json' \
  -d '{"token":"AbCdEfGh12345678","fullName":"María López","ageRange":"19-21","churchId":"<id>"}' \
  https://redjuveniltijuana.com/api/claim

# 5) Datos del asistente con su pulsera
curl -H 'x-pulse-token: AbCdEfGh12345678' https://redjuveniltijuana.com/api/me

# 6) Canjear un agua (Staff)
curl -b cookies.txt -H 'content-type: application/json' \
  -d '{"manualCode":"AR26-7K3MQ","idempotencyKey":"7b0c6f3e-2a10-4a55-9d0e-0d6f2f5b9c11"}' \
  https://redjuveniltijuana.com/api/staff/redeem
```

> En PowerShell usa `curl.exe` (no el alias `curl`) o `Invoke-RestMethod`. Las comillas simples de los ejemplos son de bash.

---

## 6. Mantener esta referencia al día

Al agregar o cambiar un endpoint:
1. Escribe el archivo en `netlify/functions/` con su comentario de cabecera (método, ruta, quién puede, qué hace).
2. Agrega los tipos en `shared/*.ts` y la función en `src/lib/api.ts`.
3. Si es una acción del equipo, regístrala en la bitácora (`shared/audit.ts` define su etiqueta).
4. Actualiza esta página y la tabla de la sección 10 del [`README`](../README.md), y deja constancia en `docs/CLAUDE_HANDOFF.md`.
