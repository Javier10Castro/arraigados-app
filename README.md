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
- **Home** (`/home`): animación de bienvenida con su gafete, tarjeta **"Ahora"** en vivo según el programa, carrusel de **notas** de la comunidad, tarjetas de **playlist** y de **stand de café**, menú de alimentos, mercancía oficial y su kit. El **café y el menú** se muestran solo para la **sede del asistente** (ver §11).
- **Mi kit / Beneficios** (`/beneficios`): qué incluye su kit. Las **aguas frescas** eran solo del sábado: se muestran **inactivas** (vasos en gris, «Beneficio del día sábado»). Un kit **sin beneficios ni aguas** (p. ej. *Inscripción Domingo*) **no muestra** la tarjeta «Mi kit» en `/home`, y `/beneficios` dice «Tu inscripción no incluye beneficios.».
- **Programa** (`/programa`): horario oficial del sábado y domingo (la sede del domingo depende de su zona).
- **Notas**: publica una frase de hasta 60 caracteres que dura 24 horas; da *like* a las de otros.
- **Campana de notificaciones**: avisos del equipo y likes recibidos.
- **Comida** (`/comida`) y **Más**. **Recursos** está **oculto** desde el 17 oct (`/recursos` redirige a `/home`; los enlaces están comentados en `AppShell.tsx` y `Mas.tsx`).
- **Mi perfil** (`/perfil`, Más → Mi perfil): elige cómo aparece en notas, campana, gafete y listas: **foto** propia, **avatar** (*Default*, *Sorpréndeme* o *Custom*) o **iniciales** (qué palabras del nombre y color de fondo). Las tres opciones se conservan; solo una está activa (ver §7.4).

### Para el Staff (cuenta con correo y contraseña)
- **Escanear** la pulsera con la cámara y ver los datos y el saldo de aguas del asistente (el campo para escribir el código de respaldo `AR26-XXXXX` existe pero está oculto: `SHOW_MANUAL_CODE = false` en `src/pages/Staff.tsx`).
- **Canjear** 1 agua fresca (protegido contra doble toque: nunca descuenta dos veces).
- **Buscar** asistentes por nombre/iglesia, **reemplazar una pulsera** (perdida/dañada) y ver **"Mis canjes recientes"**.
- **Pulsera propia (Staff y Admin):** una cuenta del equipo puede tener **una** pulsera propia que le asigna un Admin (Usuarios → Editar cuenta). Un **Admin** también puede vincularla escaneando el QR en `/cuenta/pulsera`. Con ella entra a la **vista de visitante** («Modo visitante») y regresa a su panel («Volver a mi equipo») sin cerrar sesión; el autocanje está apagado por defecto. Guía completa, estados, permisos y recuperación: [`docs/EQUIPO_PULSERA_AUTOCANJE.md`](docs/EQUIPO_PULSERA_AUTOCANJE.md). *Aplica solo con la migración 012, que **no** está aplicada en Neon.*

### Para el Admin (panel `/admin`)
| Sección | Qué permite |
|---|---|
| **Dashboard** | Métricas operativas en vivo (registros, canjes, alertas) con filtros por día/zona/presbiterio/iglesia/kit y **exportación a PDF y Excel**. Incluye la tarjeta **«Inscripción Domingo»** (dinero y registros de ese kit; ya está sumado en «Valor estimado», que es precio de lista, no dinero cobrado). |
| **Lotes** | Crear lotes de 1 a 500 pulseras de un kit, descargar el **PDF de impresión** (A4/Carta/11×17) o el QR suelto, y **borrar** un lote. |
| **Asistentes** | Buscar/filtrar, ver el detalle (pulseras, canjes) y **corregir** nombre, edad o iglesia. |
| **Kits** | Consulta de solo lectura: precio, aguas incluidas, pulseras impresas/reclamadas, uso de aguas e ingreso esperado. |
| **Beneficios** | Administrar lo que **incluye** cada kit (agregar, renombrar, quitar, reordenar). |
| **Canjes** | Historial de canjes con filtros; **anular** un canje (nunca se borra). |
| **Rifas** | Solo cuentas autorizadas por el servidor (`canManageRaffles`). Sorteo **por kit** hecho en el **servidor**, historial, cancelar una rifa abierta y **proyector público** (`/rifa/:id`). Ver [`docs/MANUAL_RIFAS.md`](docs/MANUAL_RIFAS.md). |
| **Descuentos** | Descuento por rol del equipo e **ingresos simulados** (solo lectura para Admin; editan las cuentas autorizadas). |
| **Menú** | CRUD de platillos con foto, precio, sede y disponibilidad. |
| **Mercancía** | CRUD de artículos con galería de fotos y orden de la vitrina. Las fotos de **más de 3 MB se comprimen solas** en el navegador (WebP) antes de subirse (`src/lib/compressImage.ts`). |
| **Notas** | Moderación: ver, filtrar y **retirar** notas; administrar **palabras bloqueadas**. |
| **Avisos** | Publicar avisos (ahora o programados, con etiqueta "EN VIVO") para todos o por zona. |
| **Iglesias** | Agregar, renombrar, mover de presbiterio o eliminar iglesias (presbiterios y zonas son fijos). |
| **Usuarios** | Crear cuentas (Admin/Staff) con contraseña temporal, editar, desactivar, restablecer contraseña y **eliminar** cuentas. |
| **Configuración** | Interruptores del **autocanje** de pulseras del equipo, por rol y con excepciones del propietario. Ver [`docs/EQUIPO_PULSERA_AUTOCANJE.md`](docs/EQUIPO_PULSERA_AUTOCANJE.md). |
| **Auditoría** | Bitácora de todo lo que hace el equipo, con filtros. |
| **Secreto** | **Solo el dueño** (`OWNER_EMAIL`): 3 botones (Kit A, Kit B, Kit Especial) que descargan un `.txt` con una línea por asistente registrado: `Nombre completo - Iglesia`, listo para copiar. Solo cuenta pulseras `ACTIVE`; si el kit no tiene registrados avisa. |

