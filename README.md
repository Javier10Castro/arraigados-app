# Arraigados 2K26

App web oficial del **Congreso Juvenil Arraigados 2K26** — Red Juvenil Tijuana, **17 y 18 de octubre de 2026** — en **redjuveniltijuana.com**.

Cada asistente recibe una **pulsera con un código QR**. Con ella se registra desde su celular, ve su kit, el programa, el menú de alimentos y la mercancía; el equipo (Staff) **escanea la pulsera para canjear aguas frescas** y el equipo de coordinación (Admin) administra todo desde un panel.

> Este documento explica **todo el proyecto** para que cualquier persona (aunque no lo haya visto antes) pueda entenderlo, instalarlo, operarlo y mantenerlo. Está en español porque el equipo lo es. El detalle fino y la historia de cada decisión están en [`docs/`](docs/) (empieza por [`docs/CLAUDE_HANDOFF.md`](docs/CLAUDE_HANDOFF.md)); la referencia completa de la API está en [`docs/API.md`](docs/API.md).

---

## Índice

1. [Qué hace la app](#1-qué-hace-la-app)
2. [Conceptos clave (glosario)](#2-conceptos-clave-glosario)
3. [Tecnología y arquitectura](#3-tecnología-y-arquitectura)
4. [Estructura de carpetas](#4-estructura-de-carpetas)
5. [Puesta en marcha (desarrollo)](#5-puesta-en-marcha-desarrollo)
6. [Variables de entorno](#6-variables-de-entorno)
7. [Base de datos](#7-base-de-datos)
8. [Roles, sesiones y seguridad](#8-roles-sesiones-y-seguridad)
9. [Pantallas (rutas del frontend)](#9-pantallas-rutas-del-frontend)
10. [API (resumen)](#10-api-resumen)
11. [Reglas de negocio importantes](#11-reglas-de-negocio-importantes)
12. [Scripts de npm](#12-scripts-de-npm)
13. [Respaldo, limpieza y entrega del evento](#13-respaldo-limpieza-y-entrega-del-evento)
14. [Despliegue](#14-despliegue)
15. [Cómo se hace… (guía de operación)](#15-cómo-se-hace-guía-de-operación)
16. [Solución de problemas](#16-solución-de-problemas)
17. [Documentación adicional](#17-documentación-adicional)

---

## 1. Qué hace la app

### Para el asistente (sin cuenta, solo con su pulsera)
- **Registro**: escanea el QR de su pulsera (`/p/<token>`), escribe su nombre, rango de edad e iglesia y queda registrado.
- **Home** (`/home`): animación de bienvenida con su gafete, tarjeta **"Ahora"** en vivo según el programa, carrusel de **notas** de la comunidad, menú de alimentos, mercancía oficial y su kit.
- **Mi kit / Beneficios** (`/beneficios`): qué incluye su kit y cuántas **aguas frescas** le quedan.
- **Programa** (`/programa`): horario oficial del sábado y domingo (la sede del domingo depende de su zona).
- **Notas**: publica una frase de hasta 60 caracteres que dura 24 horas; da *like* a las de otros.
- **Campana de notificaciones**: avisos del equipo y likes recibidos.
- **Comida** (`/comida`), **Recursos**, **Más**.

### Para el Staff (cuenta con correo y contraseña)
- **Escanear** la pulsera con la cámara (o escribir el código de respaldo `AR26-XXXXX`) y ver los datos y el saldo de aguas del asistente.
- **Canjear** 1 agua fresca (protegido contra doble toque: nunca descuenta dos veces).
- **Buscar** asistentes por nombre/iglesia, **reemplazar una pulsera** (perdida/dañada) y ver **"Mis canjes recientes"**.

### Para el Admin (panel `/admin`)
| Sección | Qué permite |
|---|---|
| **Dashboard** | Métricas operativas en vivo (registros, canjes, alertas) con filtros por día/zona/presbiterio/iglesia/kit y **exportación a PDF y Excel**. |
| **Lotes** | Crear lotes de 1 a 500 pulseras de un kit, descargar el **PDF de impresión** (A4/Carta/11×17) o el QR suelto, y **borrar** un lote. |
| **Asistentes** | Buscar/filtrar, ver el detalle (pulseras, canjes) y **corregir** nombre, edad o iglesia. |
| **Kits** | Consulta de solo lectura: precio, aguas incluidas, pulseras impresas/reclamadas, uso de aguas e ingreso esperado. |
| **Beneficios** | Administrar lo que **incluye** cada kit (agregar, renombrar, quitar, reordenar). |
| **Canjes** | Historial de canjes con filtros; **anular** un canje (nunca se borra). |
| **Menú** | CRUD de platillos con foto, precio, sede y disponibilidad. |
| **Mercancía** | CRUD de artículos con galería de fotos y orden de la vitrina. |
| **Notas** | Moderación: ver, filtrar y **retirar** notas; administrar **palabras bloqueadas**. |
| **Avisos** | Publicar avisos (ahora o programados, con etiqueta "EN VIVO") para todos o por zona. |
| **Iglesias** | Agregar, renombrar, mover de presbiterio o eliminar iglesias (presbiterios y zonas son fijos). |
| **Usuarios** | Crear cuentas (Admin/Staff) con contraseña temporal, editar, desactivar, restablecer contraseña y **eliminar** cuentas. |
| **Auditoría** | Bitácora de todo lo que hace el equipo, con filtros. |

---

## 2. Conceptos clave (glosario)

| Término | Significado |
|---|---|
| **Kit** (antes "paquete") | Lo que compra el asistente: **Kit - A** ($100, sin aguas), **Kit - B** ($150, 3 aguas), **Especial** ($200, 3 aguas). Son fijos. En la base se llama `Package`; los precios se guardan en **centavos**. |
| **Beneficios** | Texto de lo que incluye cada kit ("Bote personalizado", "Tote bag"…). Se administran en Admin → Beneficios (tabla `PackageBenefit`). |
| **Pulsera** (`Pulse`) | Pulsera física con QR. Estados: `UNCLAIMED` (sin reclamar), `ACTIVE` (reclamada por un asistente), `INVALIDATED` (deshabilitada/reemplazada). |
| **Lote** (`Batch`) | Grupo de pulseras del mismo kit generado de una vez (código `LOTE-AAAA-NNN`). |
| **Token** (`qrToken`) | 16 caracteres alfanuméricos dentro del QR (`/p/<token>`). Es la "llave" del asistente. |
| **Código manual** | `AR26-XXXXX` impreso en la pulsera; **solo lo usa el Staff** como respaldo si el QR no se puede escanear. |
| **Canje** (`Redemption`) | Una agua fresca entregada. Se **anula**, nunca se borra. |
| **Zona / Presbiterio / Iglesia** | Jerarquía de la Red Juvenil. La **zona** decide la **sede del domingo** (Zona 1 → 21ra IAFCJ, Zona 2 → 12va IAFCJ). |
| **Sede** (`Venue`) | 12va IAFCJ o 21ra IAFCJ; el menú de alimentos es por sede. |
| **Nota** | Frase pública de 60 caracteres, 24 h de vida, una activa por persona. |
| **Aviso** (`Announcement`) | Mensaje del equipo que aparece en la campana. |
| **Cuenta dueña** | `javiercastro9912@gmail.com`: la única que puede **vaciar la bitácora** y que **nunca se puede eliminar** (ver §8). |

---

## 3. Tecnología y arquitectura

```text
┌──────────────────────────────┐
│  React 18 + Vite 5 + TS      │   src/        (CSS Modules, React Router 6)
└──────────────┬───────────────┘
               │  fetch('/api/...')   (mismo dominio, cookies httpOnly)
               ▼
┌──────────────────────────────┐
│  Netlify Functions (.mts)    │   netlify/functions/   (una función por ruta /api/*)
│  lógica en server/           │   contrato de tipos en shared/
└───────┬──────────────┬───────┘
        ▼              ▼
  Neon PostgreSQL   Netlify Blobs
  (driver `pg`)     (fotos de Menú y Mercancía)
```

- **Frontend:** React 18, TypeScript, Vite 5, React Router 6, CSS Modules, `lucide-react` (íconos), `html5-qrcode` (cámara), `blobatar` (avatares).
- **Backend:** Netlify Functions (Node 20, esbuild). Cada archivo de `netlify/functions/` declara su ruta con `export const config = { path: ... }`. La lógica vive en `server/`, para que las funciones sean delgadas.
- **Base de datos:** Neon (PostgreSQL) con el driver `pg` y SQL directo (sin ORM). El esquema original viene de una app **Next.js/Prisma hermana** que **comparte la misma base**: por eso este proyecto **nunca altera tablas existentes** y todas las migraciones propias son aditivas e idempotentes.
- **Archivos:** fotos de platillos y mercancía en **Netlify Blobs** (stores `dish-photos` y `merch-photos`).
- **Contrato de tipos:** `shared/` contiene los tipos que comparten servidor y cliente (`shared/api.ts` es la **fuente de verdad de la forma de cada petición y respuesta**).
- **PDF/Excel:** `pdf-lib` (PDF de pulseras y reportes), `xlsx` (exportación del Dashboard), `qrcode`/`pngjs` (QR).

---

## 4. Estructura de carpetas

```text
arraigados-app/
├── src/                      Frontend (React)
│   ├── App.tsx               ÚNICA fuente de rutas
│   ├── pages/                Pantallas del asistente (Home, Programa, Beneficios, Comida…)
│   │   ├── home/             Home clásico (/homev2) y sus carruseles
│   │   └── homev2/           Home principal (/home) con animación de gafete
│   ├── admin/                Panel de Admin (Dashboard, Lotes, Kits, Usuarios, Auditoría…)
│   ├── components/           Componentes compartidos (Button, Pagination, Skeleton…)
│   ├── data/                 Datos estáticos (program.ts = programa oficial, app.ts)
│   └── lib/api.ts            Cliente HTTP: una función por endpoint
├── netlify/functions/        Backend: un archivo .mts por endpoint /api/*
├── server/                   Lógica del backend (db, auth, batches, users, audit, benefits…)
├── shared/                   Tipos y constantes compartidos cliente/servidor
├── migrations/               Migraciones SQL propias (001–008), idempotentes
├── scripts/                  Utilidades de base de datos (migrar, respaldo, limpieza…)
├── docs/                     Documentación detallada y planes
├── public/                   Archivos estáticos
├── netlify.toml              Build, funciones, redirect SPA, cabeceras de seguridad
├── .env.example              Plantilla de variables de entorno
└── package.json
```

---

## 5. Puesta en marcha (desarrollo)

**Requisitos:** Node.js 20+, npm y una base **Neon PostgreSQL** (con el esquema base ya creado por la app hermana).

```bash
npm install
cp .env.example .env          # PowerShell:  Copy-Item .env.example .env
# edita .env (ver sección 6)
npm run db:migrar             # aplica las migraciones propias (idempotente)
npm run dev                   # http://localhost:8888
```

- Usa **siempre** `http://localhost:8888` (Netlify Dev: frontend + funciones juntos), no el 5173.
- `npm run dev:vite` levanta solo el frontend (sin `/api`). `npm run dev:https` sirve con certificado local para probar la **cámara** desde un celular.
- Primera vez: Netlify CLI puede preguntar por enlazar un sitio; no es necesario para trabajar en local.
- La primera cuenta Admin debe existir ya en la tabla `User` (la crea la app hermana/seed). Desde ahí, el resto de cuentas se crean en **Admin → Usuarios**.

> **PowerShell antiguo:** no soporta `&&`. Escribe un comando por línea.

---

## 6. Variables de entorno

Todas son **solo de servidor** (el frontend no usa ninguna). Se documentan en [`.env.example`](.env.example). `.env` **nunca** se sube a Git.

| Variable | ¿Obligatoria? | Para qué sirve |
|---|---|---|
| `DATABASE_URL` | **Sí** | Conexión a Neon. Usa el endpoint **pooler** (`-pooler` en el host). |
| `SESSION_SECRET` | **Sí** | Firma las sesiones de Staff/Admin (HMAC-SHA256). Mínimo 32 caracteres aleatorios. Cambiarla cierra todas las sesiones. |
| `PUBLIC_BASE_URL` | Solo en producción | Dominio con el que se arma el QR de cada pulsera: `{PUBLIC_BASE_URL}/p/{token}`. Sin `/` al final. **Queda grabado en cada QR impreso**: fíjalo al dominio oficial definitivo **antes** de imprimir pulseras reales. En desarrollo déjala vacía. |
| `OWNER_EMAIL` | No | Cuenta "dueña" (por defecto `javiercastro9912@gmail.com`): única que puede vaciar la bitácora y que no se puede eliminar. |
| `NETLIFY_SITE_ID`, `NETLIFY_AUTH_TOKEN` | No | Solo para que `db:respaldo-total` también respalde/restaure las **fotos** (Netlify Blobs). La app no las necesita. |

Generar un `SESSION_SECRET` en PowerShell:

```powershell
$b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

(en macOS/Linux: `openssl rand -base64 48`).

---

## 7. Base de datos

### 7.1 Tablas

**Heredadas del esquema original (Prisma, no se modifican):**
`Zone`, `Presbytery`, `Church`, `Package` (kits), `Batch`, `Pulse`, `Attendee`, `Redemption`, `User` (Admin/Staff), `AuditLog`, además de tablas de *Instantáneas* (`InstantConfig`, `Instant*`; la función está **oculta** en la app pero las tablas siguen).

**Propias de este proyecto (creadas por migraciones):**

| Migración | Tablas / cambios |
|---|---|
| `001_batch_status.sql` | Estado de lote. |
| `002_notes.sql` | `Note`, `NoteLike` (notas de 24 h y likes). |
| `003_menu.sql` | `Venue` (2 sedes), `Dish` (platillos). |
| `004_merch.sql` | `MerchItem`, `MerchImage` (mercancía y galería). |
| `005_blocked_words.sql` | `BlockedWord` (palabras bloqueadas por el Admin). |
| `006_announcements.sql` | `Announcement`, `NotificationState` (avisos y "visto" de la campana). |
| `007_announcement_live.sql` | Columna `live` (etiqueta "EN VIVO"). |
| `008_package_benefits.sql` | `PackageBenefit` (lo que incluye cada kit) y **siembra** los beneficios actuales. |

Todas son **idempotentes** (`IF NOT EXISTS`/guardas): `npm run db:migrar` se puede correr las veces que haga falta. Las semillas solo corren **al crear la tabla**, así que volver a migrar **no resucita** datos que borraste.

### 7.2 Reglas de oro
- **Nunca** alterar tablas heredadas (la otra app las usa). Solo se agregan tablas nuevas.
- Dinero siempre en **centavos** (entero). `$150` = `15000`. El frontend lo formatea.
- Nada importante se borra: los canjes se **anulan**, las notas **vencen**, los avisos se **retiran**. Las únicas acciones de borrado real son las del Admin explícitas (borrar lote, eliminar cuenta/iglesia, vaciar bitácora) y siempre piden confirmación.
- Las acciones administrativas importantes (cuentas, lotes, asistentes, canjes anulados, notas retiradas, avisos, iglesias, beneficios, ajustes) quedan en `AuditLog`; la bitácora solo se puede vaciar desde la cuenta dueña y queda en cero.

### 7.3 Almacenamiento de imágenes
Fotos de platillos y mercancía: **Netlify Blobs**. Se sirven públicas por `/api/dish-image/:key` y `/api/merch-image/:key`; la *key* cambia en cada reemplazo, así que la caché es agresiva y segura.

---

## 8. Roles, sesiones y seguridad

Hay **tres formas de identificarse**:

| Quién | Cómo se identifica | Dónde se valida |
|---|---|---|
| **Público** | Sin identificación | Endpoints públicos (`/api/churches`, `/api/packages`, `/api/menu`, `/api/merch`, `/api/settings`, `/api/pulse/:token`, `/api/claim`). |
| **Asistente** | Cabecera **`x-pulse-token: <token de su pulsera>`** (nunca en la URL, para que no quede en historiales). La identidad sale **siempre** del token, nunca de un id que mande el cliente. | `/api/me`, `/api/notes*`, `/api/notifications*`. |
| **Staff / Admin** | Cookie **`arr_staff`** (httpOnly, `SameSite=Lax`, firmada con HMAC-SHA256, dura 12 h). | `authorize(req, ['STAFF','ADMIN'])` o `['ADMIN']` en cada función. |

Detalles de seguridad:
- **Cada petición protegida revalida en la base**: cuenta activa, rol permitido y que la contraseña no haya cambiado desde que se abrió la sesión. Cambiar/restablecer una contraseña cierra las demás sesiones de esa cuenta.
- **Contraseña temporal:** al crear una cuenta o restablecer su contraseña, esta queda como temporal; la persona **debe** crear la suya antes de usar cualquier otra función (hasta entonces solo funciona `/api/auth/password`).
- Contraseñas con **bcrypt** (costo 12). La huella `fp` de la contraseña se guarda en la bitácora pero **nunca sale** del servidor.
- **Ocultar una pantalla no es seguridad:** todo `/api/admin/*` se revalida en el servidor; un Staff que llame a mano un endpoint de Admin recibe **403**.
- **Cuenta dueña** (`OWNER_EMAIL`): solo ella ve y puede usar **Vaciar bitácora**; su cuenta **nunca** se puede eliminar (ni a sí misma ni otro Admin). Tampoco se puede eliminar la cuenta propia ni al **último Admin activo**.
- **Moderación:** las notas pasan un filtro de lenguaje en cliente y servidor (`shared/moderation.ts` + palabras del Admin); el servidor responde **422** si hay groserías.
- Cabeceras de seguridad (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`) en `netlify.toml`.

---

## 9. Pantallas (rutas del frontend)

| Ruta | Quién | Qué es |
|---|---|---|
| `/` | Público | Portada. |
| `/conocer` | Público | Información del congreso. |
| `/login` | Staff/Admin | Inicio de sesión del equipo. |
| `/registro`, `/p/:token` | Asistente | Registro al escanear el QR. |
| `/home` | Asistente | **Home principal** (con animación de bienvenida). |
| `/homev2` | Asistente | Home clásico, sin animación (respaldo). |
| `/home/mercancia` | Asistente | Galería de mercancía. |
| `/programa`, `/beneficios`, `/comida`, `/recursos`, `/mas` | Asistente | Secciones de la app. |
| `/staff` | Staff/Admin | Escáner y canje de aguas. |
| `/cuenta/contrasena` | Staff/Admin | Cambiar contraseña. |
| `/admin` → `/admin/dashboard` | Admin | Panel (ver tabla en §1). |
| `/admin/lotes`, `/admin/lotes/:id` | Admin | Lotes y detalle. |
| `/admin/asistentes`, `/admin/asistentes/:id` | Admin | Asistentes. |
| `/admin/kits` | Admin | Kits (solo lectura). `/admin/paquetes` redirige aquí. |
| `/admin/beneficios`, `/admin/canjes`, `/admin/menu`, `/admin/merch`, `/admin/notas`, `/admin/avisos`, `/admin/iglesias`, `/admin/usuarios`, `/admin/auditoria` | Admin | Resto del panel. |
| `/instantaneas`, `/inicio` | — | Redirigen a `/home` (Instantáneas está oculto). |

La **sede y el horario del domingo** salen de la zona del asistente; el programa oficial vive en un solo archivo: `src/data/program.ts`.

---

## 10. API (resumen)

Resumen rápido; **referencia completa con cuerpos, respuestas, códigos y ejemplos en [`docs/API.md`](docs/API.md)**, y los tipos exactos en [`shared/api.ts`](shared/api.ts) (más `shared/notifications.ts`, `shared/audit.ts`, `shared/churches.ts`).

**Convenciones**
- Base: `/api`. JSON salvo donde se indica (PDF, PNG, Excel, `multipart/form-data` en Menú y Mercancía).
- Éxito: `200` (`201` al crear). Error: `{ "error": "mensaje en español" }` con `400` (datos inválidos), `401` (sin sesión), `403` (sin permiso), `404`, `405` (método no permitido), `409` (conflicto), `422` (moderación), `500` (error del servidor, mensaje genérico).
- Las respuestas llevan `cache-control: no-store` (salvo imágenes e iglesias).
- Fechas en **ISO UTC**; el evento usa la zona `America/Tijuana`. Dinero en **centavos**.
- Listas paginadas: `?page=` (desde 0) y `?pageSize=` (10, 25 o 50) → `{ total, page, pageSize, rows, … }`.

**Autenticación:** 🌐 público · 🎫 asistente (`x-pulse-token`) · 👷 Staff/Admin (cookie) · 🛡️ solo Admin (cookie).

### Público y asistente

| Método y ruta | Auth | Descripción |
|---|---|---|
| `GET /api/churches` | 🌐 | Iglesias (con presbiterio y zona) para el registro. Caché 5 min. |
| `GET /api/packages` | 🌐 | Kits activos. |
| `GET /api/pulse/:token` | 🌐 | Estado de una pulsera: `not_found` · `invalidated` · `active` · `unclaimed` (+ kit). |
| `POST /api/claim` | 🌐 | Reclama una pulsera `{ token, fullName, ageRange, churchId }` → `outcome`: `claimed` · `already_active` · `invalidated` · `not_found`. |
| `GET /api/me` | 🎫 | Datos del asistente, su kit (con `benefits`) y aguas usadas/restantes. |
| `GET /api/menu` | 🌐 | Platillos **disponibles**. |
| `GET /api/merch` | 🌐 | Catálogo de mercancía. |
| `GET /api/dish-image/:key` · `GET /api/merch-image/:key` | 🌐 | Imágenes desde Netlify Blobs. |
| `GET /api/settings` | 🌐 | Configuración global (modo de avatar). |
| `GET /api/notes` · `POST /api/notes` · `DELETE /api/notes` | 🎫 | Mis notas · publicar `{ text }` (≤60 car., 24 h) · quitar la activa. |
| `GET /api/notes/feed` | 🎫 | Notas vigentes de otros (solo primer nombre y avatar). |
| `POST /api/notes/:id/like` | 🎫 | Alterna like (no a la propia). |
| `GET /api/notes/likers` | 🎫 | Quién dio like a mis notas. |
| `GET /api/notifications` · `POST /api/notifications/seen` | 🎫 | Campana (avisos + likes) · marcar como visto. |

### Sesión y Staff

| Método y ruta | Auth | Descripción |
|---|---|---|
| `POST /api/auth/login` | 🌐 | `{ email, password }` → usuario + cookie `arr_staff`. |
| `POST /api/auth/logout` | 🌐 | Cierra la sesión (borra la cookie). |
| `GET /api/auth/me` | 👷 | Usuario de la sesión. |
| `POST /api/auth/password` | 👷 | Cambiar contraseña `{ currentPassword, newPassword }`. |
| `GET /api/staff/pulse?token=` o `?code=` | 👷 | Consulta una pulsera (QR o código `AR26-XXXXX`). |
| `GET /api/staff/search?q=&churchId=` | 👷 | Buscar asistentes con pulsera activa. |
| `POST /api/staff/redeem` | 👷 | Canjea 1 agua `{ manualCode, idempotencyKey }`. Idempotente. |
| `POST /api/staff/reassign` | 👷 | Reemplaza una pulsera `{ manualCode, newToken }`. |
| `GET /api/staff/history` | 👷 | Mis canjes recientes. |

### Admin (🛡️ todo el grupo)

| Recurso | Endpoints |
|---|---|
| **Dashboard** | `GET /api/admin/dashboard` · `GET /api/admin/dashboard/export?format=pdf\|xlsx` (filtros `period`, `zoneId`, `presbyteryId`, `churchId`, `packageId`) |
| **Lotes** | `GET/POST /api/admin/batches` · `GET /api/admin/batches/next-code` · `GET/DELETE /api/admin/batches/:id` · `GET /api/admin/batches/:id/pdf?size=a4\|letter\|tabloid` · `GET /api/admin/batches/:id/pulses/:pulseId/qr` |
| **Asistentes** | `GET /api/admin/attendees` · `GET /api/admin/attendees/catalog` · `GET/PATCH /api/admin/attendees/:id` |
| **Kits** | `GET /api/admin/packages` (solo lectura) |
| **Beneficios** | `GET/POST /api/admin/benefits` · `PATCH/DELETE /api/admin/benefits/:id` · `POST /api/admin/benefits/:id/reorder` |
| **Canjes** | `GET /api/admin/redemptions` · `GET /api/admin/redemptions/catalog` · `POST /api/admin/redemptions/:id/void` |
| **Menú** | `GET/POST /api/admin/dishes` · `PATCH/DELETE /api/admin/dishes/:id` · `POST /api/admin/dish-image-search` |
| **Mercancía** | `GET/POST /api/admin/merch` · `PATCH/DELETE /api/admin/merch/:id` · `POST /api/admin/merch/:id/reorder` |
| **Notas** | `GET /api/admin/notes` · `POST /api/admin/notes/:id/retire` |
| **Palabras bloqueadas** | `GET/POST /api/admin/blocked-words` · `PATCH/DELETE /api/admin/blocked-words/:id` |
| **Avisos** | `GET/POST /api/admin/announcements` · `POST /api/admin/announcements/:id/retire` |
| **Iglesias** | `GET/POST /api/admin/churches` · `PATCH/DELETE /api/admin/churches/:id` |
| **Usuarios** | `GET/POST /api/admin/users` · `PATCH/DELETE /api/admin/users/:id` · `POST /api/admin/users/:id/password` |
| **Auditoría** | `GET /api/admin/audit` · `DELETE /api/admin/audit` (**solo la cuenta dueña**) |
| **Ajustes** | `GET/PATCH /api/admin/settings` |

**Ejemplo (curl)** — iniciar sesión y consultar lotes:

```bash
curl -i -c cookies.txt -H 'content-type: application/json' \
  -d '{"email":"admin@ejemplo.com","password":"********"}' \
  https://redjuveniltijuana.com/api/auth/login

curl -b cookies.txt https://redjuveniltijuana.com/api/admin/batches
```

**Ejemplo** — datos del asistente con su pulsera:

```bash
curl -H 'x-pulse-token: AbCdEfGh12345678' https://redjuveniltijuana.com/api/me
```

---

## 11. Reglas de negocio importantes

- **Una pulsera = una persona.** Se reclama una sola vez; al reemplazarla, la vieja queda `INVALIDATED` y la nueva `ACTIVE` para el mismo asistente **conservando las aguas ya canjeadas**. Solo se puede reemplazar por una pulsera **sin reclamar del mismo kit**.
- **Aguas frescas:** `drinksRemaining = includedDrinks del kit − canjes válidos`. Cada canje descuenta exactamente 1 y usa una `idempotencyKey` generada al abrir el modal (doble toque o reintento no duplican). Un canje **anulado** devuelve el saldo y queda en el historial.
- **Lotes:** de 1 a 500 pulseras de **un solo kit**. El nombre sugerido es `LOTE-AAAA-NNN`. Borrar un lote elimina sus pulseras, los canjes hechos con ellas y los asistentes que **solo** tenían pulseras de ese lote (con sus notas/likes); un asistente con pulsera en otro lote se conserva.
- **QR:** `{PUBLIC_BASE_URL}/p/{token}`; sin `PUBLIC_BASE_URL` en producción **no se generan QR**. Cambiar el dominio invalida las pulseras ya impresas.
- **Notas:** 60 caracteres, 24 h, **una activa por persona** (publicar otra reemplaza la anterior), moderadas por filtro + lista del Admin; los likes son únicos por persona y no se pueden dar a la propia nota.
- **Programa y sede:** Zona 1 → 21ra IAFCJ, Zona 2 → 12va IAFCJ (domingo). Un dato de zona faltante cuenta como Zona 1.
- **Avisos:** audiencia `ALL`, `Zona 1` o `Zona 2`; se pueden programar (`publishAt`) y marcar "EN VIVO". Máx. 60 caracteres de título y 280 de cuerpo.
- **Iglesias:** nombre único por presbiterio; una iglesia solo tiene **un** presbiterio; solo se elimina si **no tiene asistentes**.
- **Usuarios:** mínimo un Admin activo siempre; no puedes quitarte el rol ni desactivarte; eliminar una cuenta con historial no se permite (se **desactiva**).
- **Beneficios:** máx. 80 caracteres por beneficio y 20 por kit; no se repiten dentro del mismo kit. Si falta la migración 008, el asistente ve la lista fija de `src/data/app.ts`.

---

## 12. Scripts de npm

| Comando | Qué hace |
|---|---|
| `npm run dev` | Desarrollo completo en `http://localhost:8888` (Vite + funciones). |
| `npm run dev:vite` / `dev:https` | Solo frontend / con HTTPS local (cámara en celular). |
| `npm run build` | `tsc -b && vite build` → `dist/`. |
| `npm run preview` | Sirve `dist/` (solo frontend). |
| `npm run db:migrar` | Aplica las migraciones (idempotente). **Corre esto tras cada actualización.** |
| `npm run db:esquema` / `db:conteo` | Muestra el esquema / cuenta filas por tabla. |
| `npm run db:respaldo-total` | **Respaldo completo** (todas las tablas + fotos si hay token de Netlify). Solo lectura. |
| `npm run db:restaurar-total -- <carpeta> [--reemplazar]` | Restaura un respaldo total (verifica su integridad antes). |
| `npm run db:limpiar-pruebas [-- --simular]` | **Deja la base lista para el evento** (ver §13). |
| `npm run db:respaldo` / `db:restaurar` / `db:borrar-respaldo` | Scripts antiguos (reemplazados por los "total"). |
| `npm run db:notas-demo` / `db:likes-demo` | Datos de demostración de Notas (`-- --limpiar` los borra). |
| `npm run db:renombrar-kits` | Utilidad histórica para renombrar kits. |
| `npm run moderacion:probar` | Prueba el filtro de lenguaje. |
| `npm run plantilla:base64` | Regenera la plantilla de la tarjeta QR. |

---

## 13. Respaldo, limpieza y entrega del evento

Guía completa en [`docs/PLAN_RESPALDO.md`](docs/PLAN_RESPALDO.md). Resumen:

1. **Antes de cualquier cosa delicada**, crea una **rama de Neon** (copia instantánea) y corre `npm run db:respaldo-total`. Guarda la carpeta `respaldos/` también **fuera** de la computadora (nube/USB). `respaldos/` está en `.gitignore` porque contiene datos personales.
2. **Prueba la restauración** al menos una vez, en una rama de Neon (no en producción).
3. **Limpieza antes de imprimir lotes definitivos:**
   ```
   npm run db:limpiar-pruebas -- --simular     # solo muestra qué borraría
   npm run db:limpiar-pruebas                  # pide escribir LIMPIAR TODO; antes hace un respaldo automático
   ```
   - **Borra:** notas y likes, avisos, canjes, pulseras, asistentes, lotes, Instantáneas y la bitácora de esas pruebas.
   - **Conserva:** todas las cuentas (Admin y Staff), kits, beneficios, zonas/presbiterios/iglesias, menú, mercancía, palabras bloqueadas y configuración.
   - ⚠️ Borra **todas** las pulseras y asistentes, aunque sean reales. Córrelo **antes** de generar los lotes definitivos.
4. Desde el panel también puedes **borrar lotes de prueba** uno por uno (Admin → Lotes → lote → ícono de bote) y, la cuenta dueña, **vaciar la bitácora** (Admin → Auditoría).
5. **Orden recomendado:** respaldo → borrar lotes de prueba → (si quedan datos sueltos) `db:limpiar-pruebas` → vaciar bitácora → crear lotes definitivos con `PUBLIC_BASE_URL` ya fijado.

---

## 14. Despliegue

El sitio vive en **Netlify** y se despliega desde este repositorio: un *push* a la rama de producción dispara el build (`npm run build`, publica `dist/`; funciones desde `netlify/functions`).

Checklist antes de desplegar:
- [ ] Variables de entorno configuradas en Netlify (`DATABASE_URL`, `SESSION_SECRET`, `PUBLIC_BASE_URL`; opcional `OWNER_EMAIL`).
- [ ] Migraciones aplicadas (`npm run db:migrar`) contra la base de producción.
- [ ] `npm run build` pasa sin errores.
- [ ] Dominio definitivo fijado **antes** de imprimir pulseras reales.

Flujo habitual de cambios (PowerShell, un comando por línea):

```
git add .
git commit -m "Descripcion corta sin acentos"
git push
```

Más en [`docs/INFRASTRUCTURE.md`](docs/INFRASTRUCTURE.md), [`docs/PLAN_DOMINIO.md`](docs/PLAN_DOMINIO.md) y [`docs/MIGRATION_TO_RED.md`](docs/MIGRATION_TO_RED.md).

---

## 15. Cómo se hace… (guía de operación)

- **Crear una cuenta de equipo:** Admin → Usuarios → *Nueva cuenta* → elige rol (Staff/Admin) → *Copiar datos* y envíalos por un medio de confianza. El texto incluye el rol, el correo, la contraseña temporal y la liga `redjuveniltijuana.com/login`. La persona crea su contraseña al entrar.
- **Generar e imprimir pulseras:** Admin → Lotes → *Crear lote* (kit + cantidad) → entra al lote → *Descargar PDF* (imprime a **tamaño real / 100 %**; las tarjetas son de 50 × 35 mm y cada hoja trae una regla de 5 cm para verificar).
- **Cambiar lo que incluye un kit:** Admin → Beneficios. (Nombre, precio y aguas del kit son fijos.)
- **Agregar una iglesia que falta:** Admin → Iglesias → *Agregar* (elige presbiterio).
- **Publicar un aviso:** Admin → Avisos (ahora o programado; "EN VIVO" opcional; por zona o para todos).
- **Quitar una nota inapropiada:** Admin → Notas → *Retirar* (queda vencida y registrada). Para bloquear palabras: Admin → Notas → palabras bloqueadas.
- **Anular un canje por error:** Admin → Canjes → *Anular* (con motivo).
- **Corregir datos de un asistente:** Admin → Asistentes → detalle → editar.
- **Reemplazar una pulsera perdida:** Staff → buscar al asistente → *Reemplazar pulsera* → escanear la nueva.
- **Agregar/editar el menú o la mercancía:** Admin → Menú / Mercancía (foto, precio en pesos, sede, disponibilidad, orden).
- **Cambiar el programa:** editar `src/data/program.ts` (única fuente) y desplegar.

---

## 16. Solución de problemas

| Síntoma | Causa probable y solución |
|---|---|
| `Falta SESSION_SECRET…` / error 500 al iniciar sesión | `.env` sin `SESSION_SECRET` (≥32 caracteres) o sin reiniciar `npm run dev`. |
| `Falta DATABASE_URL` | Falta en `.env` (o en las variables de Netlify en producción). |
| Una pantalla del panel dice "Falta aplicar la migración" | Corre `npm run db:migrar` contra esa base (p. ej. 008 para Beneficios). |
| "Kits" aparece deshabilitado ("Etapa 5") o una pantalla nueva no aparece | Estás viendo una versión anterior: sube los cambios (`git push`) y espera el despliegue, o reinicia `npm run dev`. |
| Los QR no se generan en producción | Falta `PUBLIC_BASE_URL` (sin `/` al final). |
| Los QR apuntan a `localhost` | Estás en desarrollo: **no imprimas** esas pulseras. |
| La cámara no abre en el celular | Necesita HTTPS: usa `npm run dev:https` o el dominio real. |
| `El token ... && no es un separador válido` en PowerShell | PowerShell antiguo: ejecuta un comando por línea (no uses `&&`). |
| No puedo eliminar una cuenta | Es la cuenta dueña, la tuya, el último Admin, o tiene historial (lotes/canjes): **desactívala**. |
| No veo "Vaciar bitácora" | Solo la cuenta dueña (`OWNER_EMAIL`) lo ve. |
| Al borrar un lote dice que no se puede | Hay datos que dependen de él; usa `npm run db:limpiar-pruebas`. |
| "Sesión inválida" tras cambiar `SESSION_SECRET` | Esperado: todos deben iniciar sesión de nuevo. |

---

## 17. Documentación adicional

| Archivo | Contenido |
|---|---|
| [`docs/API.md`](docs/API.md) | **Referencia completa de la API** (cuerpos, respuestas, errores, ejemplos). |
| [`docs/CLAUDE_HANDOFF.md`](docs/CLAUDE_HANDOFF.md) | Bitácora técnica detallada, sección por sección (§1–§56), con cada decisión. **Empieza aquí para entender el porqué.** |
| [`docs/PLAN_PENDIENTES.md`](docs/PLAN_PENDIENTES.md) | Qué falta por hacer y su estado. |
| [`docs/PLAN_RESPALDO.md`](docs/PLAN_RESPALDO.md) | Plan y comandos de respaldo, restauración y limpieza. |
| [`docs/INFRASTRUCTURE.md`](docs/INFRASTRUCTURE.md), [`docs/CONEXION_NEON.md`](docs/CONEXION_NEON.md), [`docs/PLAN_DOMINIO.md`](docs/PLAN_DOMINIO.md), [`docs/MIGRATION_TO_RED.md`](docs/MIGRATION_TO_RED.md) | Infraestructura, conexión a Neon, dominio y migración. |
| [`docs/MODERACION.md`](docs/MODERACION.md) | Filtro de lenguaje de las Notas. |
| [`docs/NOTAS_DEL_PROYECTO.md`](docs/NOTAS_DEL_PROYECTO.md), [`docs/CAMBIOS_UI.md`](docs/CAMBIOS_UI.md), [`docs/CODIGO_SIN_USO.md`](docs/CODIGO_SIN_USO.md) | Notas históricas, cambios de interfaz y limpieza pendiente. |
| [`docs/RESPALDO_Y_LIMPIEZA.md`](docs/RESPALDO_Y_LIMPIEZA.md) | Guía **antigua** de respaldo (reemplazada por `PLAN_RESPALDO.md`). |

---

*Hecho para la Red Juvenil Tijuana · Arraigados 2K26.*