---

## 2. Conceptos clave (glosario)

| Término | Significado |
|---|---|
| **Kit** (antes "paquete") | Lo que compra el asistente: **Kit - A** ($100, sin aguas), **Kit - B** ($150, 3 aguas), **Especial** ($200, 3 aguas) e **Inscripción Domingo** ($30, sin aguas ni beneficios; creado el 18 oct con `npm run db:lote-domingo`). Son fijos. En la base se llama `Package`; los precios se guardan en **centavos**. |
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
| **Cuenta protegida** | La cuenta principal del proyecto (`OWNER_EMAIL`): **nunca se puede eliminar** (ver §8). |

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
│   │   ├── home/             Contenido del Home (/homev2 lo muestra solo): Notas, Menú, Mercancía y las tarjetas de Playlist y Café
│   │   └── homev2/           Home principal (/home): animación y gafete, y debajo el Home de arriba
│   ├── admin/                Panel de Admin (Dashboard, Lotes, Kits, Usuarios, Auditoría…)
│   ├── components/           Componentes compartidos (Button, Pagination, Skeleton…)
│   ├── data/                 Datos estáticos (program.ts = programa oficial, app.ts, homeCards.ts = playlist y stands de café)
│   ├── assets/brand/         Imágenes de marca (carátula de la playlist, foto del stand de café…)
│   └── lib/                  api.ts = cliente HTTP (una función por endpoint); compressImage.ts = compresor de fotos
├── netlify/functions/        Backend: un archivo .mts por endpoint /api/*
├── server/                   Lógica del backend (db, auth, batches, users, audit, benefits…)
├── shared/                   Tipos y constantes compartidos cliente/servidor
├── migrations/               Migraciones SQL propias (001–016), idempotentes
├── scripts/                  Utilidades de base de datos (migrar, respaldo, limpieza, lote del domingo…)
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
| `DATABASE_URL` | **Sí** | Conexión a Neon. Usa el endpoint **pooler** (`-pooler` en el host). Desde el 18 oct 2026 la producción usa la base **Wild Butterfly** (proyecto Neon «Red Juvenil Tijuana», la cuenta del congreso); la anterior (**Divine Block**, proyecto «Arraigados 2K26») quedó solo como respaldo. |
| `SESSION_SECRET` | **Sí** | Firma las sesiones de Staff/Admin (HMAC-SHA256). Mínimo 32 caracteres aleatorios. Cambiarla cierra todas las sesiones. |
| `PUBLIC_BASE_URL` | Solo en producción | Dominio con el que se arma el QR de cada pulsera: `{PUBLIC_BASE_URL}/p/{token}`. Sin `/` al final. **Queda grabado en cada QR impreso**: fíjalo al dominio oficial definitivo **antes** de imprimir pulseras reales. En desarrollo déjala vacía. |
| `OWNER_EMAIL` | No | Cuenta principal protegida (por defecto `javiercastro9912@gmail.com`): no se puede eliminar. |
| `PROGRAM_REMINDERS` | No | Poner `off` para apagar los recordatorios automáticos del programa en la campana (por defecto están activos). |
| `NETLIFY_SITE_ID`, `NETLIFY_AUTH_TOKEN` | No | Solo para los **scripts**: que `db:respaldo-total` respalde/restaure las fotos de platillos y mercancía (Netlify Blobs) y para `db:fotos-huerfanas` (§7.4). La app no las necesita (Netlify las configura sola). |

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
| `009_attendee_profile.sql` | `AttendeeProfile` (foto / avatar / iniciales de cada asistente). Solo **agrega** una tabla; no toca `Attendee`. |
| `010_attendee_profile_keep_all.sql` | Agrega `initialsId` y relaja la regla para conservar **las 3 selecciones a la vez** (`kind` = la activa). No borra datos. |
| `011_rate_limit.sql` | Crea la tabla `RateLimit` (contadores del límite de frecuencia: clave con huella HMAC, conteo y fin de ventana). No toca tablas existentes ni guarda datos personales. **Pendiente de aplicar** (primero en rama de Neon). Ver [`docs/RATE_LIMITING.md`](docs/RATE_LIMITING.md). |
| `012_staff_selfredeem.sql` | Pulseras de cuentas del equipo y control del **autocanje**. |
| `013_team_discount.sql` | Configuración de **descuentos del equipo** (simulación de ingresos del Dashboard). |
| `014_raffles.sql` | **Rifas** por kit con sorteo en el servidor (`Raffle`, `RaffleWinner`). |
| `015_team_notes.sql` | Notas y «me gusta» de cuentas del equipo con pulsera, en la vista de visitante. |
| `016_raffle_cancel.sql` | Permite **cancelar** una rifa abierta (nuevo estado `CANCELLED`). |

> **Estado en Neon (verificado el 18 oct 2026):** en la base *Wild Butterfly* están aplicadas la 012–016 y **no** la 011 (antes de que ese día se le copiaran los datos de la base anterior; después no se volvió a verificar con `npm run db:estado`). Para aplicar una sola: `npm run db:migrar -- --only <archivo>.sql` (un `db:migrar` a secas aplicaría también la 011). Cada migración documenta su estado en su cabecera.

Todas son **idempotentes** (`IF NOT EXISTS`/guardas): `npm run db:migrar` se puede correr las veces que haga falta. Las semillas solo corren **al crear la tabla**, así que volver a migrar **no resucita** datos que borraste.

### 7.2 Reglas de oro
- **Nunca** alterar tablas heredadas (la otra app las usa). Solo se agregan tablas nuevas.
- Dinero siempre en **centavos** (entero). `$150` = `15000`. El frontend lo formatea.
- Nada importante se borra: los canjes se **anulan**, las notas **vencen**, los avisos se **retiran**. Las únicas acciones de borrado real son las del Admin explícitas (borrar lote, eliminar cuenta/iglesia) y siempre piden confirmación.
- Las acciones administrativas importantes (cuentas, lotes, asistentes, canjes anulados, notas retiradas, avisos, iglesias, beneficios, ajustes) quedan en `AuditLog`. Cada registro guarda en su `metadata` los nombres y códigos de lo que cambió (cuenta, asistente, pulsera, lote…), así que la pantalla de Auditoría sigue leyéndose bien aunque el elemento se elimine después. También se registran el **menú** (platillos) y la **mercancía**.

### 7.3 Almacenamiento de imágenes
Fotos de platillos y mercancía: **Netlify Blobs**. Se sirven públicas por `/api/dish-image/:key` y `/api/merch-image/:key`; la *key* cambia en cada reemplazo, así que la caché es agresiva y segura.

### 7.4 Perfil del asistente (foto · avatar · iniciales)
Cada asistente elige en `/perfil` cómo se ve. Las **tres opciones se conservan** (`kind` marca la activa); de las demás personas solo se entrega la activa.

| Modalidad | Qué guarda | Dónde |
|---|---|---|
| **Foto** | JPEG de 512 px (el navegador la recorta y limpia) | Netlify Blobs **privado** (`profile-photos`); en la base solo su llave (`photoKey`) |
| **Avatar** | Texto corto: `own` (Default), `c.<rostro>.<forma>.<color>.<matiz>` (Sorpréndeme/Custom) o `a01…a24` | `AttendeeProfile.avatarId` |
| **Iniciales** | Texto corto con las *posiciones* de las palabras del nombre y el color (se actualizan si el nombre cambia) | `AttendeeProfile.initialsId` |

- **Requisitos:** migraciones **009 y 010** (`npm run db:migrar`; sin ellas el perfil no se ve y guardar responde 503). `SESSION_SECRET` (ya obligatoria) firma las URLs de las fotos. **No hay dependencias npm ni variables nuevas** (usa `@netlify/blobs` y `blobatar`, ya instaladas).
- **Fotos privadas:** no hay URL pública; se sirven con URL firmada (HMAC) que caduca en 24–48 h y solo se entrega a asistentes con pulsera activa o al equipo.
- **Validación de la foto (servidor):** solo JPEG real (se revisan los bytes, no el MIME ni la extensión), ≤ 1 MB, 64–2048 px; se quitan EXIF/GPS/comentarios y **todo lo que venga después del fin de imagen**; se rechaza un JPEG sin fin de imagen, con dos encabezados de imagen o truncado. Detalle en [`docs/API.md`](docs/API.md).
- **Límite de frecuencia:** cada persona debe esperar **10 s** entre cambios si sube foto y **2 s** si no; si no, `429` con `Retry-After` y el mensaje «Espera N s». No cambia nada guardado. No hay tope diario (ver [`docs/PLAN_PENDIENTES.md`](docs/PLAN_PENDIENTES.md)).
- **Limpieza de fotos:** al **desvincular una pulsera** o **borrar un lote**, la foto se borra de Blobs **después** de confirmar la base. Si Blobs falla, la operación se completa y el archivo queda huérfano (se registra `[profile:huerfana] key=…`): `npm run db:fotos-huerfanas` lo lista y, con `-- --borrar`, lo elimina. `db:limpiar-pruebas` **no** borra archivos. Detalle y límites en [`docs/PLAN_RESPALDO.md`](docs/PLAN_RESPALDO.md).
- ⚠️ **Los respaldos actuales NO incluyen las fotos de perfil** (sí la tabla). Ver [`docs/PLAN_RESPALDO.md`](docs/PLAN_RESPALDO.md).
- **Probarlo en desarrollo** (en una rama de Neon de pruebas, nunca en producción):
  ```
  npm run db:migrar
  npm run dev
  ```
  1. Admin (`/login`) → Lotes → crea un lote de prueba y abre el enlace `/p/<token>` de una pulsera para registrarte.
  2. Más → **Mi perfil**: prueba Foto, Avatar (Default / Sorpréndeme / Custom) e Iniciales; pulsa *Guardar cambios* y **recarga**: debe persistir.
  3. Sube una foto y cambia a Avatar: la foto queda «Guardada» (no se borra). Dos guardados seguidos muestran «Espera N s».
  4. Admin → Asistentes → detalle: **Quitar foto** (queda en la bitácora). Admin → Asistentes → detalle → *Desvincular pulsera* (cualquier cuenta Administrador) con una pulsera de prueba: la foto debe desaparecer de Blobs.
  5. `npx tsc --noEmit` y `npm run build` sin errores.

  > Las fotos usan Netlify Blobs. Con `netlify dev` se espera un almacén local, pero **no se ha verificado en este repositorio**: las pruebas hechas fueron con un almacén simulado, no con Blobs ni Neon reales. Avatares e iniciales no usan Blobs.

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
- **Cuenta protegida** (`OWNER_EMAIL`): su cuenta **nunca** se puede eliminar (ni por otro Admin). Tampoco se puede eliminar la cuenta propia ni al **último Admin activo**.
- **Moderación:** las notas pasan un filtro de lenguaje en cliente y servidor (`shared/moderation.ts` + palabras del Admin); el servidor responde **422** si hay groserías.
- Cabeceras de seguridad (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`) en `netlify.toml`.
- **Límite de frecuencia (rate limiting):** login, reclamo de pulsera, consulta de token, canje, fotos de perfil y acciones de Admin tienen límites por regla, con contadores atómicos en Neon (tabla `RateLimit`, migración 011). Se mide por cuenta, token o pareja correo+IP; la IP viene solo de `context.ip` de Netlify (nunca de `X-Forwarded-For`) y los límites por IP cuentan **fallos** con umbrales altos porque la sede comparte una IP pública. Primero se autentica y después se consume cupo. Política de fallo por regla (abierto/cerrado) y detalle en [`docs/RATE_LIMITING.md`](docs/RATE_LIMITING.md).

---

## 9. Pantallas (rutas del frontend)

| Ruta | Quién | Qué es |
|---|---|---|
| `/` | Público | Portada. |
| `/conocer` | Público | Información del congreso. |
| `/login` | Staff/Admin | Inicio de sesión del equipo. |
| `/registro`, `/p/:token` | Asistente | Registro al escanear el QR. |
| `/home` | Asistente | **Home principal**: animación de bienvenida con el gafete y debajo el contenido del Home. |
| `/homev2` | Asistente | El mismo contenido del Home **sin** la animación (respaldo). |
| `/home/mercancia` | Asistente | Galería de mercancía. |
| `/programa`, `/beneficios`, `/comida`, `/mas` | Asistente | Secciones de la app. |
| `/perfil` | Asistente | **Mi perfil**: elegir foto, avatar o iniciales (Más → Mi perfil). |
| `/staff` | Staff/Admin | Escáner y canje de aguas. |
| `/cuenta/pulsera` | Staff/Admin | **Vincular pulsera** (Admin escanea el QR; Staff ve el estado) y entrar a la vista de visitante. |
| `/cuenta/contrasena` | Staff/Admin | Cambiar contraseña. |
| `/admin` → `/admin/dashboard` | Admin | Panel (ver tabla en §1). |
| `/admin/lotes`, `/admin/lotes/:id` | Admin | Lotes y detalle. |
| `/admin/asistentes`, `/admin/asistentes/:id` | Admin | Asistentes. |
| `/admin/kits` | Admin | Kits (solo lectura). `/admin/paquetes` redirige aquí. |
| `/admin/beneficios`, `/admin/canjes`, `/admin/menu`, `/admin/merch`, `/admin/notas`, `/admin/avisos`, `/admin/iglesias`, `/admin/usuarios`, `/admin/auditoria` | Admin | Resto del panel. |
| `/admin/rifas`, `/admin/descuentos`, `/admin/configuracion` | Admin | Rifas (solo cuentas autorizadas), descuentos del equipo y autocanje. |
| `/rifa/:id` | Público | Proyector de una rifa (se abre en la pantalla grande). |
| `/admin/secreto` | Dueño | Listas `.txt` por kit (solo `OWNER_EMAIL`; a otro Admin no le aparece ni puede entrar). |
| `/instantaneas`, `/inicio`, `/recursos` | — | Redirigen a `/home` (Instantáneas y Recursos están ocultos). |

La **sede y el horario del domingo** salen de la zona del asistente; el programa oficial vive en un solo archivo: `src/data/program.ts`.

---

## 10. API (resumen)

Resumen rápido; **referencia completa con cuerpos, respuestas, códigos y ejemplos en [`docs/API.md`](docs/API.md)**, y los tipos exactos en [`shared/api.ts`](shared/api.ts) (más `shared/notifications.ts`, `shared/audit.ts`, `shared/churches.ts`).

**Convenciones**
- Base: `/api`. JSON salvo donde se indica (PDF, PNG, Excel, `multipart/form-data` en Menú y Mercancía).
- Éxito: `200` (`201` al crear). Error: `{ "error": "mensaje en español" }` con `400` (datos inválidos), `401` (sin sesión), `403` (sin permiso), `404`, `405` (método no permitido), `409` (conflicto), `422` (moderación), `500` (error del servidor, mensaje genérico).
- Las respuestas llevan `cache-control: no-store` (salvo imágenes e iglesias).
- Límite de frecuencia: `429` con `{ "error": "…", "code": "rate_limited" }` y cabecera `Retry-After` (segundos); `503` con `code: "rate_limit_unavailable"` si el contador falla en una regla de fallo cerrado. Ver [`docs/RATE_LIMITING.md`](docs/RATE_LIMITING.md).
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
| `GET /api/me` | 🎫 | Datos del asistente, su kit (con `benefits`), aguas usadas/restantes y, si lo hay, su `profile`. Si el perfil no se puede leer, responde igual **sin** `profile`. |
| `GET /api/menu` | 🌐 | Platillos **disponibles**. |
| `GET` · `PUT /api/profile` | 🎫 | Lee / guarda la imagen de perfil propia (la identidad sale del token, nunca del cuerpo). `PUT` tiene límite de frecuencia (`429` + `Retry-After`). |
| `POST /api/profiles` | 🎫 · 👷 | Perfiles de varios asistentes (máx. 60 ids) para pintar sus avatares. |
| `GET /api/profile-photo/:key?e=&s=` | firmada | Foto de perfil desde Blobs **privado**; exige firma vigente. |
| `GET /api/merch` | 🌐 | Catálogo de mercancía. |
| `GET /api/dish-image/:key` · `GET /api/merch-image/:key` | 🌐 | Imágenes desde Netlify Blobs. |
| `GET /api/settings` | 🌐 | Configuración global (modo de avatar). |
| `GET /api/notes` · `POST /api/notes` · `DELETE /api/notes` | 🎫 | Mis notas · publicar `{ text }` (≤60 car., 24 h) · quitar la activa. |
| `GET /api/notes/feed` | 🎫 | Notas vigentes de otros (solo primer nombre y avatar). |
| `POST /api/notes/:id/like` | 🎫 | Alterna like (no a la propia). |
| `GET /api/notes/likers` | 🎫 | Quién dio like a mis notas. |
| `GET /api/notifications` · `POST /api/notifications/seen` | 🎫 | Campana (avisos + likes + recordatorios del programa) · marcar como visto. |

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
| **Auditoría** | `GET /api/admin/audit` |
| **Secreto** (solo dueño) | `GET /api/admin/secreto?kit=a\|b\|especial` → `.txt` (`lista-<kit>-<fecha>.txt`); `403` si no es el dueño, `400` kit inválido, `404` si no hay registrados |
| **Ajustes** | `GET/PATCH /api/admin/settings` |
| **Autocanje del equipo** | `GET/PATCH /api/admin/selfredeem` |
| **Pulsera del equipo** | `GET/POST/DELETE /api/admin/staff-pulse` · `POST /api/admin/pulses/:id/release` |
| **Descuentos del equipo** | `GET/PUT /api/admin/team-discounts` |
| **Rifas** | `GET/POST /api/admin/raffles` · `GET/PATCH /api/admin/raffles/:id` · `POST /api/admin/raffles/:id/draw` · `POST /api/admin/raffles/:id/cancel` |

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
- **Sede de «hoy» (café y menú del `/home`):** el **sábado** todos están en la **12va IAFCJ**; desde el domingo, la de su zona (`SUNDAY_VENUE_BY_ZONE`). El **stand de café** (`CAFE_STANDS` en `src/data/homeCards.ts`: Salmos Café → 12va, Alfa y Omega → 21ra) y los **platillos disponibles** (`/api/menu`, filtrados por `venueName`) solo se muestran si coinciden con esa sede; **sin platillos disponibles en su sede, la sección «Menú» no aparece**. La playlist y su link viven en `PLAYLIST` (mismo archivo).
- **Inscripción Domingo (18 oct 2026):** las pulseras **sin reclamar** (excepto lotes de prueba, cuyo código contiene «test») se reutilizaron como kit *Inscripción Domingo* ($30, 0 aguas, sin beneficios) en el lote `DOMINGO-2`. Es reversible mientras sigan sin registrar (ver §15). Las **aguas del sábado** se muestran inactivas, pero el servidor **todavía no impide** canjearlas.
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
| `npm run db:fotos-huerfanas [-- --borrar]` | Compara las fotos de perfil de Blobs con la base y lista las **huérfanas**; con `--borrar` las elimina (pide escribir `BORRAR`). Por defecto solo lee. Necesita `NETLIFY_SITE_ID`/`NETLIFY_AUTH_TOKEN` en `.env` (§7.4). |
| `npm run db:respaldo` / `db:restaurar` / `db:borrar-respaldo` | Scripts antiguos (reemplazados por los "total"). |
| `npm run db:notas-demo` / `db:likes-demo` | Datos de demostración de Notas (`-- --limpiar` los borra). |
| `npm run db:renombrar-kits` | Utilidad histórica para renombrar kits. |
| `npm run db:lote-domingo [-- --aplicar \| --deshacer CODIGO]` | **Inscripción del domingo.** Sin argumentos es **vista previa** (no escribe): lista las pulseras sin reclamar por lote. Con `--aplicar` (pide `SI`) las mueve a un lote `DOMINGO-N` del kit *Inscripción Domingo*, en una transacción y con bitácora (`batch.reuse`). Con `--deshacer DOMINGO-N` (pide `SI`) devuelve las que sigan sin registrar. Escribe en **la base real**: haz un respaldo antes. |
| `node scripts/db-diagnostico-lotes.mjs` | **Solo lectura**: tabla de pulseras por lote, estado del lote, kit y estado de la pulsera. |
| `npm run moderacion:probar` | Prueba el filtro de lenguaje. |
| `npm run test:ratelimit` | Pruebas del límite de frecuencia (unitarias + integración). Las de integración necesitan `TEST_DATABASE_URL` hacia un PostgreSQL **local** llamado `arraigados_test*` (nunca Neon/producción; el guion se niega). Ver `docs/RATE_LIMITING.md`. |
| `npm run test:team` | Pruebas de pulseras de equipo y autocanje (vinculación, vista de visitante, permisos, concurrencia, anulaciones, tablero, dueño, migraciones 012–015, notas del equipo, descuentos y rifas). Mismas reglas de seguridad que `test:ratelimit` (`TEST_DATABASE_URL` local `arraigados_test*`). Ver `docs/EQUIPO_PULSERA_AUTOCANJE.md`. |
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
   - ⚠️ **Fotos de perfil:** este script borra los perfiles de la base pero **no** los archivos de Blobs (avisa al terminar); límpialos con `npm run db:fotos-huerfanas`. Los respaldos tampoco las incluyen: **no limpies las fotos si aún podrías restaurar** (ver `docs/PLAN_RESPALDO.md`).
4. Desde el panel también puedes **borrar lotes de prueba** uno por uno (Admin → Lotes → lote → ícono de bote).
5. **Orden recomendado:** respaldo → borrar lotes de prueba → (si quedan datos sueltos) `db:limpiar-pruebas` → crear lotes definitivos con `PUBLIC_BASE_URL` ya fijado.

---

## 14. Despliegue

El sitio vive en **Netlify** y se despliega desde este repositorio: un *push* a la rama de producción dispara el build (`npm run build`, publica `dist/`; funciones desde `netlify/functions`).

Checklist antes de desplegar:
- [ ] Variables de entorno configuradas en Netlify (`DATABASE_URL`, `SESSION_SECRET`, `PUBLIC_BASE_URL`; opcional `OWNER_EMAIL`).
- [ ] Migraciones aplicadas (`npm run db:migrar`) contra la base de producción.
- [ ] `npm run build` pasa sin errores.
- [ ] **Rate limiting:** migración 011 aplicada **antes** de desplegar (primero en rama de Neon). Si falta, el límite no se aplica (se registra en logs) y la app sigue funcionando. Checklist completo en `docs/RATE_LIMITING.md`.
- [ ] **Perfil:** migraciones 009 y 010 aplicadas **antes** de desplegar (primero en una rama de Neon) y checklist de `docs/PLAN_RESPALDO.md` («Verificaciones antes de desplegar») completado.
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
- **Inscripción del domingo con pulseras sobrantes:** (1) `npm run db:respaldo-total`; (2) `npm run db:lote-domingo` y revisa el total y el desglose; (3) `npm run db:lote-domingo -- --aplicar` y escribe `SI` enseguida (Neon corta conexiones inactivas); (4) prueba con una pulsera real: debe mostrar $30, sin aguas ni beneficios, y el dashboard sumar 1 en «Inscripción Domingo». Para revertir: `npm run db:lote-domingo -- --deshacer DOMINGO-N`.
- **Cambiar la base de producción (como se hizo el 18 oct):** (1) en una terminal con la `DATABASE_URL` de la base actual: `npm run db:respaldo-total`; (2) en otra terminal **sin** `DATABASE_URL` (usa `.env`) o con la de la base nueva: `npm run db:restaurar-total -- respaldos\total-AAAAMMDD-HHMMSS --reemplazar`, revisando que la línea `Base:` sea la nueva **antes** de escribir `REEMPLAZAR TODO`; (3) comprobar conteos; (4) en Netlify cambiar `DATABASE_URL` **solo en Production** (endpoint pooler) y lanzar *Deploys → Trigger deploy → Clear cache and deploy site* (Netlify no lee la variable nueva hasta el siguiente despliegue); (5) comprobar con una acción registrada en el admin que `SELECT count(*) FROM "AuditLog"` sube en la base nueva y no en la vieja. Las fotos viven en Netlify Blobs, no en la base. *Deploy Previews* y *Branch deploys* conservan su propio valor.
- **Ojo con el `.env` local:** hoy apunta a la base de producción (Wild Butterfly). Revisa siempre la línea `Base:` antes de escribir `SI` o `REEMPLAZAR TODO`.
- **Avisos del dashboard ocultos:** en `src/admin/dashboard/Dashboard.tsx` el bloque `Alerts` lleva `false &&`; quítalo para volver a mostrarlos.
- **Poner el link de la playlist, foto o textos del café:** editar `src/data/homeCards.ts` (`PLAYLIST.url`; `CAFE_STANDS`: título, texto, sede y foto; fotos en `src/assets/brand/`) y desplegar. Sin link, la playlist no se muestra en producción.
- **Mostrar el menú solo con comida disponible:** Admin → Menú → deja *disponibles* solo los platillos que sí hay en cada sede; sin ninguno en la sede del asistente, la sección no sale.
- **Descargar las listas de asistentes por kit:** entra como dueño → Admin → Secreto → botón del kit.

---

## 16. Solución de problemas

| Síntoma | Causa probable y solución |
|---|---|
| `Falta SESSION_SECRET…` / error 500 al iniciar sesión | `.env` sin `SESSION_SECRET` (≥32 caracteres) o sin reiniciar `npm run dev`. |
| `Falta DATABASE_URL` | Falta en `.env` (o en las variables de Netlify en producción). |
| «Demasiados intentos. Espera N…» (`429`) en login, registro, canje o fotos | Es el límite de frecuencia: espera los segundos de `Retry-After`. Para un bloqueo legítimo ver «Operación» en `docs/RATE_LIMITING.md`. |
| `503` «rate_limit_unavailable» | El contador (Neon) no respondió en una regla de fallo cerrado (login/contraseña). Reintenta en unos segundos; revisa Neon. |
| Mi perfil dice «Esta función todavía no está disponible» o el perfil no se ve | Falta aplicar las migraciones 009 y 010 (`npm run db:migrar`). |
| Mi perfil dice «Hiciste un cambio hace un momento. Espera N s» | Es el límite de frecuencia (`429`): espera esos segundos y vuelve a pulsar Guardar (§7.4). |
| Una pantalla del panel dice "Falta aplicar la migración" | Corre `npm run db:migrar` contra esa base (p. ej. 008 para Beneficios). |
| "Kits" aparece deshabilitado ("Etapa 5") o una pantalla nueva no aparece | Estás viendo una versión anterior: sube los cambios (`git push`) y espera el despliegue, o reinicia `npm run dev`. |
| Los QR no se generan en producción | Falta `PUBLIC_BASE_URL` (sin `/` al final). |
| Los QR apuntan a `localhost` | Estás en desarrollo: **no imprimas** esas pulseras. |
| La cámara no abre en el celular | Necesita HTTPS: usa `npm run dev:https` o el dominio real. |
| `El token ... && no es un separador válido` en PowerShell | PowerShell antiguo: ejecuta un comando por línea (no uses `&&`). |
| No puedo eliminar una cuenta | Es la cuenta protegida, la tuya, el último Admin, o tiene historial (lotes/canjes): **desactívala**. |
| Al borrar un lote dice que no se puede | Hay datos que dependen de él; usa `npm run db:limpiar-pruebas`. |
| "Sesión inválida" tras cambiar `SESSION_SECRET` | Esperado: todos deben iniciar sesión de nuevo. |
| `terminating connection due to administrator command` (`57P01`) al correr un script que pide `SI` | Neon cortó la conexión por estar inactiva mientras esperaba tu respuesta. No se escribió nada: vuelve a correrlo y responde de inmediato. |
| El gafete del `/home` muestra el frente al revés al voltearlo (Safari/iOS) | Corregido con un respaldo de visibilidad en `src/pages/homev2/homev2.css` (`.cred-face-front/back`). Si reaparece, revisar ahí. |
| No veo la sección Secreto | Solo la ve el dueño (`OWNER_EMAIL`). |

---

## 17. Documentación adicional

| Archivo | Contenido |
|---|---|
| [`docs/MANUAL_ADMIN.pdf`](docs/MANUAL_ADMIN.pdf) | **Manual de uso para administradores** (PDF con capturas reales, 32 páginas). |
| [`docs/API.md`](docs/API.md) | **Referencia completa de la API** (cuerpos, respuestas, errores, ejemplos). |
| [`docs/CLAUDE_HANDOFF.md`](docs/CLAUDE_HANDOFF.md) | Bitácora técnica detallada, sección por sección (§1–§66), con cada decisión. **Empieza aquí para entender el porqué.** |
| [`docs/MANUAL_USUARIO.md`](docs/MANUAL_USUARIO.md) | **Manual de procedimientos actualizado** (escanear, pulsera propia y vista de visitante) para asistentes, Staff y Admin. Complementa al PDF. |
| [`docs/archive/wallet/README.md`](docs/archive/wallet/README.md) | **Archivo de la integración con Apple/Google Wallet** (cancelada el 17 oct 2026 por alcance y tiempo): qué se hizo, qué faltó y cómo retomarla. |
| [`docs/EQUIPO_PULSERA_AUTOCANJE.md`](docs/EQUIPO_PULSERA_AUTOCANJE.md) | **Pulsera de Staff/Admin, vincular por QR, vista de visitante** (cómo vincular, entrar/volver, estados, permisos, sesión caducada, escáner, limitaciones) y autocanje. |
| [`docs/RATE_LIMITING.md`](docs/RATE_LIMITING.md) | **Límite de frecuencia**: riesgos, arquitectura, límites por endpoint, fallo abierto/cerrado, pruebas, operación y pasos antes de desplegar. |
| [`docs/CAMBIOS_18_OCT.md`](docs/CAMBIOS_18_OCT.md) | **Cambios del 17–18 oct 2026:** Inscripción Domingo, dashboard, aguas inactivas, tarjetas del inicio por sede, Secreto, compresor de fotos y pendientes. |
| [`docs/PLAN_PENDIENTES.md`](docs/PLAN_PENDIENTES.md) | Qué falta por hacer y su estado. |
| [`docs/PLAN_RESPALDO.md`](docs/PLAN_RESPALDO.md) | Plan y comandos de respaldo, restauración y limpieza. |
| [`docs/INFRASTRUCTURE.md`](docs/INFRASTRUCTURE.md), [`docs/CONEXION_NEON.md`](docs/CONEXION_NEON.md), [`docs/PLAN_DOMINIO.md`](docs/PLAN_DOMINIO.md), [`docs/MIGRATION_TO_RED.md`](docs/MIGRATION_TO_RED.md) | Infraestructura, conexión a Neon, dominio y migración. |
| [`docs/MODERACION.md`](docs/MODERACION.md) | Filtro de lenguaje de las Notas. |
| [`docs/NOTAS_DEL_PROYECTO.md`](docs/NOTAS_DEL_PROYECTO.md), [`docs/CAMBIOS_UI.md`](docs/CAMBIOS_UI.md), [`docs/CODIGO_SIN_USO.md`](docs/CODIGO_SIN_USO.md) | Notas históricas, cambios de interfaz y limpieza pendiente. |
| [`docs/RESPALDO_Y_LIMPIEZA.md`](docs/RESPALDO_Y_LIMPIEZA.md) | Guía **antigua** de respaldo (reemplazada por `PLAN_RESPALDO.md`). |

---

*Hecho para la Red Juvenil Tijuana · Arraigados 2K26.*
