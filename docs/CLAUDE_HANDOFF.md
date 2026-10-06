# Handoff · Arraigados 2K26

> Documento de traspaso para retomar el proyecto sin volver a descubrir nada.
> **Última verificación:** 1 oct 2026 (auditoría completa), leyendo el código real
> de `arraigados-app`: `src/`, `server/`, `shared/`, `netlify/functions/`,
> `netlify.toml`, `package.json`, `src/App.tsx`, `src/admin/`, más los
> `prisma/schema.prisma` de la app Next.js (referencia).
>
> ⚠️ **Corrección importante:** `arraigados-app` **NO tiene carpeta `prisma/`**.
> No usa Prisma en absoluto — habla con Neon por SQL crudo (`pg`). Todo lo que este
> documento dice sobre el modelo de datos viene de leer el `schema.prisma` de la
> app Next.js **y contrastarlo** con el SQL real que ejecuta `server/`. Ver §12
> (drift) y §28 (dos copias distintas de `schema.prisma`).
>
>
> 🆕 **Sesión del 1 oct 2026 (noche): avatares Blobatar + Dashboard (Etapa 7 v1).**
> Lo nuevo está en **§34 (Dashboard)**, **§35 (Avatares)** y **§36 (configuración
> global del avatar: Blobatar ↔ Iniciales)**, **§37 (paginación obligatoria)** y
> **§38 (esqueletos de carga)**. Las secciones viejas
> que hablan de `/admin/dashboard` "sin construir" o de iniciales en los avatares
> tienen una nota ⚠️ al inicio; los detalles vigentes están en §34/§35.
>
> **Regla de oro:** antes de cambiar algo, relee el archivo citado. Este documento
> puede quedar viejo; el código no.

---

## 0. Mapa del estado real — lee esto primero

Clasificación verificada contra el código. **No asumas nada por documentación.**

### 0.1 Lo que REALMENTE existe y funciona (contra Neon)

| Área | Qué funciona | Dónde |
|---|---|---|
| Login | Email + contraseña contra `User` en Neon, cookie httpOnly firmada | `netlify/functions/auth-login.mts`, `server/auth.ts` |
| Sesión | `/api/auth/me` monta `StaffSession`; el cliente no guarda token | `src/context/StaffSession.tsx` |
| Roles | `ADMIN` / `STAFF`, validados **en el servidor** | `server/users.ts` |
| Contraseña temporal | Detección por `AuditLog` + fingerprint, sin columna nueva | `server/users.ts`, `server/auth.ts` |
| Cambio de contraseña | Propio (`/api/auth/password`) y reset por Admin | `server/users.ts:169` |
| **Admin Usuarios** | Listar · crear · editar · resetear · activar/desactivar · auditar | `src/admin/Usuarios.tsx` |
| Registro por QR | `/p/:token` → consulta estado → formulario → `POST /api/claim` **atómico** | `src/pages/Registro.tsx`, `server/attendee.ts` |
| Sesión del asistente | Token de pulsera en `localStorage`, cabecera `x-pulse-token`, revalidado por Neon en cada llamada | `src/context/PulseSession.tsx`, `netlify/functions/me.mts` |
| Staff: lookup | Buscar pulsera por **token** o por **código manual** | `netlify/functions/staff-pulse.mts`, `server/staff.ts` |
| Staff: búsqueda | Por nombre (sin acentos) y/o iglesia, solo `ACTIVE` | `server/staff.ts:80` |
| **Staff: canje** | Idempotente, transaccional, con tope de `includedDrinks` | `server/staff.ts:124`, `src/components/RedeemModal.tsx` |
| Iglesias | `GET /api/churches` desde Neon, cache 300 s | `netlify/functions/churches.mts` |
| Paquetes | `GET /api/packages` solo `active = true` | `netlify/functions/packages.mts` |
| Scripts de DB | `db:conteo`, `db:esquema` (solo lectura), `db:migrar`, `db:respaldo`, `db:limpiar-pruebas`, `db:restaurar`, `db:borrar-respaldo` | `scripts/*.mjs` |
| **Admin Dashboard** (Etapa 7 v1) | `/admin/dashboard` (= `/admin`): KPIs, gráficas, filtros globales, actividad, alertas; polling 60 s | `src/admin/dashboard/`, `server/dashboard.ts`, `netlify/functions/admin-dashboard.mts` — ver §34 |
| **Avatares** | Blobatar determinista en todas las personas (`UserAvatar`) | `src/components/UserAvatar.tsx`, `src/lib/avatar.ts` — ver §35 |
| **Admin Lotes** (Etapa 3) | Crear lote (1–500, un paquete), listar, detalle, copiar enlace, QR suelto, PDF A4/Carta/11×17 | `src/admin/Lotes.tsx`, `server/batches.ts`, `server/wristband*.ts` — ver §31 |

### 0.2 Lo que existe como MAQUETA / dato estático

| Cosa | Detalle | Dónde |
|---|---|---|
| Programa, Comida, Recursos, "Ahora", Notificaciones | Datos fijos en un `.ts`, sin red | `src/data/app.ts` |
| **Beneficios de paquetes** | Texto **estático**, indexado por **nombre** de paquete. Rompe si se renombra un paquete en Neon | `src/data/app.ts:124` (`packageContent`), `src/pages/Beneficios.tsx:25` |
| **Instantáneas** (`/instantaneas`) | `useState` local, sin API. **Es "Instants", NO stories** | `src/pages/Instantaneas.tsx:8` |
| `packagesPreview` | Estado inicial, luego lo reemplaza `/api/packages` | `src/data/app.ts:145`, `src/pages/Conocer.tsx:39,44` |
| Lista de iglesias del admin | **Deshabilitada** (falta el listado oficial de ~27 presbiterios / ~120 iglesias) | ver §21 |

### 0.3 Lo que está DOCUMENTADO pero NO implementado

| Cosa | Estado real |
|---|---|
| ~~`/admin/dashboard`~~ | ✅ **Ya existe** desde el 1 oct 2026 (Dashboard, §34) |
| ~~`/admin/asistentes`~~ | ✅ **Ya existe** (Etapa 4, §33) |
| `/admin/paquetes` | No existe (los *beneficios* estáticos no son esto) |
| `/admin/auditoria` | No existe. Sí se **escriben** entradas en `AuditLog`; no hay forma de verlas |
| `/admin/instantaneas` | No existe (distinto de `/instantaneas`, que es maqueta) |
| Reasignación de pulsera | `Pulse.replacesId` existe en la base, pero **cero código** la lee o escribe |
| Generación de `manualCode` (`AR26-…`) | No existe y **no se hará**: desde la Etapa 3 la pulsera es solo `qrToken` (§31) |

### 0.4 Lo que pertenece a la app Next.js antigua (SOLO referencia)

Vive en `C:\Users\javier.castro\Documents\Personal\Projects\` (raíz) y en
`...\Projects\Arraigados\`. **Nada de esto corre en el producto final.**

- Prisma + `schema.prisma` + migraciones (`Arraigados\prisma\`)
- Toda la lógica de **lotes**: `Arraigados\src\lib\pulses.ts` (crear lote, generar
  pulsera, reintento de colisión, PDF de pulseras)
- Generación de tokens: `Arraigados\src\lib\tokens.ts`
- Reasignación: `Arraigados\src\lib\reassign.ts`
- Claim: `Arraigados\src\lib\claim.ts` (la app Vite ya lo **replicó** en `server/attendee.ts`)
- Pantallas `/admin/batches` y `/admin/batches/[id]`

**Regla:** se consulta lógica de ahí, pero al portar se conserva el diseño de Vite.
**Nunca** se copia un nombre de columna sin verificarlo contra `server/` (drift §12).

### 0.5 Lo que pertenece al producto final Vite

`...\Iglesia\arraigados-app\` — **todo lo que se implementa vive aquí.** Estructura
real de `src/`:

```
src/
├── App.tsx              19 rutas (fuente única)
├── main.tsx             BrowserRouter
├── admin/               AdminShell · AdminMas · Usuarios · nav · AdminModal
├── pages/               Cover, Conocer, Login, Registro, Staff, Inicio, Programa,
│                        Beneficios, Comida, Instantaneas, Recursos, Mas,
│                        CambiarContrasena
├── components/          AppShell, Button, Badge, QrScanner, RedeemModal,
│                        ChurchCombobox, Wordmark, RingsMark, …
├── context/             StaffSession (real) · PulseSession (real) · AuthContext (MUERTO)
├── lib/                 api.ts · pulseCode.ts
├── data/                app.ts (mock) · churches.ts (MUERTO)
└── styles/              tokens.css · global.css
```


---

## 1. Las dos aplicaciones (OJO: las rutas reales no son las aparentes)

Hay **dos aplicaciones distintas** y comparten la misma base de datos Neon.

| | App Next.js (referencia) | App Vite (**producto final**) |
|---|---|---|
| Qué es | App antigua. **Solo referencia funcional** | **El producto final** |
| Dónde vive | `C:\Users\javier.castro\Documents\Personal\Projects\` (raíz) | `...\Projects\Congreso Arraigados\Version v2 _ 30 septiembre\Iglesia\arraigados-app\` |
| Stack | Next.js 16.3.7, Prisma 6.19.3, React 19, Tailwind 4 | Vite 5, React 18.3.1, TypeScript, Netlify Functions, `pg` |
| Identidad visual | NO es la fuente de verdad | **ES la fuente de verdad** |
| Qué hacer | Consultar lógica, validaciones, flujo y datos | Aquí se implementa todo |

### Corrección importante sobre la carpeta `Iglesia`

`Iglesia/` **no contiene la app Next.js**. Es una carpeta contenedor que aloja la
app Vite y los recursos de diseño:

```
...\Iglesia\
├── arraigados-app\    ← la app Vite (producto final)
├── rcs\               ← recursos originales (fondos SVG del flyer, logos, citas, sedes)
├── Mockups\
├── instantaneas\
├── platillos\
├── Wallpaper\
├── assets_tmp\
├── logo.png, desktopWallpaper.png, movilWallpaper.png, Credencial.webp
└── .env, .env.example
```

La app Next.js está un nivel **más arriba**, en la raíz de `Projects/`, junto a
`prisma/`, `src/`, `public/`, `next.config.ts`, `package.json`.

⚠️ **Trampa de nombres:** el `package.json` de la app Next.js se llama
`"arraigados-app"` (igual que la app Vite). Para distinguirlas:
- Next.js = `Projects\package.json` con `"next dev"` en scripts y carpeta `prisma/`
- Vite = `...\Iglesia\arraigados-app\package.json` con `"netlify dev"`

### Dos reglas que no se negocian

1. **NO convertir la app Next.js a Vite.** Se porto funcionalidad, no arquitectura.
2. Al bring-over de una función de Next.js a Vite: **conservar el diseño de Vite**.

---

## 2. Arquitectura actual de `arraigados-app`

```
Navegador  →  Vite (5173, proxy)  →  Netlify Dev (8888)  →  /api/*  →  Neon
```

- `npm run dev` = `netlify dev` (levanta Vite + Functions juntos en **http://localhost:8888**)
- `npm run dev:vite` = solo Vite (sin `/api`; las pantallas con datos reales **no cargan**)
- `npm run dev:https` = Vite en https `:5174` para probar la cámara desde el celular

**Usa siempre `http://localhost:8888`, no 5173** — ahí viven las rutas `/api/*`.

### Capas

| Capa | Dónde |
|---|---|
| UI | `src/pages/`, `src/admin/`, `src/components/` — CSS Modules |
| Rutas | `src/App.tsx` (19 rutas, ver §6) + `src/main.tsx` (`BrowserRouter`) |
| Contrato front↔server | `shared/api.ts` (tipos y constantes) |
| Lógica de servidor | `server/` — `attendee.ts`, `auth.ts`, `db.ts`, `http.ts`, `staff.ts`, `users.ts` |
| Functions | `netlify/functions/*.mts` — cada una declara `export const config = { path: ... }` |
| Datos | Neon PostgreSQL, driver `pg` (node-postgres), host pooler |

`server/db.ts` es **la única conexión**: pool máx. 3 conexiones, release a los 10 s
inactivos, `query()`, `withTransaction()`, `newId()`, `NOW_UTC`.

---

## 3. Configuración local (FUNCIONA — no tocar sin motivo)

`netlify.toml` contiene, textualmente:

```toml
[dev]
  framework = "#custom"
  command = "npm run dev:vite"
  targetPort = 5173
  port = 8888
  autoLaunch = false
  functions = "netlify/functions"
  envFiles = ["Congreso Arraigados/Version v2 _ 30 septiembre/Iglesia/arraigados-app/.env"]
```

Lo demás: `[build] command = "npm run build"` / `publish = "dist"`,
`[build.environment] NODE_VERSION = "20"`,
`[functions] directory = "netlify/functions"` + `node_bundler = "esbuild"`,
redirect SPA `/* → /index.html`, headers de seguridad y cache de assets.

### Por qué están esas dos líneas `[dev]`

Netlify Dev resuelve el proyecto raíz (`site.root` / `repositoryRoot`) buscando
`.git` hacia arriba; como **no hay `.git` en ningún lado** (ni en `Projects\` ni
en `arraigados-app\`), cae al fallback y toma `Projects\` como raíz — el proyecto
Next.js. De ahí:

- `functions = "netlify/functions"` → resuelve la carpeta de funciones **relativa al cwd**, corrigió el `404` de `/api/*`
- `envFiles = [...]` → le dice de dónde leer el `.env`, **relativo a `site.root`** (= `Projects\`), porque ahí no hay `.env`

**Consecuencia:** si alguna vez se hace `git init` en `arraigados-app` (o se mueve
el proyecto), estas dos líneas se vuelven innecesarias y **`netlify deploy`
empezaría a subir las funciones correctamente** (hoy subiría 0). Ese cambio es una
decisión, no una urgencia. **Mientras tanto: no tocar.**

> **Nota (2 oct 2026 — auditoría de portabilidad):** esta sección quedó
> **desactualizada**. El proyecto ya tiene su propio `.git` en `arraigados-app`
> (se inicializó y se subió a GitHub en una sesión posterior a la de este
> handoff), así que el escenario descrito arriba ("no hay `.git` en ningún
> lado") ya no aplica. `netlify.toml` se corrigió para usar `envFiles = [".env"]`
> (relativo, sin la ruta personal de carpetas) — ver `docs/INFRASTRUCTURE.md` y
> `docs/MIGRATION_TO_RED.md`. Se deja el texto original sin borrar por su valor
> histórico (explica una decisión real del proyecto), pero no debe tomarse como
> el estado actual.

### `.env` de `arraigados-app`

Contiene: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `SEED_ADMIN_EMAIL`,
`SEED_ADMIN_PASSWORD`, `SESSION_SECRET`.

`.env.example` solo lista `DATABASE_URL` y `SESSION_SECRET` (está incompleto; no
importa para nada, no lo copies encima).

**Nunca** poner credenciales de Neon en el frontend ni en `netlify.toml`.
El frontend habla con `/api/*`; las credenciales viven solo en las Functions.

---

## 4. Autenticación — YA FUNCIONA, no volver a diagnosticar

Flujo: `Vite → Netlify Dev → Netlify Function → Neon → User → cookie httpOnly → /api/auth/me`

Estado: **funcionando y probado.** Login de **ADMIN** verificado.

### Problemas ya resueltos — NO reinvestigar

| Síntoma | Causa | Estado |
|---|---|---|
| `POST /api/auth/login` → **404** | Netlify Dev resolvíó mal la carpeta de functions por la estructura de directorios | ✅ Resuelto con `[dev] functions` |
| `Falta DATABASE_URL en el archivo .env` al hacer login | Netlify Dev buscaba el `.env` en `site.root` (= `Projects\`) | ✅ Resuelto con `[dev] envFiles` |

Si vuelve a aparecer un error de sesión/env, **primero revisa que esas dos líneas de
`[dev]` sigan ahí** y que `npm run dev` se haya reiniciado.

### Endpoints de sesión

| Ruta | Para qué |
|---|---|
| `POST /api/auth/login` | Login por email+contraseña |
| `POST /api/auth/logout` | Cierra sesión |
| `GET /api/auth/me` | Quién es (monta `StaffSession`) |
| `POST /api/auth/password` | El usuario cambia su contraseña |

### Cómo funciona la sesión en el cliente

- `src/context/StaffSession.tsx` — provider con `phase: 'loading' | 'none' | 'ready' | 'error'`.
  **No guarda el token**: solo consulta `/api/auth/me` y conserva el `StaffUser` en memoria.
- La cookie es httpOnly y firmada con `SESSION_SECRET`.
- `homeForRole()` (`StaffSession.tsx:68-71`) decide el destino post-login:
  `mustChangePassword` → `/cuenta/contrasena`; `ADMIN` → `/admin`; resto → `/staff`.
- `pages/Login.tsx:35` — si venías de una ruta protegida (`location.state.from`) y
  eres ADMIN, vuelves ahí; si no eres ADMIN y esa ruta empieza con `/admin`, se descarta.

---

## 5. Roles y protecciones

Roles existentes en Neon: **`ADMIN`** y **`STAFF`** (enum `UserRole`).

| | ADMIN | STAFF |
|---|---|---|
| Panel `/admin/*` | ✅ | ❌ |
| `/staff` | ✅ | ✅ |
| Crear/editar cuentas | ✅ | ❌ |

**El rol se valida en el servidor, no solo en el frontend.** `server/users.ts`
hace `if (!allowed.includes(user.role)) return apiError('No tienes permiso...', 403)`.
`RequireStaff` (`App.tsx:49-62`) es solo la primera barrera visual.

Cualquier acción sensible nueva **debe** repetir la verificación de rol en su Function.

---

## 6. Rutas reales actuales — verificado en `src/App.tsx`

> ⚠️ Tabla del 1–2 oct. Rutas añadidas después: `/home` (inicio real), `/home/mercancia`, `/admin/menu`, `/admin/merch`, `/menu-preview` y la redirección `/inicio → /home`. Ver §41–§45.

> ⚠️ **Tabla histórica (antes de Lotes/Asistentes/Dashboard).** Rutas de Admin
> vigentes, en este orden en `App.tsx` y todas antes del catch-all:
> `/admin` → `ADMIN_HOME` (= **`/admin/dashboard`**, Dashboard) · `/admin/dashboard` ·
> `/admin/lotes` · `/admin/lotes/:id` · `/admin/asistentes` · `/admin/asistentes/:id` ·
> `/admin/usuarios` · `/admin/mas` · `/admin/*` → `ADMIN_HOME`. Las líneas citadas
> abajo ya no coinciden; las rutas de asistente no cambiaron.

19 rutas. Única fuente: `src/App.tsx:76-96`.

| Línea | Ruta | Guard | Renderiza |
|---|---|---|---|
| 77 | `/` | — | `pages/Cover.tsx` |
| 78 | `/conocer` | — | `pages/Conocer.tsx` |
| 79 | `/login` | — | `pages/Login.tsx` |
| 80 | `/registro` | — | `pages/Registro.tsx` |
| 81 | `/p/:token` | — | `pages/Registro.tsx` |
| 82 | `/staff` | `RequireStaff` | `pages/Staff.tsx` |
| 83 | `/cuenta/contrasena` | `RequireStaff` | `pages/CambiarContrasena.tsx` |
| **84** | **`/admin`** | `RequireStaff` adminOnly | **`<Navigate to={ADMIN_HOME} replace />`** — ningún componente |
| 85 | `/admin/usuarios` | `RequireStaff` adminOnly | `admin/Usuarios.tsx` (monta `AdminShell`) |
| 86 | `/admin/mas` | `RequireStaff` adminOnly | `AdminMas` de `admin/AdminShell.tsx:123` |
| **87** | **`/admin/*`** | `RequireStaff` adminOnly | **`<Navigate to={ADMIN_HOME} replace />`** — catch-all |
| 88 | `/inicio` | redirige a `/home` desde el 5 oct 2026 (§41) | — (`pages/Inicio.tsx` sin uso) |
| 89 | `/programa` | idem | `pages/Programa.tsx` |
| 90 | `/beneficios` | idem | `pages/Beneficios.tsx` |
| 91 | `/comida` | idem | `pages/Comida.tsx` |
| 92 | `/instantaneas` | idem | `pages/Instantaneas.tsx` |
| 93 | `/recursos` | idem | `pages/Recursos.tsx` |
| 94 | `/mas` | idem | `pages/Mas.tsx` |
| 95 | `*` | — | `<Navigate to="/" replace />` |

### Notas estructurales

- **No existe ruta layout para Admin.** `AdminShell` no se monta desde `App.tsx`;
  cada pantalla admin lo renderiza por su cuenta (`Usuarios.tsx:77`, `AdminShell.tsx:127`).
  Una pantalla admin nueva debe `import AdminShell` y montarlo explícitamente.
- `RequireAttendee` (`App.tsx:37-42`) exige pulsera activa; sin pulsera → `/registro`.
- Router = `BrowserRouter` en `main.tsx:11`. No hay data routers ni `createBrowserRouter`.

### Redirects (mapa completo)

| Origen | Destino | Dónde |
|---|---|---|
| `/admin` | `ADMIN_HOME` (hoy `/admin/usuarios`) | `App.tsx:84` |
| `/admin/*` (cualquiera) | `ADMIN_HOME` | `App.tsx:87` |
| ruta admin con rol STAFF | `/staff` | `App.tsx:60` |
| ruta protegida sin sesión | `/login` (con `state.from`) | `App.tsx:54` |
| `mustChangePassword` | `/cuenta/contrasena` | `App.tsx:57` |
| asistente sin pulsera | `/registro` | `App.tsx:39`, `SessionGate.tsx:46` |
| post-login / post-cambio de password | `homeForRole()` | `StaffSession.tsx:70`, `Login.tsx:36,70`, `CambiarContrasena.tsx:40` |
| logout (AdminShell / Staff) | `/login` | `AdminShell.tsx:26,174`, `Staff.tsx:87` |
| "Cambiar mi contraseña" | `/cuenta/contrasena` | `AdminShell.tsx:78,162`, `Staff.tsx:173`, `Usuarios.tsx:400` |
| `/staff` → flecha atrás (solo ADMIN) | `/admin` | `Staff.tsx:72` |
| `*` (raíz) | `/` | `App.tsx:95` |

---

## 7. `/admin` → `/admin/usuarios` es INTENCIONAL

> ⚠️ **Actualizado (1 oct 2026, noche):** el mecanismo sigue igual, pero ahora la
> primera sección `ready` de `nav.ts` es el **Dashboard**, así que
> `/admin → /admin/dashboard`. Login de Admin, `/admin` y cualquier `/admin/*`
> desconocida llegan al Dashboard. (Antes de esta sesión iban a `/admin/lotes`.)

**NO es un bug.** Es el comportamiento de diseño del stub actual.

Cadena exacta:

1. `App.tsx:84` — `/admin` renderiza `admin(<Navigate to={ADMIN_HOME} replace />)`
2. `admin()` = `RequireStaff adminOnly={true}` (`App.tsx:64`)
3. `ADMIN_HOME` = `src/admin/nav.ts`:
   ```ts
   export const ADMIN_HOME = ADMIN_SECTIONS.find((s) => s.ready)!.to;
   ```
4. En `nav.ts`, la **única** sección con `ready: true` es `Usuarios`

⇒ `ADMIN_HOME === '/admin/usuarios'` ⇒ `/admin → /admin/usuarios`.

El destino es **derivado de datos**, no hardcodeado. Cuando exista Dashboard y se
marque `ready: true`, `/admin` apunta solo ahí, sin tocar `App.tsx`.

La ruta exacta gana sobre el splat (`App.tsx:84` sobre `App.tsx:87`) por el
algoritmo de ranking de React Router 6.

---

## 8. `/admin/staff` NO existe (y no debe crearse)

- No hay `<Route path="/admin/staff">` en `App.tsx`.
- No hay ningún archivo de "staff" en `src/admin/` (solo `AdminModal.tsx`, `AdminShell.tsx`, `nav.ts`, `Usuarios.tsx`).
- Al visitarla, el catch-all `App.tsx:87` la atrapa y redirige a `/admin/usuarios`.

**NO crear `/admin/staff` para "arreglar" esto.** La navegación correcta ya existe:

```
ADMIN → "Abrir Staff" → /staff
```

Implementada en `AdminShell.tsx:59-63` (sidebar escritorio) y
`AdminMas.tsx:151-157` (dentro de "Más" en móvil).

### ⚠️ Trampa del catch-all

`/admin/*` → `ADMIN_HOME` hace que **toda ruta admin no implementada rebote
silenciosamente a `/admin/usuarios`**, sin distinguir "no existe" de "todavía no
la hice". Mientras se construya por etapas esto va a confundir: una etapa nueva
puede parecer rota cuando solo falta la ruta. Evaluarlo al llega de la Etapa 3.

---

## 9. Estructura administrativa objetivo

```
/admin
├── Dashboard    → /admin/dashboard        (Etapa 7)
├── Lotes        → /admin/lotes          (Etapa 3 — siguiente)
├── Asistentes   → /admin/asistentes     (Etapa 4)
├── Paquetes     → /admin/paquetes       (Etapa 5)
├── Usuarios     → /admin/usuarios       ← ÚNICA IMPLEMENTADA (Etapa 2)
├── Auditoría    → /admin/auditoria      (Etapa 8)
└── Instantáneas → /admin/instantaneas   (Etapa 9)

Admin → Abrir Staff → /staff
```

La **Etapa 6 (Canje de bebidas) NO aparece en el menú** a propósito: el motor de
canje ya existe y funciona (`/api/staff/redeem`, `server/staff.ts:124`), y lo que
falta es la parte de Admin, que aún no está definida. Ver §11.

Móvil: barra inferior `Dashboard · Lotes · Asistentes · Más` (en ese orden, el de
`primary` en `nav.ts`), resto dentro de "Más".

**Estado real vs objetivo:** 6 de 7 secciones son *solo etiquetas* en `nav.ts`,
sin ruta y sin componente.

| Sección | Ruta existe | Componente existe | `ready` | Etapa **oficial** | `stage` en `nav.ts` |
|---|---|---|---|---|---|
| Dashboard | ❌ | ❌ | `false` | **7** | `Etapa 7` ✅ |
| Lotes | ❌ | ❌ | `false` | **3 (siguiente)** | `Etapa 3` ✅ |
| Asistentes | ❌ | ❌ | `false` | **4** | `Etapa 4` ✅ |
| Paquetes | ❌ | ❌ | `false` | **5** | `Etapa 5` ✅ |
| **Usuarios** | ✅ | ✅ | **`true`** | **2 ✅** | sin `stage` |
| Auditoría | ❌ | ❌ | `false` | **8** | `Etapa 8` ✅ |
| Instantáneas | ❌ | ❌ | `false` | **9** | `Etapa 9` ✅ |

✅ **`nav.ts` ya está alineado con el plan oficial** (corregido el 1 oct 2026). Lo
que el usuario ve en pantalla (`AdminShell.tsx:52` y `:108`, `AdminMas.tsx:145`)
coincide con la columna "Etapa oficial".

⚠️ **Nota de alcance:** ese ajuste fue **solo de etiquetas**. No se agregó ninguna
sección, ruta ni componente; `ready` sigue en `false` para las 6 no implementadas,
`ADMIN_HOME` sigue resolviendo a `/admin/usuarios`, y `App.tsx` no se tocó. El
nombre visible cambió de "Resumen" a "Dashboard", pero su `to` sigue siendo
`/admin/dashboard` (no hay ruta; el catch-all la redirige a `ADMIN_HOME`).

ℹ️ El orden de los `primary` en el array sigue siendo Dashboard · Lotes ·
Asistentes. Se dejó como estaba para no alterar la presentación; reordenar a
Lotes · Asistentes · Dashboard es un ajuste opcional si lo quieres visualmente
coherente con el plan. Requiere tu OK.

⚠️ No confundir `/admin/instantaneas` (admin, futuro) con `/instantaneas`
(asistente, ya existe como maqueta). Son rutas distintas.

---

## 10. AdminShell — cómo funciona hoy

Archivo único: `src/admin/AdminShell.tsx`. Dos layouts (sidebar escritorio +
barra inferior móvil) sobre el mismo `Ambient`.

### Sidebar (escritorio) — `AdminShell.tsx:41-56`

Itera los 7 `ADMIN_SECTIONS`:
- `ready: true` → `NavLink` navegable. Hoy **solo Usuarios**
- resto → `<span aria-disabled>` con badge de etapa (`Etapa 3`…`Etapa 7`)

Luego:
- **Herramientas** → `NavLink to="/staff"` "Abrir Staff" (`:59-63`) ✅ ya existe
- **Tarjeta de usuario** → llave = `/cuenta/contrasena` (`:78`), logout = `/login` (`:26`)
- El `Wordmark` del sidebar **no** es link

### Barra inferior (móvil) — `AdminShell.tsx:99-117`

`primary = ADMIN_SECTIONS.filter(x => x.primary)` = `/admin/dashboard`, `/admin/lotes`,
`/admin/asistentes`. **Los tres son `ready: false`** → se renderizan deshabilitados.
Resultado efectivo: 3 ítems muertos + **"Más"** → `/admin/mas`.

⇒ Hoy en móvil lo único navegable del panel es "Más", y desde "Más" solo
funciona "Usuarios" y "Abrir Staff".

### AdminMas (`:123-185`)

Lista las secciones no-`primary` (Paquetes, Auditoría, Instantáneas — todas
deshabilitadas) + "Abrir Staff" + "Cambiar mi contraseña" + "Cerrar sesión".

### Staff — navegación actual

`pages/Staff.tsx`, pantalla standalone, **sin shell ni barra de navegación**.
Únicos destinos:
- Header izq.: si `role === 'ADMIN'` → flecha `ArrowLeft` → `navigate('/admin')` (`:72`). Si es STAFF, un `<span>` inerte
- Header der.: logout → `/login` (`:87`)
- Cuerpo: "Cambiar mi contraseña" → `/cuenta/contrasena` (`:173`)

---

## 11. Etapas — PLAN OFICIAL (1 oct 2026, actualizado por el usuario)

Este es el plan vigente. **Reemplaza** cualquier numeración anterior de este
documento. ✅ Desde el 1 oct 2026 también coincide con lo que muestra el menú
admin (`src/admin/nav.ts`, campo `stage`), ver §9.

```text
Etapa 1 — Base / Autenticación       COMPLETADA
Etapa 2 — Usuarios                   COMPLETADA
Etapa 3 — Lotes                      COMPLETADA — §31
Etapa 4 — Asistentes                 COMPLETADA — §33
Etapa 5 — Paquetes                   PENDIENTE
Etapa 6 — Canje de bebidas           PENDIENTE
Etapa 7 — Dashboard                  COMPLETADA v1 (1 oct 2026) — §34
Etapa 8 — Auditoría                  PENDIENTE
Etapa 9 — Instantáneas               PENDIENTE
```

### El Dashboard va deliberadamente al final

> ⚠️ **Actualizado (1 oct 2026, noche):** el usuario pidió construir el Dashboard
> **ya** (antes de las Etapas 5 y 6). Se hizo sobre los datos que sí existen
> (registros, pulseras, lotes, canjes de Staff). Lo que depende de las Etapas 5/6
> quedó documentado como limitación en §34.8, no inventado.

Dashboard pasó de "Etapa 3" a **Etapa 7**, y **no se construye hasta que estén
terminados Lotes (3), Asistentes (4), Paquetes (5) y Canje de bebidas (6)**.

**Motivo:** el Dashboard debe construirse cuando ya existan **datos reales y
funcionalidad real** de esos cuatro módulos. Si se hiciera antes, tendría que
inventar métricas o duplicar consultas que después habría que reescribir. El
nombre visible de la sección cambió de "Resumen" a "Dashboard" (1 oct 2026) para
que el menú no sugiera un orden distinto al del plan; su ruta sigue siendo
`/admin/dashboard` y **no existe todavía**.

### ⚠️ "Etapa 6 — Canje de bebidas": el motor YA EXISTE

Este es el hallazgo más importante de la auditoría del 1 oct 2026 sobre esa etapa.
Aunque en el plan figure como PENDIENTE, **el backend de canje de bebidas ya está
construido y funciona** (§0.1):

- `POST /api/staff/redeem` → `netlify/functions/staff-redeem.mts`
- `server/staff.ts:124-178`: idempotente con `idempotencyKey`, transacción con
  `UPDATE` condicional y tope contra `Package.includedDrinks`
- `src/components/RedeemModal.tsx`: UI ya integrada en `/staff`, con la llave de
  idempotencia generada una vez por apertura del modal
- Probado: doble clic, 6 toques simultáneos y 5 canjes con 1 de saldo → descuenta 1

Lo que **NO** existe es la parte **administrativa** de ese módulo: no hay pantalla
de Admin para ver canjes, ni historial por asistente, ni anulaciones, ni reportes.

⇒ **La Etapa 6 probablemente consistirá en completar/revisar la experiencia de
canje para Staff y en construir la parte funcional que falte del lado Admin**, no
en escribir el motor de canje desde cero.

**Sigue sin definirse qué incluye exactamente.** Está anotado como decisión
pendiente en §28.9. **No se implementó nada de esta etapa.** Por eso la Etapa 6
**no aparece todavía como sección del menú admin** (`nav.ts`): no se agreedó
nombre, ruta ni icono, y no hay que agregar una sección fantasma.

**Decisión pendiente del usuario:** ¿qué incluye exactamente la Etapa 6? Está
detallado en §28.9. **No se implementó nada** al respecto.

---

## 12. Base de datos (Neon PostgreSQL)

DB `neondb`, role `neondb_owner`. **Es la misma base que usa la app Next.js.**

### Tablas (10 tablas; el modelo Prisma de referencia está en el Next.js)

| Tabla | Campos clave |
|---|---|
| `Zone` | `name` (único) |
| `Presbytery` | `name`, `zoneId` — único (`name`,`zoneId`) |
| `Church` | `name`, `presbyteryId` — único (`name`,`presbyteryId`) |
| `Package` | `name` (único), `price` (centavos MXN), `includedDrinks`, `active` |
| `Batch` | `code` (único, "LOTE-2026-001"), `packageId`, `quantity`, `createdById` |
| `Pulse` | `qrToken` (único, 16 chars base62), `manualCode` (único, `AR26-XXXXX`), `batchId`, `packageId`, `status` enum `UNCLAIMED\|ACTIVE\|INVALIDATED`, `attendeeId`, `claimedAt`, `drinksUsed`, `replacesId` ⚠️ **no existe columna `replacedBy`**: es la back-relación virtual de Prisma, el dato real está solo en `replacesId` |
| `Attendee` | `fullName`, `ageRange`, `churchId` ⚠️ ver abajo |
| `Redemption` | `attendeeId`, `pulseId`, `packageId`, `quantity`, `location` (**nullable, hoy vacío**), `idempotencyKey` (único), `createdById` |
| `User` | `email` (único), `passwordHash`, `name`, `role` enum `ADMIN\|STAFF`, `active` |
| `AuditLog` | `actorId`, `action` (TEXT libre), `entityType`, `entityId`, `metadata` (JSON) |

Enums: `PulseStatus { UNCLAIMED, ACTIVE, INVALIDATED }`, `UserRole { ADMIN, STAFF }`.

### ⚠️ Drift crítico: hay DOS `schema.prisma` distintos, y ninguno refleja la base

**Dato nuevo de la auditoría del 1 oct 2026:** `arraigados-app` no tiene `prisma/`
(no usa Prisma), y en el árbol de `Projects\` hay **dos copias distintas** de
`schema.prisma`:

| Copia | Tamaño | `Attendee.age` | Contenido |
|---|---|---|---|
| `Projects\Arraigados\prisma\schema.prisma` | 13 785 B | `Int?` **+ `ageRange String?`** | 5 migraciones, lotes, staff, PDF, instantáneas |
| `Projects\prisma\schema.prisma` | 7 331 B | `Int` **NOT NULL**, **sin `ageRange`** | solo `0001_init`. **Desfasada** |

⚠️ La copia desfasada es justo la que está **en la raíz de `Projects\`**, o sea la
que se lee primero por costumbre. La base real corresponde a la de
`Projects\Arraigados\`: tiene `ageRange`, y existen las tablas `Instant*` que la
copia antigua ni menciona. **Usa `Arraigados\prisma\schema.prisma` como
referencia y contrasta siempre con `server/`.** No se corrigió nada de esto.

Dentro del SQL versionado de la copia buena (`0001_init/migration.sql`) se declara:

```sql
CREATE TABLE "Attendee" ( ..., "age" INTEGER NOT NULL, ... )   -- línea 126
```

y la migración `0002_age_range/migration.sql` la **deja nullable y agrega**
`ageRange TEXT` + el CHECK `attendee_age_range_valid` (su comentario dice
explícitamente "no borrar `age`", se conserva para filas históricas).

Pero `arraigados-app` **lee y escribe `"ageRange"`** (TEXT con rangos):

- `server/attendee.ts:104` → `INSERT INTO "Attendee" (id, "fullName", "ageRange", "churchId", ...)`
- `server/attendee.ts:150` → `SELECT ..., a."ageRange"`
- `shared/api.ts:12` → `AGE_RANGES = ['16-18','19-21','22-24','25-27','28-30','31-34','35+']`
- `shared/api.ts:9-11` documenta un CHECK en Neon llamado `attendee_age_range_valid`

**La base real tiene ambas columnas** (`age` nullable + `ageRange`); lo que está
mal es la copia de `Projects\prisma\schema.prisma` y el `CHECK`, que no aparece
en `0001_init`.

⇒ **Al escribir cualquier consulta nueva (empezando por Etapa 3), NO copies los
nombres de columna de `Projects\prisma\schema.prisma`.** Usa `ageRange`. Si dudas,
inspecciona la base real antes de escribir SQL.

🚫 **NO corregir este drift automáticamente.** No hay migración aprobada para
alinear `schema.prisma` con Neon. Antes de tocar schema o migraciones hay que
revisar y **aprobar explícitamente** qué copia es la fuente de verdad.

### Otras cosas que hay que saber de la base

- **Vite NO crea ni altera tablas.** Solo `SELECT` / `INSERT` / `UPDATE`.
 (server/db.ts lo dice en su encabezado.)
- `id` no tiene default en la base (Prisma lo generaba): la app lo genera con
  `newId()` (25 chars, empieza con `c`, CSPRNG).
- `updatedAt` no tiene default: la app lo llena en cada INSERT/UPDATE.
- Fechas en UTC con `NOW_UTC` (`now() AT TIME ZONE 'utc'`), nunca `now()` a secas.
- Índice único parcial `pulse_one_active_per_attendee`: **una sola pulsera ACTIVE por asistente**.
- `CHECK pulse_drinks_used_non_negative`.
- Regla de negocio (comentada en `schema.prisma`): **el paquete de una pulsera ACTIVE
  nunca se modifica**. Si se asignó mal → invalidar y reasignar una pulsera nueva
  (flujo de reasignación, `Pulse.replacesId`).

### Datos sensibles

- Existe un usuario administrador inicial (semilla: `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`).
- **NO ejecutar seeds destructivos. NO cambiar contraseñas automáticamente.**
- Scripts disponibles: `npm run db:conteo`, `db:respaldo`, `db:limpiar-pruebas`,
  `db:restaurar`, `db:borrar-respaldo` (ver `docs/RESPALDO_Y_LIMPIEZA.md`).
- `Iglesia\instantaneas\` contiene recursos; no confundir con la functionality.

---

## 13. Flujo QR / asistentes

```
1. Se escanea el QR  →  /p/{qrToken}
2. El servidor verifica el estado de la pulsera
3. Sin reclamar      →  formulario de registro → POST /api/claim
4. Ya reclamada      →  "Mi Congreso" (app: /inicio)
5. El perfil muestra paquete y beneficios
```

- `qrToken`: 16 caracteres base62 (`shared/api.ts:20`).
- Estados de pulsera: `active`, `unclaimed`, `invalidated`, `not_found`.
- **Campos obligatorios del registro público:** Nombre, Edad (rango), Iglesia.
  La iglesia determina **Presbiterio** y **Zona**.
- **El usuario público NO da teléfono ni correo.**
- Sesión del asistente: token en `localStorage`, cabecera `x-pulse-token`.
  El servidor revalida contra Neon en cada consulta.
- **Código manual `AR26-XXXXX`** (`shared/api.ts:100`, alfabeto sin `0/O/1/I/L`):
  **es herramienta exclusiva de Staff**, no es un acceso del asistente.
- Reclamación atómica: transacción crea `Attendee` + `UPDATE Pulse WHERE status='UNCLAIMED'`.
  Probado con 8 reclamos simultáneos → gana 1.

---

## 14. Paquetes y beneficios

| Kit | Precio | Aguas frescas |
|---|---|---|
| A | $100 | 0 |
| B | $150 | 3 |
| Especial | $200 | 3 |

- Precio en **centavos MXN** en la base (`Package.price`), formateado en el front.
- **Los beneficios son texto estático en Vite:** `src/data/app.ts` → `packageContent`,
  indexado por **nombre de paquete** (`Beneficios.tsx:25`).
  Los *números* (precio, `includedDrinks`, `drinksUsed`/`drinksRemaining`) sí vienen de Neon.
  ⚠️ Si alguien renombra un paquete en la base, se rompe la correspondencia con `packageContent`.
- `GET /api/packages` devuelve solo paquetes `active = true`, ordenados por precio.

---

## 15. Staff — `/staff`

Funcionalidad existente (`pages/Staff.tsx`, `server/staff.ts`):
1. Escanear QR con cámara real (`html5-qrcode`)
2. Buscar por nombre y/o iglesia
3. Escribir el código `AR26-XXXXX` a mano
4. Modal de canje (`components/RedeemModal.tsx`) → "Aceptar" descuenta 1 agua

Redenciones — reglas ya implementadas en `server/staff.ts`:
- `Redemption.createdById` = el usuario que canjeó ✅
- **Idempotentes**: `Redemption.idempotencyKey` es UNIQUE + `RedeemRequest.idempotencyKey`
  obligatorio. Probado: doble clic y 6 toques simultáneos → descuenta 1.
- Transacción con `UPDATE Pulse WHERE drinksUsed + 1 <= includedDrinks`
- Sin saldo o Kit A → sin botón "Aceptar" (`insufficient_balance`)
- **`Redemption.location` queda vacío por ahora** (no existe campo sede/venue).
  La zona/iglesia se obtiene del asistente.

**Pulsera perdida o QR dañado:** Staff localiza al asistente y le **reasigna una
pulsera nueva, dejando la anterior `INVALIDATED`** (nunca se borra, así el
historial se conserva). El esqueleto ya existe en el modelo: `Pulse.replacesId`
/ `replacedBy`. **La pantalla de reasignación NO existe en Vite.**

---

## 16. Gestión de usuarios — `/admin/usuarios` (Etapa 2, TERMINADA)

`src/admin/Usuarios.tsx` + `netlify/functions/admin-user.mts`, `admin-users.mts`.

Permite: ver usuarios · filtrar (Todos / Admin / Staff / Pendientes /
Desactivadas) · crear (nombre, email, rol, contraseña temporal generada) ·
editar nombre · cambiar rol · resetear contraseña · desactivar · reactivar.

**Nunca se borran cuentas**, solo se desactivan.

### Protecciones (aplicadas en servidor, `server/users.ts`)

- No puedes degradarte a ti mismo (quitarte ADMIN)
- No puedes desactivarte a ti mismo
- Siempre queda ≥1 ADMIN activo — se valida con `FOR UPDATE` dentro de la
  transacción (`SELECT ... WHERE role='ADMIN' AND active=true FOR UPDATE`)
- Acciones sensibles se registran en `AuditLog`
- Operaciones críticas consideran concurrencia (transacciones + locks)

### Contraseñas temporales — sin cambios de esquema

Detalle importante y no obvio: **no hay columna `pendingPassword`**. Se detecta
con `AuditLog` + huella:

- Cada cuenta creada/reseteda genera una **contraseña temporal** que se le
  entrega al admin **una sola vez** (después no se puede recuperar: solo hay hash).
- Al escribir en `AuditLog` se guarda `{ temporary: true, fp }`, donde `fp` =
  `passwordFingerprint(passwordHash)`.
- `mustChangePassword` = existe un evento reciente con
  `action IN ('user.create','user.password_reset','user.password_change')`
  cuya `fp` todavía corresponde al `passwordHash` actual.
- Al entrar con temporal → forzado a `/cuenta/contrasena`.
- Cambiar/resetear contraseña **invalida sesiones viejas** vía el mismo fingerprint.
- Hash con `bcryptjs`. Nunca texto plano.

### Acciones de `AuditLog` que existen hoy

`user.create` · `user.update` · `user.password_reset` · `user.password_change`

(`action` es TEXT libre, así que la Etapa 6 puede agregar las suyas.)

> La pantalla que consume este flujo (`/cuenta/contrasena`) tuvo un bug de
> bloqueos silenciosos. Ya está **corregido** — ver **§27**.

---

## 17. Endpoint existentes (`netlify/functions/`)

| Ruta | Función | Para qué |
|---|---|---|
| `GET /api/churches` | `churches.mts` | Iglesias con presbiterio, zona y ciudad |
| `GET /api/packages` | `packages.mts` | Paquetes activos |
| `GET /api/pulse/:token` | `pulse.mts` | Estado de la pulsera |
| `POST /api/claim` | `claim.mts` | Registro + reclamación atómica |
| `GET /api/me` | `me.mts` | Datos del asistente (`x-pulse-token`) |
| `POST /api/auth/login` | `auth-login.mts` | Login |
| `POST /api/auth/logout` | `auth-logout.mts` | Logout |
| `GET /api/auth/me` | `auth-me.mts` | Quién es |
| `POST /api/auth/password` | `auth-password.mts` | Cambio de contraseña propio |
| `GET /api/staff/pulse` | `staff-pulse.mts` | Datos de pulsera para canje (solo Staff) |
| `GET /api/staff/search` | `staff-search.mts` | Buscar por nombre/iglesia (solo Staff) |
| `POST /api/staff/redeem` | `staff-redeem.mts` | Canjear 1 agua (idempotente) |
| `GET /api/admin/users` | `admin-users.mts` | Listar cuentas (solo ADMIN) |
| `POST /api/admin/users` | `admin-users.mts` | Crear cuenta (solo ADMIN) |
| `PATCH /api/admin/users/:id` | `admin-user.mts` | Nombre / rol / activo (solo ADMIN) |
| `POST /api/admin/users/:id/password` | `admin-user.mts` | Resetear contraseña (solo ADMIN) |

> ⚠️ Tabla histórica. Endpoints admin agregados después: lotes (§31),
> asistentes (§33), reemplazo de pulsera `POST /api/staff/reassign` (§32) y
> **`GET /api/admin/dashboard`** (§34). Siguen sin existir: paquetes y auditoría.

---

## 18. Instantáneas — funcionalidad futura (¡OJO!)

- `/instantaneas` existe, pero es **MAQUETA LOCAL**: `Instantaneas.tsx:8` usa
  `useState(seedStories)` con datos de `src/data/app.ts`. Sin API, sin Neon.
- **Concepto correcto: Instagram "Instants", NO Stories.** (Ya corregido en el
  `README.md` el 1 oct 2026, en la tabla de rutas: "El concepto correcto es
  'Instants' (Instagram), NO stories".)

Reglas de negocio definidas:
- El usuario toma una foto
- Se publica **inmediatamente**
- Una vez publicada **no puede editarse**
- **No puede sustituirse** por otra foto
- Inicialmente se contempla un **límite por usuario: placeholder 3**
- ADMIN debe poder administrar cuántas instantáneas tiene cada usuario
- Debe existir historial / control administrativo

### 🚫 Antes de implementar: decidir arquitectura de almacenamiento

**NO asumir que Neon guarda las imágenes.** El límite de almacenamiento de Neon
es una preocupación real. Lo probable: **object storage** (Netlify Blobs u otro)
y en Neon **solo metadatos / referencias**.

**NO crear tablas nuevas para Instantáneas hasta que la arquitectura esté
revisada y aprobada.**

---

## 19. Siguiente etapa: Etapa 3 — LOTES (no Dashboard)

> **Reescrito el 1 oct 2026.** Esta sección antes decía "Etapa 3 — Resumen".
> Ya no: el **Dashboard pasó a ser la Etapa 7** (§11) y la siguiente etapa es
> **Lotes**. El análisis completo y las decisiones pendientes están en **§28**.

**Sí, construir `/admin/lotes`** con generación de pulseras, detalle por lote y
exportación imprimible. Lo que sigue aplica a cualquier módulo admin nuevo:

```
/admin → /admin/usuarios      (hoy, porque es la única ready: true)
/admin → /admin/lotes         (objetivo inmediato)
/admin → /admin/dashboard       (Etapa 7, mucho más adelante)
```

`/admin` **no se hardcodea**: `ADMIN_HOME` se deriva de
`ADMIN_SECTIONS.find(s => s.ready)`, así que en cuanto Lotes tenga `ready: true`
`/admin` apunta solo, sin tocar `App.tsx`. Lo que hay que cambiar es el `to` de la
sección que se marque `ready`, no la redirección.

### Antes de escribir código

1. **Decidir lo de §28.9.** Las 10 decisiones previas; las bloqueantes son el
   dominio del QR y si el imprimible es PDF o grid HTML.
2. **Consultas contra el schema REAL** — ojo el drift `ageRange` vs `age` (§12) y
   las dos copias de `schema.prisma` (§28.9 punto 8).
3. **Definir con el usuario qué muestra cada pantalla** antes de maquetar.
4. **Componentes visuales reusables:** `src/components/` → `Badge`, `Button`,
   `ScreenHeader`, `EventCard`, `Ambient`, `DrinkCups`, `Viewfinder`, `QrScanner`,
   `Wordmark`, `RingsMark`. `AdminShell.module.css` ya tiene el grid de contenido.
5. **Identidad visual:** `src/styles/tokens.css` (morado `#3e07a6`, morado oscuro
   `#1e0263`, morado claro `#7b5bff`, crema `#f2f7d7`, ink `#0b0f1a`) +
   Barlow Condensed / DM Sans / EB Garamond / Caveat.

### Cambios previsibles (NO hacer todavía)

- Nuevo componente `src/admin/Lotes.tsx` (que monte `AdminShell`) + su `.module.css`
- Nueva ruta `<Route path="/admin/lotes">` en `App.tsx`, **antes de la línea 87**
  (el catch-all de `/admin/*`, §8)
- `nav.ts` → `ready: true` **solo** en la sección Lotes. ✅ Los `stage` ya están
  corregidos con el plan oficial (§9), no hay que volver a tocarlos
- Endpoints nuevos `netlify/functions/admin-batches.mts` + `server/batches.ts` (§28.6)
- Evaluación pendiente: qué hacer con el catch-all de `/admin/*` (§8)
- `/admin` sigue funcionando **sin cambios**: `ADMIN_HOME` se recalcula solo

---

## 20. Otros documentos del proyecto

| Archivo | Qué es |
|---|---|
| `arraigados-app/README.md` | **Muy completo y actualizado (1 oct 2026).** Stack, cómo correr, API, rutas, estado actual, pendientes, limpieza pendiente. Léelo también. |
| `arraigados-app/docs/CONEXION_NEON.md` | Decisión `pg` vs `@neondatabase/serverless`, config del pool, reglas de compatibilidad Prisma, pruebas realizadas |
| `arraigados-app/docs/RESPALDO_Y_LIMPIEZA.md` | Respaldo y limpieza de datos de prueba |
| `arraigados-app/docs/PLAN_DOMINIO.md` | Del localhost al dominio real: pasos, decisiones pendientes (branches de Neon, `PUBLIC_BASE_URL` para PDF) |
| `Projects\ESTADO_DEL_PROYECTO.md` | Estado del **Next.js** (no del Vite). Many líneas ya obsoletas para la app final |
| `Projects\CLAUDE.md` | Solo `@AGENTS.md` |
| `Projects\AGENTS.md` | Reglas de Next.js 16 generadas por el framework |

`arraigados-app` **no tiene CLAUDE.md ni AGENTS.md propios**; este archivo es el
equivalente.

---

## 21. Deuda técnica y pendientes conocidos

> Los dos bloques siguientes eran la **misma lista**: el primero venía del README
> viejo y el segundo se fue acumulando en auditorías. Se fusionaron el
> 1 oct 2026. Detalle de cada hallazgo en **§29.2**.

### Contenido

- [x] ~~Programa dice "VIE 17 / SÁB 18"~~ ✅ Corregido; y desde el 5 oct `/programa` usa el programa oficial (§46)
- [ ] Notificaciones de Inicio mencionan "Auditorio Principal" y "Recepción Norte"
      (no son las sedes reales)
- [ ] **Lista de iglesias es de relleno** — falta el listado oficial (~27 presbiterios,
      ~120 iglesias). Es el dato más urgente para el congreso
- [ ] Avatar con foto fijo para `javier@redjuvenil.mx`
- [ ] Instantáneas: el concepto correcto es **"Instants"** (Instagram), no "stories"

### Código

- [x] ~~**`src/admin/nav.ts` mostraba la numeración de etapas vieja**~~ ✅
      **Corregido el 1 oct 2026** (solo etiquetas). Ahora coincide con §11:
      Dashboard "Etapa 7", Lotes "Etapa 3", Asistentes "Etapa 4", Paquetes
      "Etapa 5", Auditoría "Etapa 8", Instantáneas "Etapa 9", y "Resumen" pasó a
      llamarse "Dashboard". No se tocó `ready`, ni rutas, ni `ADMIN_HOME`
- [ ] Orden de los `primary` en la barra móvil sigue siendo Dashboard · Lotes ·
      Asistentes. Opcional reordenar a Lotes · Asistentes · Dashboard (pide OK)
- [x] ~~Comentario desactualizado en `src/admin/AdminShell.tsx:16`~~ ✅ Ya corregido (5 oct). Texto original:: sigue diciendo
      "barra inferior Resumen · Lotes · Asistentes · Más". Es solo un comentario
      (no afecta al comportamiento) y quedó fuera del alcance del ajuste de
      etiquetas
- [ ] **Dos `schema.prisma` desalineados**; la copia de la raíz de `Projects\` está
      desfasada (`age` vs `ageRange`, sin tablas `Instant*`). No tocar sin
      aprobación (§12)
- [ ] (Ver inventario actualizado en `docs/CODIGO_SIN_USO.md`; `AuthContext.tsx` ya no existe) `src/data/churches.ts` y `src/context/AuthContext.tsx` no los usa nadie
      (borrables). ⚠️ El segundo tiene contraseñas de demo en **texto plano**
- [ ] `src/components/Wallpaper.tsx`, `assets/brand/logo.png`, `flyer-bg*.webp`,
      `flyer-shapes.webp` sin uso
- [x] ~~`server/auth.ts` decía "máximo 72 caracteres" pero mide bytes~~ ✅ Corregido el 5 oct (§27, §46)
- [ ] `packageContent` (beneficios) indexado por **nombre** de paquete: renombrar
      un paquete en Neon rompe `/beneficios` (§14)

### Proyecto

- [ ] No hay `.git` en ninguna de las dos apps → causa del lío de `site.root` (§3)
- [ ] Excluir del repo lo que genera `tsc -b`: `vite.config.js`, `vite.config.d.ts`,
      `*.tsbuildinfo`, y `dev.log` (están en la raíz, ver §22)
- [x] ~~Optimizar SVG pesados con svgo (`Cita_*.svg` ≈ 348 KB c/u)~~ ✅ 5 oct: 162 KB c/u (§46)
- [ ] Revisar licencias de fuentes demo (Degular, Pressio, Antarctican) y que
      tengan acentos y ñ
- [x] ~~Quitar el recuadro "Datos de prueba" del Login~~ ✅ Ya no existe (verificado 5 oct)

### Datos

- [ ] 6 lotes de prueba `TEST-*` vivos en Neon. ⚠️ `npm run db:limpiar-pruebas`
      los borra **junto con el lote real `LOTE-2026-001` y los 4 asistentes**.
      Decidir qué conservar antes de correrlo
- [ ] `npm run db:respaldo` **no cubre** `User`, `Package`, `Church`, `Zone`,
      `Presbytery` ni `InstantConfig` (`scripts/_db.mjs:39`). Un lote **no es
      reconstruible** desde el respaldo actual

---

## 22. Estado del árbol de trabajo

`arraigados-app/` contiene, además del código:

- `.env` ← **nunca versionar ni compartir**
- `.netlify/` ← cache de Netlify Dev
- `dist/` ← salida de `npm run build`
- `respaldos/` ← respaldos de DB
- `dev.log`
- `deno.lock`, `waves.html`
- `vite.config.js`, `vite.config.d.ts`, `tsconfig.tsbuildinfo`,
  `tsconfig.node.tsbuildinfo` ← artefactos de `tsc -b`

> ⚠️ **Obsoleto desde el 5 oct 2026.** Ya existe repositorio Git
> (`github.com/Javier10Castro/arraigados-app`, rama `main`) y el estado real del
> árbol está en **§45**. `waves.html`, `src/data/merch.ts` y `deno.lock` se
> trataron ahí; los artefactos de `tsc -b` ahora están en `.gitignore`.

---

## 23. Filosofía de trabajo

1. **Leer este documento** primero.
2. **Releer el código actual** después. El código gana si discrepa.
3. **No asumir que algo está implementado** porque aparezca en el plan.
4. **No modificar Neon** (ni esquema ni datos) sin autorización explícita.
5. **No modificar la app Next.js** sin autorización explícita.
6. `arraigados-app` es el producto final. `Iglesia/` es solo referencia funcional
   (y la app Next.js, en la raíz de `Projects/`, también).
7. El diseño visual de `arraigados-app` es la fuente de verdad.
8. **Trabajar por etapas.** Una etapa a la vez.
9. Antes de avanzar a la siguiente etapa, **entregar reporte** y esperar aprobación.
10. **Nunca avanzar automáticamente** de una etapa a otra.
11. Preferir `SELECT`/`INSERT`/`UPDATE` sobre el esquema existente antes que
    migraciones nuevas.
12. **El frontend nunca expone credenciales de Neon.** Toda operación sensible se
    valida en su Function.

---

## 24. Formato de reporte obligatorio (después de cada etapa)

Claude/OpenCode debe informar, exactamente con estos apartados:

### Archivos modificados
Lista exacta de rutas.

### Rutas nuevas/modificadas
Lista exacta, indicando si es nueva, modificada o eliminada, y su efecto en
`ADMIN_HOME` o en el catch-all si aplica.

### Funcionalidad conectada a Neon
Qué consultas/mutaciones se agregaron, contra qué tablas, y confirmar que se
respetó "no alterar el esquema". Si se agregan tablas o columnas, **explicitarlas
y pedir aprobación**.

### Datos de prueba
Qué datos se utilizaron, cómo se generaron, y **cómo limpiarlos después**
(`npm run db:limpiar-pruebas`).

### Pruebas realizadas
Qué se probó en navegador y en backend. Para cambios que toquen idempotencia,
transacciones o saldo, mencionar las pruebas de concurrencia (doble clic,
toques simultáneos, saldos límite).

### Pendientes
Qué falta para considerar la etapa terminada.

### Riesgos o decisiones pendientes
Cualquier decisión arquitectónica que requiera aprobación.

---

## 25. Comandos útiles

```bash
# desarrollo (Vite + Functions en :8888)
npm run dev

# solo Vite (sin /api — las pantallas con datos reales no cargan)
npm run dev:vite

# build (tsc -b && vite build)
npm run build

# mantenimiento de DB (mira docs/RESPALDO_Y_LIMPIEZA.md antes de usarlos)
npm run db:conteo
npm run db:respaldo
npm run db:limpiar-pruebas
npm run db:restaurar
npm run db:borrar-respaldo
```

---

## 26. Verificación

```bash
npm run build     # tsc -b + vite build; pasa sin errores (README:156)
npm run dev       # http://localhost:8888
```

---

## 27. Bug conocido — Cambio de contraseña después de crear usuario

### **CORREGIDO** — 1 oct 2026

> **El problema era una condición `!current` utilizada por el botón pero no
> representada visualmente entre las reglas del formulario.**

### Síntoma reportado

Al crear una cuenta ADMIN desde `/admin/usuarios`, iniciar sesión con la
contraseña temporal y llegar correctamente a `/cuenta/contrasena`, **el botón
"Guardar contraseña" aparecía deshabilitado** sin explicación, aun escribiendo una
contraseña nueva válida y su confirmación.

### Causa original (100 % frontend)

El `Button` de envío se calculaba con **cuatro** condiciones:

```tsx
<Button type="submit" block disabled={busy || !current || !longEnough || !matches || !different}>
```

pero la lista de requisitos mostrada en pantalla solo listaba **tres**:
`longEnough`, `matches` y `different`. La condición **`!current`** no tenía
ninguna fila, así que existía un estado en el que el botón se veía deshabilitado
(`Button.module.css:83-85` → `opacity: 0.6; cursor: not-allowed`) **con las 3
reglas en verde y cero explicación**.

Agravantes:

- La etiqueta del campo era "Contraseña temporal" (solo en modo forzado), que se
  lee como campo informativo; su placeholder es `'••••••••'`.
- Los inputs no tenían `name` ni `required`, así que ni el navegador ni el gestor
  de contraseñas los reconocían.
- En el flujo forzado **no hay nada guardado para autocompletar** (la contraseña la
  eligió el Admin, no el usuario), a diferencia de un usuario con contraseña
  propia. Por eso solo se manifestaba en cuentas recién creadas.
- El handler hacía `if (!longEnough || !matches || !different) return;` —
  **fallaba en silencio**; `error` solo se asignaba en el `catch` de la llamada API.

El backend era y sigue siendo correcto: `changeOwnPassword()`
(`server/users.ts:169-173`) y `passwordProblem()` (`server/auth.ts:180-182`) ya
validaban todo. El `disabled` es un atributo HTML nativo: la petición nunca salía.

### Archivos afectados

**Un solo archivo de código:** `src/pages/CambiarContrasena.tsx`

Sin cambios en: `server/auth.ts`, `server/users.ts`,
`netlify/functions/auth-password.mts`, `src/context/StaffSession.tsx`,
`src/lib/api.ts`, `src/admin/Usuarios.tsx`, `netlify.toml`, Neon, schema.

### Correcciones aplicadas (1+2+3+4)

| # | Cambio | Dónde |
|---|---|---|
| 1 | Nueva regla visible `Escribe tu contraseña temporal` / `... actual` que refleja `current`, con la nueva variable `hasCurrent` | `CambiarContrasena.tsx:40`, `:150` |
| 2 | `firstProblem()` devuelve el primer incumplimiento y `submit` lo muestra en `error` en vez de hacer `return` mudo. Sigue sin llamar a la API | `CambiarContrasena.tsx:52-68` |
| 3 | `name` en los inputs: `currentPassword`, `newPassword`, `newPasswordConfirm`. Payload de `api.changePassword` intacto | `CambiarContrasena.tsx:81-104`, `:138-146` |
| 4 | Límite de 72 bytes replicado con `new TextEncoder().encode(s).length`, equivalente a `Buffer.byteLength(s, 'utf8')` de `passwordProblem()`. Nueva regla visible `Máximo 72 bytes` | `CambiarContrasena.tsx:25-26`, `:42`, `:152` |

Además: `valid` agrupa las cinco condiciones (`CambiarContrasena.tsx:45`), el botón
usa `disabled={busy || !valid}` (`:168`) y el `onChange` de los tres inputs limpia
el mensaje de error (`:98-101`).

### Regla `different` — INTACTA A PROPÓSITO

`different = next.length > 0 && next !== current` se conservó **sin tocar**
(`CambiarContrasena.tsx:44`).

⚠️ **No eliminar ni relajar esa regla bajo ninguna circunstancia.** Si un usuario
pudiera "cambiar" la contraseña temporal por sí misma, el evento
`user.password_change { temporary: false }` limpiaría la bandera de forzado
**manteniendo una contraseña temporal válida**, que el Admin cree temporal y que
puede haber dictado en voz alta. Es un hole de seguridad, no un problema de UX.

La validación del frontend **no sustituye ni relaja** al backend: el servidor
sigue siendo la autoridad y se llega a él sin cambios.

### Detalle cosmético pendiente (NO se cambió, fuera de alcance)

`server/auth.ts:182` devuelve `"La contraseña es demasiado larga (máximo 72
caracteres)"`, pero `passwordProblem()` mide con `Buffer.byteLength(...,'utf8')`.
El texto dice **caracteres** donde debería decir **bytes**: es engañoso justo en el
caso de `ñ`/emoji (37 `ñ` = 74 bytes = 37 caracteres). El frontend ya dice
"bytes" correctamente. **No se tocó el backend**; si más adelante se autoriza,
es un cambio de una sola cadena de texto en `server/auth.ts`.

### Pruebas realizadas

- `npm run build` (`tsc -b && vite build`): **sin errores**. No hay script de `lint`
  ni configuración de ESLint en `arraigados-app`.
- Paridad de bytes frontend↔backend sobre 11 casos (ASCII, `ñ` multibyte, emoji,
  límite exacto de 72 bytes, 73 bytes): **idéntica**.
- E2E real con Chrome headless vía CDP contra `netlify dev` + Neon, **44
  comprobaciones, todas OK**:
  1. Crear cuenta ADMIN desde la API de `/admin/usuarios` → temporal
     `Arraigados-XXXX-XX`
  2. Login con la temporal → `mustChangePassword: true` → `/cuenta/contrasena`
     ("Crea tu contraseña")
  3. **Escenario del bug:** temporal vacía + nueva válida + confirmación → botón
     **sigue deshabilitado**, 5 reglas visibles, "Escribe tu contraseña temporal"
     en PENDIENTE y las otras 4 CUMPLIDAS
  4. Submit inválido → mensaje útil (ya no hay fallo silencioso)
  5. Seguridad: `current` = temporal y `new` = temporal → botón bloqueado, regla
     "Distinta" PENDIENTE
  6. Reglas: mínimo 8 caracteres, 37 `ñ` (=74 bytes) y confirmación distinta
     bloquean con su mensaje; **cero llamadas a `/api/auth/password`** en cualquier
     caso inválido
  7. Escribir la temporal → botón habilitado, regla cumplida, error limpiado
  8. Guardar → redirige a `/admin/usuarios` (`/admin` → `ADMIN_HOME`)
  9. La temporal da **401**; la nueva da 200 con `mustChangePassword: false`
  10. `/api/auth/me` con la sesión nueva → 200, `mustChangePassword: false`
  11. La cuenta ya no aparece como "pendiente" en `/admin/usuarios`
  12. `/api/staff/search` responde 200 (ya no bloquea otras secciones)
  13. Flujo normal (no forzado): título "Cambiar mi contraseña", regla pide la
      "contraseña actual", cambio guardado y la contraseña anterior invalidada
  14. Cuentas de prueba desactivadas al terminar (el sistema no borra cuentas)

### Resultado final

**Bug resuelto.** El backend no necesitó ninguna modificación. La sesión del
usuario sobrevive al cambio (cookie nueva con la huella del hash nuevo) y las
demás sesiones de esa cuenta se cierran, igual que antes.

---

## 28. Etapa 3 — Lotes: análisis previo

> ⚠️ **Histórico.** Este fue el análisis previo; la Etapa 3 ya se implementó y lo
> que manda ahora es **§31**. Se conserva como contexto.
>
> (Texto original:) 🚫 **NO SE IMPLEMENTÓ NADA DE ESTA SECCIÓN.** Es solo análisis, verificado
> contra el código, para decidir antes de escribir la primera línea.

### 28.1 Objetivo

Que el Admin pueda **crear lotes de pulseras desde la app final**, verlos,
descargar sus QR y saber cuántos se reclamaron. Hoy eso solo se puede hacer con
el admin del Next.js.

### 28.2 Estado real del dominio pulsera/QR (verificado)

**Formato de los identificadores** — la app final los **valida** (`shared/api.ts`):

```ts
QR_TOKEN_RE    = /^[0-9A-Za-z]{16}$/                        // shared/api.ts:20
MANUAL_CODE_RE = /^AR26-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/  // shared/api.ts:100
```

(El alfabeto manual excluye `0 O 1 I L` para evitar confusiones de lectura.)

🔴 **La app final NO genera ninguno de los dos.** El único uso de criptografía en
`server/` es `randomBytes(24)` dentro de `newId()` (`server/db.ts:80`) para los
`id`. `shared/api.ts:19` incluso comenta *"tokens.ts del Next.js"* reconociendo
que la generación vive afuera. Búsqueda de `randomBytes | crypto | nanoid |
generateQr | generateManual | base62` en `server/` + `shared/`: **solo `db.ts:80`**.

**Estados de pulsera.** En la base, enum de 3 valores
(`0001_init/migration.sql:28`), default `UNCLAIMED`:
`UNCLAIMED | ACTIVE | INVALIDATED`.

En la API pública la app final expone **4** (`shared/api.ts:33-37`,
mapeo en `server/attendee.ts:50-53`):

| API | Significado en pantalla (`Registro.tsx:154-190`) |
|---|---|
| `not_found` | "No encontramos esta pulsera" |
| `invalidated` | "Esta pulsera ya no es válida" |
| `active` | Ya es tuya → `/inicio` |
| `unclaimed` | Muestra formulario de registro |

**Flujo completo del asistente (funciona):**

```
/registro (escanear)  ─┐
/p/:token (QR impreso)─┴→ parsePulseCode → GET /api/pulse/:token
                            ├─ active      → guarda token → /inicio
                            ├─ unclaimed   → nombre + rango edad + iglesia
                            │                → POST /api/claim  (transacción)
                            │                → /inicio
                            ├─ invalidated → aviso
                            └─ not_found   → "no encontramos"
```

- El **token ES la credencial**: cabecera `x-pulse-token`, nunca en la URL
  (`me.mts:6-8`). Se revalida contra Neon en **cada** llamada.
- Claim atómico (`server/attendee.ts:86-127`): transacción `INSERT Attendee` +
  `UPDATE Pulse SET status='ACTIVE' WHERE id=$1 AND status='UNCLAIMED'`; si
  `rowCount = 0` hace rollback total (incluido el asistente recién insertado).
  Probado con 8 reclamos simultáneos → gana 1.
- El **código manual `AR26-XXXXX` es herramienta exclusiva de Staff**
  (`staff-pulse.mts`), no un acceso del asistente.
- `Redemption.location` está **vacío a propósito** (no hay campo sede/venue); la
  zona se obtiene del asistente.

### 28.3 Datos que YA existen en Neon (no hay que crearlos)

| Dato | Estado confirmado |
|---|---|
| 7 lotes | 1 real `LOTE-2026-001` (50 pulseras) + 6 `TEST-*` (2 c/u) = 62 pulseras |
| 62 pulsera | 58 `UNCLAIMED`, 4 `ACTIVE`, **0 `INVALIDATED`** — la invalidación nunca se ha ejercido |
| 7 entradas `AuditLog` `action="batch.create"` | 1:1 con esos 7 lotes |
| `Package` | 3 activos (Kit A $100 / 0 aguas, Kit B $150 / 3, Especial $200 / 3) |
| `Church` / `Zone` / `Presbytery` | Poblados; lo usa `GET /api/churches` |

Fuente: `respaldos\respaldo-20261001-163301.json` (JSON, sin conexión a Neon).

### 28.4 Datos que FALTAN

| Falta | Impacto |
|---|---|
| **Generación de `qrToken` y `manualCode`** | No se puede crear ninguna pulsera desde la app final |
| **Endpoint de lotes** (no existe ninguno) | El admin no puede listar/crear lotes |
| **Cero consultas SQL a `Batch`** | Verificado: `Batch`, `batchId`, `replacesId` **no aparecen** en `server/*.ts`. Solo en `scripts/_db.mjs:48` (nombre de tabla para borrar) y en textos de `nav.ts`/`Usuarios.tsx` |
| **Reasignación** | `Pulse.replacesId` sin usar. Pulsera perdida = asistente sin acceso |
| **PDF / grid imprimible** | No hay forma de imprimir las pulseras desde la app final |
| **Auditoría de pulses en la UI** | Se escriben eventos; no hay pantalla que los vea |

### 28.5 Funciones necesarias (propuesta, NO implementada)

1. Listar lotes con `claimedCount` (el `groupBy` ya existe en Next.js: `pulses.ts:223-244`).
2. Crear lote: elegir `Package`, cantidad, genera N pulseras en transacción.
3. Detalle del lote con tabla de estados (`Sin reclamar` / `Activa` / `Invalidada`).
4. Descargar QR (PDF o grid imprimible).
5. Reasignar pulsera (requiere `replacesId` + invalidar la vieja).
6. Marcar lote como "entregado/cerrado" — **no está claro si hace falta**, decidir.

### 28.6 Endpoints que probablemente hagan falta

```
GET  /api/admin/batches            listar
POST /api/admin/batches            crear lote + pulseras   (ADMIN)
GET  /api/admin/batches/:id        detalle con pulsera
POST /api/admin/batches/:id/pdf    o   GET .../qr          generar imprimible
POST /api/admin/pulses/reassign    invalidar vieja + activar nueva  (ADMIN)
```

Todos **ADMIN** y siguiendo el patrón de `admin-users.mts` / `admin-user.mts`
(`export const config = { path }` + `authorize()` + validación de rol en servidor).

### 28.7 Riesgos

| # | Riesgo | Mitigación propuesta |
|---|---|---|
| R1 | **Dominio congelado en el QR.** El QR impreso graba la URL; cambiarla después invalida pulseras ya repartidas | Decidir `PUBLIC_BASE_URL` **antes** del primer lote real (`docs/PLAN_DOMINIO.md:15-21`) |
| R2 | **Colisión de `manualCode`.** Espacio 32⁵ ≈ 33.5 M; el Next.js ya documenta ~738 colisiones en 200k códigos | Portar el reintento de 5 intentos ante `P2002`/23505 (`pulses.ts:25-52`) |
| R3 | **Lotes de 5000 pulsera** + timeout 60 s en Next.js. Netlify Functions tiene timeout propio (por defecto 10 s en plan gratis; configurable) | Decidir tamaño máximo por lote y si se genera en background |
| R4 | **Trampa del catch-all**: `/admin/lotes` hoy rebota silenciosamente a `/admin/usuarios` (`App.tsx:87`) | Añadir la ruta **antes** del catch-all |
| R5 | **Drift `age`/`ageRange`** al escribir el `JOIN` de asistentes | Solo `ageRange`; contrastar con `server/attendee.ts` |
| R6 | **Índice único parcial `pulse_one_active_per_attendee`**: la reasignación debe invalidar la vieja **antes** de activar la nueva | Portar el orden exacto de `reassign.ts:48-55` |
| R7 | El saldo (`drinksUsed`) **se reinicia** en una reasignación, no se traslada | Decidir si es aceptable |
| R8 | `packageContent` de Beneficios está indexado por **nombre** de paquete | No renombrar paquetes; o cambiar a índice por id |

### 28.8 Dependencias

**Con Asistentes (Etapa 4):** Lotes es la fuente de "quién reclamó qué". La
tabla `Pulse` tiene `attendeeId`, pero **no hay listados ni filtros por asistente
en la app final**. Se puede construir Lotes sin Asistentes (solo `claimedCount`),
pero el **detalle por asistente** sí necesita el módulo de Asistentes.

**Con Paquetes (Etapa 5):** cada lote pertenece a **un** `Package`
(`Batch.packageId`, FK `RESTRICT`). Hoy `/api/packages` solo da los activos, pero
**no existe pantalla admin de paquetes**. Para crear un lote se necesita leer los
paquetes: se puede hacer con `/api/packages` sin esperar a la Etapa 5.
⚠️ La regla de negocio es que **el paquete de una pulsera ACTIVE nunca cambia**
→ un lote mal asignado se corrige invalidando, no editando.

**Con el flujo público `/p/:token`:** es la dependencia más delicada. El token
que genera Lotes es **la credencial** del asistente. Un token mal generado
(fuera del regex, repetido, con dominio equivocado) produce pulseras que **no se
pueden reclamar ni recuperar**, y como no se puede volver a generar el mismo
token, hay que invalidar y reasignar. Los QR del Next.js apuntan hoy a
`localhost:3000/p/...`, no al dominio de Vite
(`docs/PLAN_DOMINIO.md:34-37`). **Hay que resolver el dominio antes de imprimir
lotes reales.**

### 28.9 Qué DECIDIR antes de escribir código

1. **`PUBLIC_BASE_URL` definitivo** (R1). Bloqueante para lotes reales.
2. **¿Lotes imprimibles en PDF (portar `wristband-pdf.ts`) o solo grid HTML?**
   El Next.js tiene el PDF con plantilla oficial y 3 tamaños de papel; portarlo
   es la opción cara pero fiel.
3. **¿Lote manual (`AR26-XXXXX`) siempre, o también un QR legible sin escáner?**
4. **¿Máximo por lote y timeout de la Function?** (R3)
5. **¿Un lote se puede "cerrar"?** ¿Qué pasa con un lote entregado a un punto de
   registro externo?
6. **Etapa 6 "Canje de bebidas"**: el motor **ya existe** y funciona (§11). ¿Qué
   falta exactamente? ¿Solo el panel de Admin de canjes, o también revisar y
   completar la experiencia de canje del lado Staff? No se agregó la sección al
   menú hasta que esté definido.
7. ~~**Corregir `src/admin/nav.ts`**~~ ✅ **Hecho el 1 oct 2026** (solo etiquetas,
   §9). Ya no bloquea el inicio de la Etapa 3.
8. **Definir cuál `schema.prisma` es la fuente de verdad** y sincronizar la copia
   desfasada de `Projects\` (§12).
9. **¿Reasignación entra en Lotes o en otra etapa?** Hoy no está en ninguna.
10. **Los 6 lotes `TEST-*` siguen en la base.** `npm run db:limpiar-pruebas` los
    borra **junto con el lote real y los 4 asistentes**. Decidir qué conservar
    **antes** de ejecutar ese script.

---

## 29. Auditoría del 1 oct 2026 — hallazgos y cambios documentales

Tarea de **solo documentación** (§29). Ningún archivo de producción fue modificado.

### 29.1 Correcciones aplicadas a ESTE documento

| Sección | Antes | Ahora |
|---|---|---|
| Encabezado | Declaraba haber leído `prisma/` **de arraigados-app** | Aclarado que **no existe**: el schema es del Next.js, y hay **2 copias** |
| §0 (nueva) | — | Mapa de estado real en 5 categorías |
| §9 | Etapas del `nav.ts` presentadas como el plan | Tabla con **plan oficial** + columna `stage` real, y **✅ alineadas** tras el ajuste de etiquetas |
| §11 | "Etapa 3 = Resumen" | **Plan oficial 1-9**, Dashboard a Etapa 7, Lotes a Etapa 3 |
| §11 | "Etapa 6 pendiente" sin contexto | Aclarado que **el motor de canje ya existe**; lo pendiente es la parte Admin/Staff |
| §12 | "las 7 del modelo Prisma"; `replacedBy` como columna | 10 tablas; `replacedBy` aclarado como back-relación virtual |
| §12 | Drift sin contexto de las 2 copias | Drift ampliado + prohibición explícita de corregirlo |
| §19 | "Etapa 3 — Resumen" | "Etapa 3 — LOTES", con las 5 decisiones previas de §28 |
| §28 (nueva) | — | Análisis previo de Lotes |
| §30 (nueva) | — | Registro del ajuste de etiquetas en `nav.ts` |

### 29.2 Hallazgos que NO se corrigieron (requieren decisión o están fuera de alcance)

| # | Hallazgo | Por qué no se tocó |
|---|---|---|
| ~~H1~~ | ~~`src/admin/nav.ts` mostraba etapas viejas~~ | ✅ **Resuelto el 1 oct 2026** — ver §30 |
| H2 | **Dos `schema.prisma` desalineados**, la desfasada en la raíz de `Projects\` | Tocar schema/migraciones está prohibido sin aprobación |
| H3 | **`src/context/AuthContext.tsx` tiene contraseñas en texto plano** (`javier@…`, `diana@…`) | Archivo **muerto** (nadie lo importa). Borrarlo es limpieza destructiva → requiere OK |
| H4 | **`src/data/churches.ts` muerto** | Igual que H3 |
| H5 | `src/components/Wallpaper.tsx` sin usar | Limpieza destructiva → requiere OK |
| H6 | 6 lotes `TEST-*` vivos en la base | Borrarlos exige correr `db:limpiar-pruebas`, que **también borra el lote real y los 4 asistentes** |
| H7 | **`db:respaldo` no cubre** `User`, `Package`, `Church`, `Zone`, `Presbytery`, `InstantConfig` (`scripts/_db.mjs:39`) | Cambiar qué se respalda es decisión tuya; un lote no es reconstruible desde el respaldo actual |
| H8 | `server/auth.ts:182` dice "máximo 72 caracteres" pero mide **bytes** | Backend fuera de alcance (§27) |
| H9 | Lista de iglesias del admin deshabilitada; falta el listado oficial | Falta el dato, no el código |
| H10 | `README.md` describía Instantáneas como "stories" | Corregido en la §18 de este doc; el README se actualizó en esta auditoría |
| H11 | Comentario de `AdminShell.tsx:16` sigue diciendo "Resumen" | Es un comentario, no comportamiento; el cambio quedó acotado a `nav.ts` |
| H12 | Orden de la barra móvil: Dashboard · Lotes · Asistentes | No se reordenó para no alterar la presentación; requiere OK |

### 29.3 Lo que este documento NO pudo verificar

- El **contenido real** de las tablas en Neon: se leyó
  `respaldos\respaldo-20261001-163301.json`, no se conectó a la base. Las cifras
  (7 lotes, 62 pulseras) son de ese respaldo del 1 oct 2026 y pueden haber
  cambiado.
- Los QR de los lotes reales: si apuntan al dominio correcto (§28.9 R1).
- El estado de `docs/PLAN_DOMINIO.md` y `docs/RESPALDO_Y_LIMPIEZA.md` no se
  revalidaron a fondo; se citan como referencia.

---

## 30. Ajuste de etiquetas de etapas en el menú (1 oct 2026)

Resuelve el hallazgo **H1**. Cambio **únicamente de etiquetas** en
`src/admin/nav.ts`.

| Sección | Ruta (`to`, sin cambios) | `label` antes → ahora | `stage` antes → ahora |
|---|---|---|---|
| Dashboard | `/admin/dashboard` | Resumen → **Dashboard** | `Etapa 3` → **`Etapa 7`** |
| Lotes | `/admin/lotes` | Lotes | `Etapa 4` → **`Etapa 3`** |
| Asistentes | `/admin/asistentes` | Asistentes | `Etapa 5` → **`Etapa 4`** |
| Paquetes | `/admin/paquetes` | Paquetes | `Etapa 5` (sin cambio) |
| Usuarios | `/admin/usuarios` | Usuarios | sin `stage` (sin cambio) |
| Auditoría | `/admin/auditoria` | Auditoría | `Etapa 6` → **`Etapa 8`** |
| Instantáneas | `/admin/instantaneas` | Instantáneas | `Etapa 7` → **`Etapa 9`** |

**La Etapa 6 (Canje de bebidas) NO se agregó** al menú: el motor ya existe (§11) y
falta definir qué incluye antes de crear una sección.

### Lo que explícitamente NO cambió

- `ready` de las 6 secciones no implementadas: sigue en `false`
- `ADMIN_HOME`: sigue resolviendo a `/admin/usuarios` (única `ready: true`)
- `primary`: los mismos 3 (`/admin/dashboard`, `/admin/lotes`, `/admin/asistentes`)
- `src/App.tsx`: **19 rutas, sin cambios**
- Backend, autenticación, Neon, schema: sin cambios
- Orden del array: intacto (Dashboard · Lotes · Asistentes)

`npm run build` pasó sin errores después del cambio. No hay lint configurado en el
proyecto, así que no se pudo correr.

---

## 31. Etapa 3 — Lotes: implementación (1 oct 2026)

**OpenCode** empezó la etapa y se quedó sin capacidad; **Claude** la retomó a partir del
estado real de los archivos (no del historial de OpenCode), la auditó, corrigió y terminó.

### 31.1 Decisiones definitivas (no cambiar)

- Máximo **500** pulseras por lote; si se necesitan más, se crean varios lotes (sin procesamiento por bloques).
- La pulsera se identifica **solo por `qrToken`**. No se generan `AR26-…` nuevos.
- QR = `{PUBLIC_BASE_URL}/p/{qrToken}`. `PUBLIC_BASE_URL` es la única fuente del dominio y
  queda **grabado** en cada QR impreso. **Desarrollo (cambio del 1 oct 2026):** se deja vacío y el
  enlace usa el origen de la petición si es localhost → `http://localhost:8888/p/…`. En producción,
  si falta, la app no genera QR (no adivina el dominio).
- `/admin/lotes` solo ADMIN. `Batch.status` nace en `ABIERTO`. **No** hay cerrar lote, reasignación,
  reemplazo ni anulación (eso no es Etapa 3).
- PDF con la **plantilla oficial**; tarjetas de **50 × 35 mm exactos**; A4, Carta y 11×17; nunca se
  escalan para llenar la hoja; no se imprime desde un grid HTML.

### 31.2 Qué hizo OpenCode (y se conservó)

| Pieza | Archivo | Estado heredado |
|---|---|---|
| Migración `Batch.status` | `migrations/001_batch_status.sql` + `scripts/db-migrate.mjs` | Correcta e idempotente. Según el reporte de OpenCode **ya se aplicó en Neon**: confirmarlo con `npm run db:esquema` y **no** volver a correrla |
| Lógica de lotes | `server/batches.ts` | Correcta: validación 1–500, nombre único, transacción única (lote + N pulseras + `AuditLog batch.create`), `qrToken` CSPRNG base62 sin sesgo, reintento ante carrera |
| Endpoints | `netlify/functions/admin-batches.mts`, `admin-batch.mts` | Correctos salvo el 404 (ver 31.3) |
| Medidas y QR | `server/wristband.ts` | Correcto: 50×35 mm en puntos reales, `QR_BOX` igual a la referencia |
| PDF | `server/wristbandPdf.ts` | Medidas correctas; **lento** (ver 31.3) |
| Plantilla | `src/assets/plantillas/template_card_clean.png` → `server/plantilla.generated.ts` (`npm run plantilla:base64`) | Copia idéntica a `Arraigados\qr_template\template_card_clean.png` (SHA-256 `542c44d9…421a`) |
| Pantalla | `src/admin/Lotes.tsx` + `.module.css`, ruta en `App.tsx`, `nav.ts` (`ready: true`) | Funcional |
| `.env.example` | `PUBLIC_BASE_URL` documentada | OK |

### 31.3 Qué corrigió Claude

| Problema encontrado | Efecto | Corrección |
|---|---|---|
| **Staff no podía canjear pulseras de Lotes.** `manualCode` = `QRONLY:<token>`; Staff validaba `AR26-…` antes de abrir/canjear | Escanear mostraba al asistente, pero "Aceptar" respondía `pulse_not_active`; Buscar no abría el resultado. Kit B / Especial sin aguas frescas | `shared/api.ts`: `normalizeStaffCode()` acepta `AR26-…` y `QRONLY:<qrToken>`; `pulseCodeLabel()` lo muestra como `QR aBcD…`. Usado en `server/staff.ts`, `RedeemModal.tsx`, `Staff.tsx`. `AR26-…` antiguos siguen igual |
| **PDF de 500 pulseras: >30 s** (500 PNG incrustados) | `netlify dev` cortaba la función a los 30 s: el PDF nunca llegaba (en Netlify el límite es aún menor) | El QR se dibuja **en vectores** (`qrMatrix` + un `drawSvgPath` por QR). 500 pulseras ≈ 2.5–3 s, ~0.85 MB. Mismo contenido, nivel `Q`, zona quieta de 1 módulo |
| Regla de calibración a 2.1 mm del borde | Las impresoras no imprimen ahí: la regla se perdía | A 4.9 mm del borde, texto a la derecha de la línea |
| Lote inexistente → **400 "Falta el lote"** | `netlify dev` reintenta un 404 como archivo estático (`…/index.html`) y esa llamada llega sin parámetros | Sin id → 404 con el mensaje correcto |
| Sin `PUBLIC_BASE_URL` el enlace era relativo (`/p/…`) | Se copiaba un enlace inservible | `qrUrl` vacío y la pantalla avisa |
| QR de prueba (`localhost:5173/p/…`) sin `/api` | La página de registro abierta desde un QR de desarrollo daba 404 | `vite.config.ts`: proxy `/api` → 8888 en el puerto 5173, **con marca anti-ciclo** (sin ella netlify dev ↔ Vite se reenvían sin fin y netlify dev se cae con EMFILE) |
| Sin aviso de dominio de prueba | Riesgo de imprimir QR con `localhost` | Aviso en el detalle del lote si `PUBLIC_BASE_URL` es localhost |
| Lista de lotes apretada en celular; "1 activas" | Texto en columna angosta | Conteos en su propia fila; singular/plural |
| `npm run test:lotes` apuntaba a un archivo que no existe | Comando roto | Se quitó (las pruebas crean datos; no deben correrse contra Neon real) |
| No había forma de revisar Neon sin escribir | — | `npm run db:esquema`: SOLO LECTURA (sesión `READ ONLY`), estructura real + verificación de la migración 001 + conteos |

⚠️ **`vite.config.js` gana sobre `vite.config.ts`.** `tsc -b` (parte de `npm run build`) genera
`vite.config.js` a partir del `.ts`, y Vite carga primero el `.js`. Si se edita el `.ts`, hay que
correr `npm run build` (o `npx tsc -b`) para que el cambio tome efecto.

### 31.4 Medidas del PDF (verificadas leyendo el PDF generado)

| Papel | Página | Tarjetas por hoja | Hojas para 500 |
|---|---|---|---|
| A4 | 210.0 × 297.0 mm | 3 × 7 = 21 | 24 |
| Carta | 215.9 × 279.4 mm | 3 × 7 = 21 | 24 |
| 11×17 | 279.4 × 431.8 mm | 5 × 11 = 55 | 10 |

- Las 500 colocaciones de la plantilla miden **50.000 × 35.000 mm** en los tres papeles (bbox leído con PyMuPDF).
- QR impreso: **21.49 mm** por lado (33 módulos + 1 de zona quieta por lado ≈ 0.61 mm por módulo).
- Regla: **50.000 mm**, a 4.94 mm del borde inferior.
- Decodificación: render a 300 dpi del PDF A4 completo → **500/500** QR leídos con jsQR, en el mismo
  orden y con la misma URL que guarda Neon. A 600 dpi, la página 1 de cada papel: 21/21, 21/21, 55/55.
- La medida se garantiza porque las tarjetas se colocan en **puntos PDF** (1 pt = 1/72 in) calculados
  desde centímetros (`CARD_W = 5 cm`, `CARD_H = 3.5 cm`); la cuadrícula cuenta cuántas caben y centra el
  sobrante, nunca reduce la tarjeta. Si sale distinto en papel, es el diálogo de impresión ("ajustar a la
  página"): la regla de 5 cm lo delata.

### 31.5 Pruebas (base local creada con las 5 migraciones del Next.js + 001, sin tocar Neon)

API: lote válido; lote de 500 en ~0.4 s; rechazo de 0, 501, −3, 2.5, "abc", null;
paquete inexistente; nombre vacío y duplicado; Staff y sin sesión → 403/401 en todas las rutas; 500
tokens únicos con formato correcto; relaciones Batch/Pulse/Package; estado `ABIERTO`; `qrUrl`; QR suelto
(PNG decodificable = URL de Neon); PDF A4/Carta/11×17; papel inválido; 5 altas simultáneas con el mismo
nombre → 1 gana; 4 simultáneas distintas → 4; 0 pulseras huérfanas, 0 lotes descuadrados, 0 tokens
duplicados. Regresión de Staff: canje de pulsera nueva, doble envío con la misma llave (descuenta 1),
pulsera sin reclamar, token alterado, `AR26-…` en minúsculas (sigue funcionando).
Navegador (escritorio y celular): login Admin → `/admin/lotes`; Sugerir; 501 deshabilita el botón;
crear lote; aviso de localhost; copiar enlace; bajar QR; bajar PDF Carta; Staff no entra a
`/admin/lotes`; Staff busca y canjea una pulsera nueva desde la pantalla. `npm run build` sin errores.

### 31.6 Ajustes pedidos por el usuario (1 oct 2026, tarde)

- El detalle del lote ya no es un modal: página propia `/admin/lotes/:id` (`src/admin/LoteDetalle.tsx`)
  con tabla `# · Kit · Estado · Código · Copiar · Descargar`. Al crear un lote se abre su página.
- "Paquete" → **"Kit"** en toda la interfaz (la ruta `/admin/paquetes` y los nombres internos no cambian).
- Nombres de kits en Neon: `npm run db:renombrar-kits` (A → "Kit - A", B → "Kit - B", C → "Especial";
  solo cambia `Package.name`, deja `AuditLog package.rename`). Lo corre el usuario.
- Descargas (PDF y QR) vía `downloadFile()` en `src/lib/api.ts`: si el servidor responde con error se
  muestra el mensaje en vez de guardar un `.json` (eso pasaba cuando faltaba `PUBLIC_BASE_URL`).
- Fechas cortas en el panel (`1 oct, 23:00`, `src/admin/format.ts`) y barras de desplazamiento con la
  paleta de la app (`src/styles/global.css`).

### 31.7 Verificación en Neon (1 oct 2026)

`npm run db:esquema` corrido por el usuario contra Neon (`neondb`): la estructura de `Batch`, `Pulse`,
`Package` y `Attendee` es **idéntica** a la réplica local con la que se probó (mismas columnas, tipos,
defaults, CHECKs, llaves foráneas e índices; `Package.price`, `Attendee.age` + `ageRange`). Migración
001 aplicada (columna, CHECK e índice). Datos en ese momento: 109 iglesias, 3 kits ("Kit - A",
"Kit - B", "Especial"), 5 usuarios, 1 lote con 50 pulseras solo-QR, 0 asistentes, 0 canjes.
`npm run build` pasa en la máquina del usuario. **Etapa 3 cerrada.**

### 31.8 Pendiente (fuera de la Etapa 3)
- Dominio definitivo en `PUBLIC_BASE_URL` antes de imprimir pulseras reales.
- Cerrar/cancelar lote, reasignación, anulación: etapas futuras.

---

## 32. Reemplazo de pulsera desde Staff (2 oct 2026)

Pedido por el usuario después de cerrar la Etapa 3: si una pulsera se pierde o se daña, Staff le
asigna una nueva al mismo asistente y la anterior queda **Deshabilitada** (estado `INVALIDATED`
de Neon; sin cambios de esquema: se usan `status` y `Pulse.replacesId`, que ya existían).

- **Servidor:** `server/staff.ts` → `reassignPulse()`; ruta `POST /api/staff/reassign`
  (`netlify/functions/staff-reassign.mts`), Staff o Admin.
- **Reglas:** la actual debe estar ACTIVE con asistente; la nueva debe existir, estar UNCLAIMED y ser del
  **mismo kit**. Una transacción con las dos filas bloqueadas: 1) la actual → INVALIDATED, 2) la nueva →
  ACTIVE para el mismo asistente con `replacesId` = la actual, 3) `AuditLog pulse.reassign`.
- **Aguas frescas:** decisión del usuario: la nueva **hereda `drinksUsed`** (si ya canjeó 1 de 3, sigue
  con 1 de 3). El Next.js las reiniciaba a 0. Los canjes viejos (`Redemption`) quedan ligados a la
  pulsera anterior.
- **Doble toque:** repetir la misma petición responde `ok` sin hacer nada más. Dos Staff reemplazando
  la misma pulsera a la vez: gana uno; el otro recibe `old_not_active`.
- **Efectos:** escanear la vieja muestra "Esta pulsera ya no es válida" / "Pulsera deshabilitada"; la
  sesión del celular con la vieja se cierra sola (`/api/me` → 401) y el asistente entra con la nueva.
- **Pantalla:** en el modal de Staff, enlace "Reemplazar pulsera (perdida o dañada)" → escanear la nueva
  (la cámara de la pantalla se apaga mientras: `onCameraNeeded`) → confirmar (actual → nueva y aguas)
  → listo. En la tabla del lote el estado se llama **Deshabilitado** y muestra "Nombre · reemplazada".
- **Probado** (réplica local): kit distinto, pulsera ya con dueño, misma pulsera, inexistente, OK con
  1 de 3 usada, doble toque, reemplazar una ya deshabilitada, carrera de dos Staff, sin sesión, sesión
  del asistente con la vieja y con la nueva, y el flujo completo en el navegador con cámara simulada.

---

## 33. Etapa 4 — Asistentes (2 oct 2026)

Decisiones aprobadas por el usuario:
- **Admin puede corregir** nombre, rango de edad e iglesia de un asistente. No se
  borran asistentes ni se cambia su kit (para eso está el reemplazo de pulsera, §32).
- El filtro **"estado" = estado de sus aguas**: con aguas / agotadas / su kit no incluye.
- Sin cambios de esquema: solo lee y actualiza `Attendee`; cada corrección deja
  `AuditLog` `attendee.update` con `{campo: {from, to}}`.

### 33.1 Servidor
- `server/attendees.ts`: `listAttendees` (búsqueda por palabra, sin acentos, vía
  `translate(lower(...))`; filtros zona / presbiterio / iglesia / kit / aguas; solo
  asistentes con pulsera ACTIVE; 50 por página), `attendeesCatalog`, `getAttendee`
  (datos + todas sus pulseras, activa primero, + canjes con nombre del Staff),
  `updateAttendee` (mismas validaciones que el registro, `FOR UPDATE`, diff + audit;
  si no cambió nada devuelve `{changed:false}` y no escribe).
- `netlify/functions/admin-attendees.mts`: `GET /api/admin/attendees` y
  `GET /api/admin/attendees/catalog` (solo ADMIN).
- `netlify/functions/admin-attendee.mts`: `GET` / `PATCH /api/admin/attendees/:id`
  (solo ADMIN; 404 si falta el id, por el reintento de `netlify dev`).

### 33.2 Pantallas
- `/admin/asistentes` (`src/admin/Asistentes.tsx`): buscador con pausa de 300 ms,
  selects en cascada zona → presbiterio → iglesia, kit, chips de aguas, "Limpiar
  filtros". **Los filtros viven en la URL** (`?q=&zona=&presbiterio=&iglesia=&kit=&aguas=&pagina=`),
  así que al volver del detalle se conservan. Tabla `# | Nombre | Iglesia (presb · zona) |
  Edad | Kit | Aguas | Registro | ›`; en celular solo `# | Nombre (+ iglesia) | Aguas | ›`.
- `/admin/asistentes/:id` (`src/admin/AsistenteDetalle.tsx`): tarjeta con datos y botón
  **Corregir** (modal con nombre, edad e iglesia con buscador); pulsera activa y
  "Pulseras anteriores" (tachadas, con enlace a su lote); aguas (vasitos) e historial de canjes.
  El título dice "Asistente" y el nombre va en la tarjeta: Pressio no tiene acentos.
- `src/admin/nav.ts`: Asistentes `ready: true`. `src/App.tsx`: ambas rutas antes del catch-all.

### 33.3 Verificación
- API: catálogo, filtros (los tres estados de aguas suman el total), búsqueda
  "maria lopez" → "María Fernanda López", detalle con 2 pulseras y canje, corrección
  con audit, validaciones 400, Staff 403, el asistente ve su nombre corregido.
- Navegador (escritorio y celular): búsqueda, filtros, cascada, detalle, modal; 0 errores JS.
- `npm run build` OK.

---

## 34. Etapa 7 — Dashboard operativo v1 (1 oct 2026, noche)

### 34.1 Estado antes de esta sesión
- Solo existía la etiqueta "Dashboard" en `src/admin/nav.ts` (`/admin/dashboard`,
  `ready: false`). No había ruta, componente, endpoint ni consultas de métricas.
- Lo reutilizable que ya existía y se usó: el mismo FROM "población" de
  `server/attendees.ts` (asistentes con pulsera ACTIVE), el catálogo de filtros
  `GET /api/admin/attendees/catalog`, los filtros en la URL de Asistentes y los
  estilos de tarjeta crema del panel.

### 34.2 Qué se construyó

| Pieza | Archivo |
|---|---|
| Endpoint `GET /api/admin/dashboard` (solo ADMIN, solo lectura) | `netlify/functions/admin-dashboard.mts` |
| Consultas y cálculo de métricas/alertas | `server/dashboard.ts` |
| Contrato (tipos, zona horaria, días del evento, umbrales, refresco) | `shared/api.ts` (bloque "Admin -> Dashboard") |
| Pantalla `/admin/dashboard` | `src/admin/dashboard/Dashboard.tsx` + `Dashboard.module.css` |
| Gráficas propias (sin librería) | `src/admin/dashboard/charts.tsx` + `charts.module.css` |
| Actividad reciente (pestañas) | `src/admin/dashboard/ActivityFeed.tsx` |
| Polling 60 s | `src/admin/dashboard/useDashboard.ts` |
| Formatos (hora de Tijuana) | `src/admin/dashboard/format.ts` |
| Cliente | `api.dashboard()` en `src/lib/api.ts` |
| Navegación | `nav.ts` (Dashboard `ready: true`, primero ⇒ `ADMIN_HOME`), `App.tsx` (ruta antes del catch-all), `AdminShell` prop `wide` (1440 px) |

**Sin cambios de esquema.** Una sola petición trae todo el tablero (≈20 consultas
SQL en paralelo sobre el pool de 3 conexiones; ~70 ms con 350 asistentes en la
réplica local).

### 34.3 Definiciones de métricas (no ambiguas)

Todas las fechas de Neon son UTC sin zona (como Prisma). **Todo lo que se agrupa
por día u hora se convierte a `America/Tijuana`** (`EVENT_TIMEZONE`). "Hoy" = día
calendario de Tijuana según el reloj de **la base** (`now()`), no del navegador.

| Métrica | Definición exacta | Fuente |
|---|---|---|
| **Población** | Asistentes (`Attendee`) que tienen una pulsera `ACTIVE`. Es el mismo conjunto que lista Admin → Asistentes, así los totales coinciden. | `Attendee ⋈ Pulse(ACTIVE)` |
| **Registrados** | `count(Población)` cuyo `Attendee.createdAt` cae en el periodo (todo = sin límite). | ídem |
| **Momento del registro** | `Attendee.createdAt` (el claim crea el asistente y activa la pulsera en la misma transacción). **No** `Pulse.claimedAt`: un reemplazo lo reescribe. | `Attendee.createdAt` |
| **Registros de hoy / ayer** | Registrados con `createdAt` en el día de hoy/ayer (Tijuana). Respetan zona/presbiterio/iglesia/kit, **no** el periodo. "vs ayer" solo si ayer > 0. | ídem |
| **Pulseras impresas** | Todas las filas de `Pulse` (cualquier estado) = las generadas en lotes. Se asume que todo lo generado se imprime. | `Pulse` |
| **Pulseras reclamadas** | `Pulse.status = ACTIVE`. | `Pulse` |
| **Sin reclamar** | `Pulse.status = UNCLAIMED` (disponibles para repartir). | `Pulse` |
| **Deshabilitadas (anuladas)** | `Pulse.status = INVALIDATED`. Hoy solo las produce el reemplazo de pulsera (§32). | `Pulse` |
| **% registrados** | Registrados ÷ pulseras impresas. Solo se muestra sin filtros de periodo ni geografía (con filtros no es comparable). | — |
| **Aguas incluidas** | Σ `Package.includedDrinks` de las pulseras ACTIVE de la población (periodo + filtros). | `Pulse ⋈ Package` |
| **Aguas canjeadas** | Σ `LEAST(Pulse.drinksUsed, includedDrinks)` de esas mismas pulseras. Es el **saldo**, no el flujo. | `Pulse.drinksUsed` |
| **Aguas restantes** | Σ `GREATEST(includedDrinks − drinksUsed, 0)`. | ídem |
| **% consumido** | canjeadas ÷ incluidas. | — |
| **Canjes (flujo)** | Filas de `Redemption` (cada canje de Staff deja una; `quantity` hoy siempre 1). Se usa para "por hora", "por Staff", "por día" y "en el periodo". | `Redemption` |
| **Valor estimado** | Σ `Package.price` (centavos, columna `price`) de la población. **No son pagos**: el sistema no registra pagos. | `Package.price` |
| **Velocidad · Última hora** | Registros con `createdAt` en los últimos 60 min (ventana móvil). Solo si el día foco es hoy. | `Attendee.createdAt` |
| **Velocidad · Promedio** | Registros del día foco ÷ horas entre la primera hora con registros y la hora actual (si es hoy) o la última hora con registros. Requiere ≥ 2 registros; si no, "Sin datos suficientes". | ídem |
| **Velocidad · Máximo** | La hora (bucket de 60 min) con más registros del día foco. | ídem |
| **Día foco** | El día del periodo elegido; si el periodo es "Todo", hoy. Lo usan "por hora" y "velocidad". | — |
| **Edades** | `Attendee.ageRange` en el orden de `AGE_RANGES`. Si es null y existe la edad vieja (`age`), se ubica en su rango; si no, "Sin dato". | `Attendee` |
| **Representación** | Iglesias / presbiterios / zonas distintas con ≥ 1 registrado. | — |

> Saldo vs flujo: en operación normal Σ `drinksUsed` (pulseras activas) =
> Σ `Redemption.quantity`, porque el reemplazo de pulsera **hereda** `drinksUsed`.
> Podrían diferir solo con datos viejos del Next.js (que reiniciaba a 0 al reasignar).

### 34.4 Arquitectura: de dónde sale cada módulo

```text
Neon (Attendee, Pulse, Package, Church→Presbytery→Zone, Redemption, User, Batch, AuditLog)
  → server/dashboard.ts  getDashboard(filtros)   (SQL con parámetros, solo SELECT)
  → netlify/functions/admin-dashboard.mts        (authorize ADMIN + parseFilters)
  → GET /api/admin/dashboard  →  api.dashboard()  →  useDashboard (polling 60 s)
  → src/admin/dashboard/Dashboard.tsx
```

| Nivel / módulo | Campo de la respuesta | Tablas |
|---|---|---|
| 1 · Registrados | `registered`, `pulses` | Attendee/Pulse |
| 1 · Registros de hoy (+ tendencia 7 días) | `registeredToday`, `registeredYesterday`, `byDay` | Attendee |
| 1 · Aguas entregadas | `drinks` | Pulse/Package |
| 1 · Kits | `kits` | Pulse/Package |
| 1 · Valor estimado | `valueCents`, `kits[].valueCents` | Package.price |
| 1 · Pulseras reclamadas | `pulses` | Pulse |
| 2 · Registros por día | `byDay[].registrations` | Attendee |
| 2 · Registros por hora + velocidad | `byHour`, `velocity` | Attendee |
| 2 · Presbiterio / Zona / Top 10 iglesias | `byPresbytery`, `byZone`, `topChurches` | Attendee/Church/… |
| 3 · Distribución de kits (dona + tabla) | `kits` | Package |
| 3 · Aguas + canjes por hora | `drinks`, `byHour[].redemptions`, `redemptions` | Pulse, Redemption |
| 3 · Canjes por Staff | `redemptions.byStaff` | Redemption ⋈ User |
| 4 · Edades / representación | `ages`, `coverage` | Attendee |
| 5 · Actividad reciente | `activity` | Attendee (registros), Redemption (canjes), AuditLog `pulse.reassign` (reemplazos) |
| 5 · Sábado vs Domingo | `eventDays` (null si ningún día del congreso tiene actividad) | Attendee, Redemption |
| 5 · Estado de pulseras / lotes | `pulses`, `batches` | Pulse, Batch |
| Alertas | `alerts` | varias (globales) |

No se creó una "tabla de actividad" nueva: el feed mezcla registros, canjes y la
única acción operativa que ya se audita (`pulse.reassign`). Los registros y canjes
**no** escriben `AuditLog` (igual que el Next.js), por eso se leen de sus tablas.

### 34.5 Filtros globales

En la URL: `?periodo=&zona=&presbiterio=&iglesia=&kit=` (mismos nombres que
Asistentes). Periodo: `all` (Todo), `today`, `yesterday`, `2026-10-17`, `2026-10-18`.
El servidor valida: id con formato inválido o periodo inválido → **400**.

| Módulo | Periodo | Zona/Presb./Iglesia | Kit |
|---|:-:|:-:|:-:|
| Registrados, kits, valor, aguas (saldo), presbiterio/zona/iglesias, edades, representación | ✅ | ✅ | ✅ |
| Registros de hoy / ayer | ❌ (siempre hoy/ayer) | ✅ | ✅ |
| Registros por día, Sábado vs Domingo | ❌ (todos los días) | ✅ | ✅ |
| Por hora y velocidad | día foco = día del periodo (o hoy) | ✅ | ✅ |
| Canjes (resumen, por Staff, por hora) | ✅ | ✅ (iglesia del asistente) | ✅ (kit del canje) |
| Actividad reciente | ✅ | ✅ | ✅ |
| Estado de pulseras / lotes | ❌ | ❌ (una pulsera sin reclamar no tiene iglesia) | ✅ |
| Alertas | ❌ | ❌ | ❌ (son globales a propósito) |

Cada tarjeta que no respeta un filtro lo dice en su nota. Clic en presbiterio,
zona o iglesia → `/admin/asistentes` con ese filtro + zona/presbiterio/iglesia/kit
actuales (Asistentes **no** tiene filtro de periodo; ese no se traslada).

### 34.6 Alertas operativas (umbrales en `DASHBOARD_THRESHOLDS`, `shared/api.ts`)

| Alerta | Regla | Nivel |
|---|---|---|
| Aguas al N% | Canjeadas ÷ incluidas (global) ≥ 80% | Atención; ≥ 95% Crítico |
| Lote casi agotado | Lote `ABIERTO` con ≥ 10 pulseras y sin reclamar ≤ 10% | Atención |
| Lote sin pulseras libres | Lote `ABIERTO` con ≥ 10 pulseras y 0 sin reclamar | Aviso |
| Kit con pocas pulseras | Kit con ≥ 20 pulseras y sin reclamar ≤ 5% | Atención; 0 libres = Crítico |
| Sin actividad | Hoy es día del congreso, entre 09:00 y 22:00 (Tijuana), ya hubo actividad hoy y la última (registro o canje) fue hace ≥ 30 min | Aviso |

No hay alerta de "errores operativos": hoy no se guarda ningún registro de errores
que se pueda consultar (los errores solo van al log de la función).

### 34.7 Diseño y gráficas
- Mismo lenguaje del panel: fondo morado del flyer, tarjetas **crema**, mosaicos
  KPI **blancos**, Pressio para números grandes, Barlow Condensed para títulos.
  (Se mantuvo el fondo morado del panel aprobado en vez de un fondo crema completo.)
- Gráficas con HTML/CSS/SVG propios (`charts.tsx`): barras horizontales, columnas,
  dona, barra apilada y medidor. **No se agregó ninguna dependencia.**
- Paleta categórica validada con el validador de la skill de dataviz sobre crema
  y blanco: Kit 1 `#5b2bd6`, Kit 2 `#b8740c`, Kit 3 `#1d8a66` (por orden de precio,
  fijo por kit). Registros = morado, aguas/canjes = verde.
- Tooltips al pasar el cursor, valores directos y tablas ocultas para lectores
  de pantalla; la identidad nunca va solo por color.
- Responsive: 1 columna en celular, 2–3 en escritorio; ancho máx. 1440 px.

### 34.8 Limitaciones y dependencias (no se inventó nada)
- **Pagos**: no existen en el sistema → "Valor estimado" = precio de lista, con aviso.
- **Etapa 5 (Paquetes)**: los kits y precios se leen tal cual de `Package`.
  Si un kit se renombra o cambia de precio, el valor estimado usa el precio **actual**.
- **Etapa 6 (Canje, parte Admin)**: no hay anulaciones de canje; "canjes" = todas
  las filas de `Redemption`. `Redemption.location` sigue vacío → no hay "canjes por sede".
- **Sede** del asistente: no existe en la base → no hay métricas por sede (12va/21ra).
- **Lotes**: `CERRADO`/`CANCELADO` se muestran si existen, pero no hay UI para cerrarlos.
- **Clic en un Staff**: no lleva a detalle (no existe pantalla de canjes por Staff).
- Las alertas y estados de pulsera/lote no respetan los filtros geográficos (§34.5).

### 34.9 Próximos pasos
1. **Exportar reporte**: el botón está deshabilitado ("próxima iteración"). Opción
   simple: CSV generado en el servidor con las mismas consultas.
2. **Modo operativo** (pantalla del congreso): ruta `/admin/dashboard?modo=pantalla`
   que oculte filtros y menú y muestre solo registrados, aguas, registros por hora,
   presbiterios, kits y actividad, con tipografía más grande. Toda la data ya está
   en la misma respuesta; es solo una vista.
3. Detalle de canjes por Staff (cuando se defina la Etapa 6).
4. Si el volumen crece mucho: índices en `Attendee("createdAt")` y
   `Redemption("createdAt")` (requiere migración aprobada).

### 34.10 Verificación
- Réplica local de Postgres 16 con el esquema de §12 y datos sintéticos (352
  asistentes, 450 pulseras, 355 canjes, 1 reemplazo): cada número del endpoint se
  contrastó con SQL directo (registros de hoy en hora de Tijuana, Σ drinksUsed =
  Σ Redemption, filtros combinados, día del congreso 17 oct 18:30 UTC → 11:00).
- Seguridad: sin sesión → 401; STAFF → 403; POST → 405; filtro inválido → 400.
- Base vacía: sin errores; la pantalla muestra el estado vacío.
- Navegador (1440 px y 390 px): todas las secciones, filtros, enlaces a
  Asistentes, polling (petición nueva a los 60 s), 0 errores de JS.
- `npm run build` OK. No se probó contra Neon real desde esta sesión.

---

## 35. Avatares con Blobatar (1 oct 2026, noche)

### 35.1 Antes
- Círculos con iniciales (`initials()` de `PulseSession.tsx`) en AppShell, Más,
  AdminShell, Usuarios (lista y modal), LoteDetalle y AsistenteDetalle.
- Inicio ya usaba una prueba: `components/BloBatar.tsx` con `name={fullName}` y
  semilla de respaldo `'javier-castro'`.
- Instantáneas usaba una foto fija (`assets/img/avatar.webp`).

### 35.2 Ahora
- **Componente único:** `src/components/UserAvatar.tsx` (`seed`, `name`, `size`,
  `alt`, `className`, `background`, `title`). Envuelve `<Blobatar>` de
  `@blobatar/react`; recorta en círculo y llena el contenedor. El tamaño, borde y
  fondo los sigue poniendo la clase CSS de cada pantalla, así que **los diseños
  no cambiaron**, solo el contenido del círculo.
- **Semillas** (`src/lib/avatar.ts`): `user-<User.id>` para cuentas de Staff/Admin,
  `attendee-<Attendee.id>` para asistentes; el nombre solo si no hay id. Así un
  cambio de nombre no cambia el avatar, y la misma persona se ve igual en Inicio,
  Más, Lotes, Asistentes y el Dashboard.
- Para tener el id donde no lo había: `MeResponse.attendee.id` (`/api/me`) y
  `AdminPulseRow.attendeeId` (detalle de lote). Solo se agregó la columna al SELECT.
- Accesibilidad: decorativo por defecto (`alt=""`, `aria-hidden`) porque el nombre
  siempre está al lado; con `alt` se vuelve imagen con texto.
- Fondo `circle` de Blobatar por defecto: garantiza el contraste de la figura
  sobre fondos crema y morados.
- **Sin columnas nuevas, sin imágenes guardadas, sin subir archivos.**

### 35.3 Lugares migrados
Inicio · AppShell (barra lateral del asistente) · Más · Instantáneas (autor; "Tú"
usa la semilla del asistente) · AdminShell (tarjeta del usuario) · Usuarios (lista
y modal) · LoteDetalle (columna Usuario) · AsistenteDetalle · Dashboard (canjes por
Staff y actividad reciente).

Revisados sin avatar previo (no se agregó para no cambiar el diseño): Staff
(encabezado, resultados de búsqueda, modal de canje) y la lista de Asistentes.
**Idea pendiente:** mostrar el avatar en el modal de canje de Staff serviría para
confirmar visualmente a la persona (requiere agregar `attendeeId` a
`StaffPulseResponse`).

### 35.4 Limpieza
- Eliminado `initials()` de `PulseSession.tsx` (sin uso). `AuthContext.tsx` (muerto)
  tiene su propio campo `initials`; no se tocó.
- ⚠️ Superado por §36: `components/BloBatar.tsx` ya NO es descartable; ahora es el
  renderizador del modo Blobatar (estilo definido por el usuario) y `UserAvatar`
  lo usa. La prop `seed` de `UserAvatar` se reemplazó por `userId` / `attendeeId`. `assets/img/avatar.webp` ya no se importa.

---

## 36. Configuración global del avatar: Blobatar ↔ Iniciales (1 oct 2026, noche)

### 36.1 Qué es
| | |
|---|---|
| **Nombre** | `avatarMode` |
| **Valores** | `'blobatar'` · `'initials'` (`AVATAR_MODES` en `shared/api.ts`) |
| **Valor por defecto** | **`'blobatar'`** (`DEFAULT_AVATAR_MODE`): sin ninguna entrada guardada la app se ve igual que antes de crear la opción |
| **Alcance** | Global: toda la app (asistente, Staff y Admin). No es por usuario |
| **Dónde se cambia** | Admin → **Usuarios** → tarjeta "Apariencia de usuarios" (`src/admin/AvatarSetting.tsx`), al final de la lista. No existía pantalla de configuración general y no se creó una |

### 36.2 Dónde se guarda (sin tablas nuevas)
Se revisó: no había tabla, archivo ni variable de configuración global (solo la
tabla `InstantConfig` del módulo de Instantáneas del Next.js, que no aplica).
Para un solo valor se reutilizó el patrón que ya usaba la **contraseña temporal**
(§16): el valor vigente es **la última fila de `AuditLog`** con

```text
entityType = 'Setting'   entityId = 'avatarMode'   action = 'setting.update'
metadata   = { "value": "initials", "previous": "blobatar" }   actorId = el Admin
```

- Lectura/escritura: `server/settings.ts` (`getSettings`, `setAvatarMode`). Un
  valor desconocido o la ausencia de filas ⇒ `blobatar`.
- Cada cambio queda auditado (quién y cuándo). Elegir el valor que ya está no escribe nada.
- `npm run db:limpiar-pruebas` **no** lo borra (solo borra los `entityType` de
  `TEST_AUDIT_TYPES`, `scripts/_db.mjs`). `db:respaldo` tampoco lo respalda.
- Si en el futuro hay varias configuraciones, migrar a una tabla `AppSetting(key, value)`.
- En el navegador se guarda una **copia** en `localStorage` (`arraigados.settings.v1`)
  solo para no "parpadear" al abrir; la fuente de verdad es el servidor.

### 36.3 Endpoints y permisos
| Ruta | Quién | Para qué |
|---|---|---|
| `GET /api/settings` (`settings.mts`) | Público | Lo necesitan también las pantallas del asistente (sin sesión de Staff). No tiene datos sensibles |
| `GET /api/admin/settings` (`admin-settings.mts`) | ADMIN | Igual, para el panel |
| `PATCH /api/admin/settings` `{ "avatarMode": "initials" }` | **Solo ADMIN** | Cambiar. `authorize(req, ['ADMIN'])` en el servidor: sin sesión 401, STAFF 403, valor inválido 400 |

STAFF ve el resultado (sus pantallas muestran el modo vigente) pero no puede
cambiarlo: la tarjeta está en Usuarios (solo Admin) y el servidor rechaza su PATCH.

### 36.4 Arquitectura
```text
GET /api/settings ──► AppSettingsProvider (src/context/AppSettings.tsx, en main.tsx)
                         │  avatarMode   (refresca al volver a la pestaña)
                         ▼
                    <UserAvatar>  (src/components/UserAvatar.tsx — ÚNICO avatar de personas)
                    ┌────┴─────────────┐
            'blobatar'               'initials'
     <BloBatar> (BloBatar.tsx)    initials(name) (PulseSession.tsx, la función original)
     fondo transparente           círculo con color/tipografía de cada pantalla
```
- Ninguna pantalla tiene `if (modo)`: todas pasan `name` + `userId` / `attendeeId`
  (+ `className` o `size`) y `UserAvatar` decide.
- Admin al guardar: `setAvatarMode` → PATCH → actualiza el contexto ⇒ todos los
  avatares de su pantalla cambian al instante. Otras personas: al abrir/recargar la
  app o al volver a la pestaña.
- `UserAvatar` acepta `mode` solo para la vista previa de la tarjeta de configuración.

### 36.5 Modo Blobatar (`src/components/BloBatar.tsx`)
Se respetó la configuración del usuario: `traits={{ shape: 0.825 }}`, `hue={225}`,
`animate="hover"` (requiere `import 'blobatar/motion.css'`, ya incluido), respaldo
`'Jane Doe'`. Cambios: `background={false}` y, en `UserAvatar`, el contenedor
pierde fondo, borde y sombra (clase `.blob`) ⇒ **solo se dibuja la figura**,
sin el círculo blanco/crema de antes. Con `animate`, Blobatar es SVG en línea y no
acepta `alt`; el avatar es decorativo (`aria-hidden`) salvo que se pase `label`.
Semilla: `user-<User.id>` / `attendee-<Attendee.id>` (o el nombre si no hay id).
Nota: con `hue` fijo todos los avatares son de la misma familia de color; cambian
tono, forma de ojos y detalles. Sin fondo, los tonos más oscuros se ven poco sobre
el morado oscuro: si molesta, se ajusta en `BloBatar.tsx` (`tone` o `background`).

### 36.6 Modo Iniciales
Usa la función **original** `initials()` (restaurada en `src/context/PulseSession.tsx`
con la misma lógica de antes: "Javier Castro" → "JC"). El círculo, colores y
tipografía son los de la clase de cada pantalla (los mismos de antes de Blobatar);
donde no había (Dashboard, Instantáneas) se usan los valores de `:where(.initials)`
en `UserAvatar.module.css` (morado + crema).

### 36.7 Componentes que muestran personas (todos vía `UserAvatar`)
Inicio · AppShell (barra lateral del asistente) · Más · Instantáneas · AdminShell
(tarjeta del usuario) · Usuarios (lista y modal) · LoteDetalle · AsistenteDetalle ·
Dashboard (canjes por Staff) · ActivityFeed (actividad reciente) · vista previa de
la configuración. **Staff** (encabezado, búsqueda, modal de canje) y la lista de
Asistentes no muestran avatar (nunca lo tuvieron).

### 36.8 Verificación (réplica local + navegador)
ADMIN cambia Blobatar → Iniciales (mensaje "Guardado…"), todos los avatares de
Usuarios cambian al instante; recargar conserva Iniciales; Dashboard, detalle de
lote, detalle de asistente e Inicio del asistente (otra sesión, sin caché) muestran
iniciales; regresar a Blobatar y recargar lo conserva. STAFF: `/admin/usuarios`
lo manda a `/staff` y `PATCH /api/admin/settings` → 403; sin sesión → 401; valor
inválido → 400. `npm run build` OK.

---

## 37. Regla global de tablas: paginación obligatoria (1 oct 2026, noche)

**Regla:** toda tabla o lista de registros cuya cantidad pueda crecer se pagina.
Nunca se dibujan todos los resultados recibidos. **No hay botón "Ver todos"**
(ver 37.6).

### 37.1 Piezas
| Pieza | Archivo | Para qué |
|---|---|---|
| `<Pagination>` | `src/components/Pagination.tsx` (+ `.module.css`) | ÚNICA paginación de la app: "Mostrando 11–20 de 127", `← Anterior · 1 … 4 5 6 … 13 · Siguiente →`, selector "Por página". `page` es 1-based; con 0 resultados no se dibuja |
| `usePagedList` | `src/lib/usePagedList.ts` | Paginación en el navegador para listas chicas que ya llegaron completas; vuelve a la página 1 cuando cambia `resetKey` (filtro/pestaña) y ajusta la página si la lista se achica |
| `PAGE_SIZES`, `DEFAULT_PAGE_SIZE`, `parsePageSize` | `shared/api.ts` | Tamaños permitidos (front y servidor) |

- **Tamaño por defecto: 10. Permitidos: 10 · 25 · 50.** Cualquier otro valor
  (URL o API) se convierte en 10. 10 es el mínimo.
- Cambiar el tamaño regresa a la página 1.
- Se eliminaron las dos paginaciones viejas ("1 / 7" con `.pager`/`.pageBtn`
  en Asistentes y en LoteDetalle) y la constante `ATTENDEE_PAGE_SIZE` (50).

### 37.2 Tablas migradas

| Pantalla | Dónde se pagina | Búsqueda / filtros | Estado en la URL |
|---|---|---|---|
| **Pulseras de un lote** (`/admin/lotes/:id`) | **Servidor** (`GET /api/admin/batches/:id?page=&pageSize=&q=&status=`) | Búsqueda nueva sobre todo el lote: token, código (`AR26-…`/`QRONLY:…`), nombre del asistente (sin acentos) o número en el lote ("127"); chips de estado | `?q=&estado=&pagina=&porPagina=` |
| **Asistentes** (`/admin/asistentes`) | **Servidor** (`GET /api/admin/attendees?…&page=&pageSize=`) | Los de siempre (nombre, zona, presbiterio, iglesia, kit, aguas) | `?…&pagina=&porPagina=` |
| **Usuarios** (`/admin/usuarios`) | Navegador (`usePagedList`) | Chips Todos/Admin/Staff/… (cambiar chip ⇒ página 1) | — |
| **Lotes** (`/admin/lotes`) | Navegador | — | — |
| Dashboard · **Actividad reciente** | Navegador (10 de hasta 60 eventos) | Pestañas Todo/Registros/Canjes (cambiar pestaña ⇒ página 1) | — |
| Dashboard · **Estado de lotes** | Navegador | Filtro de kit del Dashboard | — |

**Por qué servidor vs navegador:** pulseras (hasta 500 por lote) y asistentes
(cientos) se paginan en el servidor para no traer cientos de filas. Usuarios,
lotes y los feeds del Dashboard son listas chicas que ya llegan completas en
una sola respuesta; ahí se pagina en el navegador.

**No paginadas, a propósito (acotadas por naturaleza):** tabla de kits (≤ 3) y
"Sábado vs Domingo" (2 días) del Dashboard; las gráficas de barras (zonas,
presbiterios ≤ ~27, top 10 iglesias, canjes por Staff) — son gráficas, no
tablas; en el detalle de un asistente, sus pulseras (1–3) y sus canjes (≤ aguas
del kit, hoy 3); resultados de búsqueda de Staff (`LIMIT 25` en el servidor,
herramienta de celular).

### 37.3 Secuencia y filtros
`Datos → Filtros → Ordenamiento → Paginación → Render`.
- Servidor: `WHERE` (filtros/búsqueda) → `count(*)` del resultado filtrado →
  `ORDER BY` (asistentes: registro más reciente; pulseras: número en el lote)
  → `LIMIT/OFFSET`. La búsqueda es sobre TODO el conjunto, nunca solo la página.
- **Cualquier cambio de filtro, búsqueda, chip, pestaña o tamaño ⇒ página 1**
  (se borra `pagina` de la URL).
- **Página fuera de rango** (p. ej. `?pagina=8` con un filtro de 2 páginas): el
  servidor la ajusta a la última página existente y la pantalla corrige la URL.
  Nunca se queda una página vacía.
- Pulseras: la columna `#` es el número de la pulsera en el lote (`position`,
  por orden de creación), estable aunque se filtre o se busque.

### 37.4 Cambios de API
- `AdminAttendeeFilters.pageSize`; la respuesta trae `pageSize` y `page` ya ajustada.
- `AdminBatchDetail` ahora trae **una página**: `pulses` (≤ pageSize),
  `filteredTotal`, `page`, `pageSize`, `qrBase` (origen de los QR, para el aviso
  de localhost). `AdminPulseRow.position`. El PDF y el QR suelto no cambiaron
  (el PDF sigue llevando todas las pulseras).

### 37.5 Validación (réplica local)
Lotes de prueba con 0, 1, 9, 10, 11, 50 y 500 pulseras: 0 → "Este lote no tiene
pulseras" sin paginación; 1/9/10 → "Mostrando 1–N de N" sin botones de página;
11 → 2 páginas; 50 → 5; 500 → 50 páginas (página 50 = 491–500); `page=99` → se
ajusta a la última. Tamaño 25/50 correcto; tamaño 37 → 10. Búsqueda
"T500x127" → "Mostrando 1–1 de 1". Filtro de estado y cambio de tamaño
regresan a la página 1. Asistentes: `?pagina=8` + filtro de presbiterio →
página 1 de 60; filtro con 52 y `page=7` → servidor devuelve la última (6).

### 37.6 Decisión: sin "Ver todos"
No existe botón "Ver todos" en ninguna tabla: un lote puede tener 500 pulseras
y dibujarlas todas es justo lo que esta regla evita. Para encontrar algo se usan
búsqueda + filtros + paginación + tamaño (hasta 50). **Sin excepciones.** El
único caso de "todas las pulseras" es imprimirlas, y eso ya lo resuelve el PDF
del lote (se genera en el servidor, no se dibuja en pantalla).

---

## 38. Esqueletos de carga (Skeleton UI) (1 oct 2026, noche)

### 38.1 Regla de estados
| Estado | Qué se ve |
|---|---|
| **loading** | Esqueleto con la misma forma de lo que viene (nunca "0", "Sin resultados", tablas o gráficas vacías) |
| **error** | El aviso de error de siempre (con "Reintentar") |
| **empty** | "No hay…/Ninguna…" **solo** cuando la petición terminó y trajo 0 |
| **success** | Los datos |

No se usa `!data` para decidir "vacío": cada pantalla con tabla lleva un
`loading` propio (y un contador de petición para ignorar respuestas viejas).

### 38.2 Componentes (`src/components/Skeleton.tsx` + `.module.css`)
| Componente | Uso |
|---|---|
| `Skeleton` | Bloque suelto (ancho, alto, radio) |
| `SkeletonRows` | Filas `<tr>` dentro del `<tbody>` de la tabla real: el encabezado se queda, mismo alto de fila (46 px) y mismas clases de columna (`classNames`) ⇒ sin saltos, también en celular |
| `ListSkeleton` | Filas con círculo + 2 líneas (listas, actividad, barras) |
| `CardSkeleton` | Tarjeta KPI: etiqueta, número grande, detalle (recibe la clase de la tarjeta real) |
| `ChartSkeleton` | Columnas de alturas fijas con el alto de la gráfica |
| `SkeletonRegion` | Contenedor accesible: `aria-busy` + "Cargando…" para lectores de pantalla |

Animación: brillo horizontal sutil de 1.3 s sobre el morado al 7–13 %; con
`prefers-reduced-motion` queda fija (además de la regla global de `tokens.css`).
Sin dependencias nuevas.

### 38.3 Dónde se usa
- **Dashboard:** `DashboardSkeleton` repite la estructura (niveles, 6 KPIs,
  gráficas, listas, actividad). Se muestra en la carga inicial y **al cambiar
  filtros** (`useDashboard` borra los datos del filtro anterior para no mostrar
  números viejos como nuevos). El refresco automático de 60 s NO muestra
  esqueleto: actualiza en su lugar. No se cambió nada del diseño del tablero.
- **Asistentes:** título y filas esqueleto en cada carga (filtros, página, tamaño).
- **Detalle de lote:** carga inicial = tarjetas esqueleto; cambio de página,
  búsqueda o filtro = filas esqueleto (los datos del lote arriba se quedan).
- **Detalle de asistente, Usuarios, Lotes:** esqueleto con la forma de sus tarjetas/filas.
- Pendiente (fuera de esta etapa): pantallas del asistente (usan `SessionGate`)
  y la búsqueda de Staff ("Buscando…").

### 38.4 Validación
Con la API retrasada 2.5 s: Dashboard, Asistentes, detalle de lote, Usuarios,
Lotes y detalle de asistente muestran esqueleto (`aria-busy`), ningún "0" ni
texto de vacío; al cambiar el periodo del Dashboard vuelve el esqueleto (0 KPIs
viejos visibles). `npm run build` OK. El proyecto no tiene tests ni lint.

---

## 39. Programa corregido, Canjes de Admin, Historial de Staff y Exportación del Dashboard (1 oct 2026)

Implementado en una sola sesión a partir de un encargo detallado del usuario.
**No se tocó Git ni se hizo deploy** (prohibición explícita del encargo): todo
quedó solo en el código local, pendiente de revisión manual.

### 39.1 Programa, sedes y Google Maps
- Fechas oficiales corregidas: **sábado 17** y **domingo 18** de octubre de
  2026 (antes `schedule` en `src/data/app.ts` decía "vie17"/"sab18", lo que
  implicaba 17 = viernes). `EVENT_DAYS` en `shared/api.ts` (usado por el
  Dashboard) ya estaba correcto; solo `src/data/app.ts` (pantalla pública
  Programa) estaba mal. El domingo queda sin actividades (no se inventó nada).
- Nombres oficiales de sede: **"12va IAFCJ"** y **"21ra IAFCJ"** (antes "Sede
  12va/21ra iglesia"), en `VENUE_12VA`/`VENUE_21RA` (`src/data/app.ts`),
  usados por `nowEvent`, `upcomingEvents`, `schedule` y `eventInfo.venues`.
  `foodDays` y `stories[].meta` (texto informal "Sede 12va/21ra" de las
  fotos) se dejaron igual a propósito: no forman parte de "Programa/sedes".
- Botón "Obtener ubicación" (Google Maps) nuevo: `src/components/
  LocationButton.tsx`, con los enlaces exactos dados por el usuario
  (`VENUE_MAPS` en `src/data/app.ts`). Usa el componente `Button` existente
  (ver abajo), `target="_blank" rel="noopener noreferrer"`, y no se dibuja si
  la sede no tiene enlace (p. ej. "Ambas sedes"). Integrado en `EventCard.tsx`
  (pantalla Inicio) y `Programa.tsx`.
- `Button.tsx` se volvió polimórfico: si recibe `href` dibuja un `<a>` (mismas
  clases/estilo), si no, el `<button>` de siempre. Retrocompatible: ningún
  otro lugar que use `<Button>` cambió de comportamiento.
- `Programa.tsx`: el día inicial ahora es `schedule.find(d => d.events.length
  > 0)` en vez de un índice fijo (`schedule[1]`), para no depender del orden
  del arreglo tras el cambio de fechas.

### 39.2 Admin → Canjes (`/admin/canjes`)
Pantalla nueva, agregada a `ADMIN_SECTIONS` (`src/admin/nav.ts`) y a las
rutas de `src/App.tsx` (antes del catch-all `/admin/*`, como pide el
comentario del propio archivo).

**Decisión de modelo (sin migraciones):** no se agregó ninguna columna ni
tabla. "Redemption" (la tabla de canjes) se queda exactamente igual, se sigue
sin borrar ni modificar nunca un registro, y un canje "anulado" se representa
con una fila en **"AuditLog"** (la misma tabla que ya usaban
`pulse.reassign` y `attendee.update`): `action = 'redemption.void'`,
`entityType = 'Redemption'`, `entityId = Redemption.id`, `metadata = {reason,
attendeeId, originalPulseId, restoredPulseId, quantity, restored}`. El
`RedemptionStatus` (`'VALIDO' | 'ANULADO'`) es siempre un valor **calculado**
(LEFT JOIN LATERAL contra "AuditLog"), nunca una columna. Se eligió este
camino para no tocar el `schema.prisma` que comparte el proyecto Next.js
hermano sobre la misma base de Neon (riesgo ya señalado en la sección "Dos
schema.prisma desalineados" de este documento).

- **Backend** (`server/redemptions.ts`, nuevo):
  - `listRedemptions(filters)`: filtros (nombre, pulsera, estado, Staff,
    rango de fechas) sobre todo el dataset, paginación con el mismo sistema
    que Asistentes/Lotes (`parsePageSize`, `PAGE_SIZES`, corrección de página
    fuera de rango).
  - `redemptionsCatalog()`: lista de Staff con al menos un canje, para el filtro.
  - `voidRedemption(id, actorId, reason)`: transaccional
    (`withTransaction`), bloquea la fila de "Redemption" con `SELECT ... FOR
    UPDATE`, revisa si ya existe un "AuditLog" de anulación (idempotente:
    responde `already_voided` sin repetir nada), restaura el beneficio
    descontando `quantity` del `drinksUsed` de la pulsera **activa** del
    asistente (de preferencia la misma del canje original si sigue activa;
    si no, la que esté activa ahora — p. ej. tras un reemplazo de pulsera —
    con `GREATEST(drinksUsed - quantity, 0)` para nunca bajar de cero), y
    finalmente inserta el "AuditLog". Motivo obligatorio, sin espacios en
    blanco solamente, máx. 500 caracteres (validado en servidor, no solo en
    el formulario).
  - **Endpoints** (`netlify/functions/`): `admin-redemptions.mts` (GET lista
    + catálogo), `admin-redemption-void.mts` (POST anular). Ambos
    `authorize(req, ['ADMIN'])`: un Staff que llame el endpoint directo
    recibe 403, y el actor de la anulación sale SIEMPRE de la sesión
    verificada (`auth.user.id`), nunca de un campo del body.
- **Frontend** (`src/admin/Canjes.tsx` + `.module.css`, nuevos, sobre la
  plantilla de `Asistentes.tsx`): filtros sincronizados con la URL, Loading
  con `SkeletonRows`/`CardSkeleton` reutilizados, Empty solo tras terminar de
  cargar, Error con reintento, paginación con `<Pagination>`. Modal de
  anulación (`VoidModal`, dentro del mismo archivo): motivo obligatorio con
  contador de caracteres, deshabilita "Confirmar" si está vacío o son solo
  espacios, maneja `ok` / `already_voided` / `not_found` del servidor.
- **Concurrencia:** dos anulaciones simultáneas del mismo canje -> la
  segunda, tras esperar el `FOR UPDATE`, encuentra el "AuditLog" ya insertado
  y responde `already_voided`; nunca se devuelve el beneficio dos veces ni se
  duplica el "AuditLog".
- **Riesgo documentado:** si el asistente no tiene NINGUNA pulsera activa al
  momento de anular (p. ej. la suya quedó deshabilitada y nunca se le dio una
  nueva), la anulación se registra igual pero `restored: false` -- no hay
  dónde devolver el beneficio. Caso raro; probar manualmente antes de publicar.

### 39.3 Staff → "Mis canjes recientes" (`/staff`)
- `server/staff.ts#staffHistory(staffId, limit = 20)`: mismos cálculos de
  `status` que Admin → Canjes (así que anular un canje en Admin se refleja
  aquí). Lee SOLO los canjes de `createdById = staffId`.
- `netlify/functions/staff-history.mts` (GET `/api/staff/history`): el id de
  Staff sale de `authorize(req)` (cualquier STAFF o ADMIN autenticado ve solo
  LO SUYO), nunca de la query string -- no existe forma de pedir el
  historial de otro Staff cambiando un parámetro.
- `Staff.tsx`: sección compacta "Mis canjes recientes" (lista, no una
  segunda pantalla de Admin), se carga al entrar y se refresca sola
  (`onRedeemed`, sin recargar la página) tras un canje exitoso o repetido;
  no se agrega nada si el canje falla. Si un Admin anula ese canje después,
  la próxima carga del historial ya lo muestra "Anulado por Admin".
  `RedeemModal.tsx` ganó la prop opcional `onRedeemed`.

### 39.4 Exportación del Dashboard (PDF y Excel)
- `server/dashboardExport.ts` (nuevo): `buildDashboardPdf(filters)` y
  `buildDashboardXlsx(filters)`, ambos llaman **tal cual** a
  `getDashboard(filters)` (`server/dashboard.ts`) -- el PDF/Excel exportado
  muestra exactamente lo mismo que la pantalla, con los MISMOS filtros
  activos (periodo, zona, presbiterio, iglesia, kit). Nunca exportan datos
  globales si el Admin tenía un filtro puesto.
  - **PDF:** `pdf-lib` (ya era dependencia, reutilizado el mismo patrón de
    `server/wristbandPdf.ts`: `PDFDocument.create`, `embedFont`, `addPage`,
    `drawText`). Encabezado (Arraigados 2K26 / Reporte del Dashboard / fecha
    y hora de generación / periodo / filtros aplicados con nombres
    resueltos, no ids), KPIs, kits, sábado-vs-domingo, zonas, presbiterios,
    iglesias top, edades, canjes por Staff, lotes, alertas y actividad
    reciente. Multi-página automático. **Alcance deliberado:** las gráficas
    de barras/dona del Dashboard NO se rasterizan como imagen (`pdf-lib` no
    dibuja gráficas, y agregar una librería de canvas solo para esto no pasa
    la regla de "no agregar dependencias innecesarias"); en su lugar cada
    gráfica se exporta como SU MISMA tabla de datos, que es la información
    real detrás de ella.
  - **Excel:** dependencia nueva `xlsx` (ver 39.5) -- no había ninguna
    librería de Excel en el proyecto. Hojas: `Summary` (KPIs + periodo +
    filtros), `Kits`, `ByDay`, `EventDays`, `ByZone`, `ByPresbytery`,
    `TopChurches`, `Ages`, `RedemptionsByStaff`, `Batches`, `Activity`,
    `Alerts` (si hay alertas). Datos reales, sin gráficas nativas de Excel
    (se priorizó integridad de datos sobre pulido visual, como pedía el encargo).
  - **Endpoint:** `netlify/functions/admin-dashboard-export.mts` (GET
    `/api/admin/dashboard/export?format=pdf|xlsx&...filtros`), ADMIN-only,
    mismo `parseFilters` que `admin-dashboard.mts` (nunca se duplicó la
    lógica de filtros). Devuelve binario con `content-disposition:
    attachment` (nunca JSON salvo error).
- **Frontend** (`src/admin/dashboard/Dashboard.tsx`): el botón "Exportar"
  (antes deshabilitado, `disabled title="próxima iteración"`) ahora son DOS
  botones, "Exportar PDF" y "Exportar Excel". Mientras se genera muestran
  "Generando PDF…"/"Generando Excel…" y ambos quedan deshabilitados (evita
  pedidos duplicados con doble clic). Reutiliza `downloadFile()`
  (`src/lib/api.ts`, ya existía para los PDF/PNG de Lotes): revisa el
  content-type real de la respuesta antes de "descargar", así que un error
  del servidor nunca se guarda como si fuera el archivo. Un error de
  generación se muestra junto a los botones y el botón se restaura (nunca
  queda bloqueado). `src/lib/api.ts` ganó `dashboardExportUrl()` y
  `XLSX_MIME`. No se rediseñó nada más del Dashboard.

### 39.5 Dependencias
- **Nueva:** `xlsx` (^0.18.5) -- único cambio de dependencias de esta sesión.
  Se revisó primero `package.json`: no existía ninguna librería de Excel
  (`exceljs` tampoco). Compatible con Vite/Node 22/Netlify Functions (uso
  puro en Node, sin partes nativas). **Falta correr `npm install` en el
  proyecto real** para que `node_modules` tenga el paquete (no se pudo
  ejecutar un `npm install` en la máquina del usuario desde esta sesión).
- Todo lo demás reutiliza dependencias que ya existían: `pdf-lib` (PDF del
  Dashboard, igual que los PDF de pulseras), `pg`/`lucide-react`/etc. sin cambios.

### 39.6 Validación de esta sesión
Por una limitación de esta sesión (ver nota abajo), la validación de
compilación se hizo copiando el código final completo a un entorno de
verificación aparte (mismo `package.json`, `tsconfig.json`, dependencias
instaladas con `npm install` igual que en el proyecto real) y corriendo ahí
`npm run build` (`tsc -b && vite build`):
- **`tsc -b`:** sin errores.
- **`vite build`:** sin errores, build completo generado (1711 módulos).
- El proyecto sigue sin tests ni lint configurados (igual que antes de esta sesión).

Antes de llegar a este resultado se encontraron y corrigieron 4 errores de
compilación reales (variables sin usar y un parámetro de función sobrante en
`server/dashboardExport.ts` y `server/redemptions.ts`), ya corregidos en el
código entregado.

**Importante para quien retome este trabajo:** esta sesión no tuvo una
terminal directa sobre la máquina del usuario; el código se escribió y
verificó en un entorno aparte y después se copió archivo por archivo a sus
rutas reales. Aun con el `npm run build` limpio arriba, se recomienda
correr `npm install` (por la dependencia nueva `xlsx`) y `npm run build` una
vez más **en el proyecto real** antes de dar por buena esta etapa, por si
algún archivo quedó con una versión distinta a la revisada aquí.

### 39.7 Pendiente / riesgos a probar manualmente
- Probar en Neon real: anular un canje, confirmar que el beneficio sube de
  nuevo en la pulsera del asistente, y que el historial de Staff y la tabla
  de Admin → Canjes reflejan "Anulado".
- Probar anulación con el asistente sin pulsera activa (ver 39.2, riesgo documentado).
- Probar los dos botones de exportación del Dashboard con y sin filtros
  activos, y revisar que el PDF se vea bien impreso (tablas no cortadas).
- Confirmar visualmente en los dos celulares de prueba (u otro tamaño) que
  Canjes, el modal de anulación, el historial de Staff y los dos botones de
  exportación se ven bien en pantallas chicas.
- Instantáneas, Reactions, Comments, Etapa 5 de Paquetes y Auditoría completa
  siguen PENDIENTES (fuera de alcance de este encargo, a propósito).
- **No se hizo Git ni deploy** (instrucción explícita): nada de esto se
  subió a ningún repositorio ni se publicó en Netlify/Vercel.

---

## 40. Ruta del Dashboard renombrada: `/admin/resumen` → `/admin/dashboard` (2 oct 2026)

A pedido del usuario. Cambios:
- `src/admin/nav.ts`: `ADMIN_SECTIONS` ahora apunta a `/admin/dashboard`
  (resto de la sección igual: sigue siendo la primera `ready`, así que
  `ADMIN_HOME` sigue siendo el Dashboard).
- `src/App.tsx`: la ruta real quedó en `/admin/dashboard`; se dejó
  `/admin/resumen` como redirección (`<Navigate to="/admin/dashboard"
  replace />`) por si quedó algún enlace o marcador guardado con la ruta vieja.
- Todas las menciones de `/admin/resumen` en este documento se actualizaron a
  `/admin/dashboard`.
- Sin cambios de backend, de datos ni de diseño -- es solo la URL.

---

*Fin del handoff. Si algo de este documento contradice el código, el código gana:
léelo, corrige este documento y sigue.*


---

## 41. `/home` es ahora la pantalla de inicio (5 oct 2026)

Hasta el 4 oct, `/home` era una experiencia **experimental** que vivía junto a
`/inicio` (§6 sigue describiendo `/inicio` como la home: está **desactualizado**).
Desde el 5 oct 2026 **`/home` es la pantalla de inicio real del asistente**.

Qué cambió (solo navegación; no se tocó diseño ni funcionalidad):

| Archivo | Cambio |
|---|---|
| `src/App.tsx` | `/inicio` ahora es `<Navigate to="/home" replace />` (no rompe enlaces/marcadores viejos). Se quitó el import de `Inicio`. |
| `src/components/AppShell.tsx` | La pestaña "Inicio" del menú y el logo apuntan a `/home`. |
| `src/pages/Registro.tsx` | Tras reclamar pulsera / "Ir a mi inicio" navega a `/home`. |
| `src/pages/Beneficios.tsx`, `src/pages/menu-preview/MenuPreview.tsx` | El botón "atrás" va a `/home`. |

Notas:
- `src/pages/Inicio.tsx` **no se borró**: quedó sin ruta y sin importaciones (código
  muerto, conservado a propósito por si se quiere consultar). Se puede eliminar
  cuando se decida.
- `Ambient` (fondo) en `AppShell` usa la variante `home` solo si la ruta es
  `/inicio`; como ahora redirige, `/home` sigue con el fondo `event` que ya tenía
  (sin cambio visual). Si se quiere el fondo `home` para `/home`, cambiar esa
  comparación.
- `/menu-preview` sigue existiendo (propuesta visual con datos mock, sin enlace en
  el menú). La vitrina real de `/home` usa `/api/menu`.

### Qué muestra `/home` (`src/pages/home/Home.tsx`)
Campana de notificaciones · **Ahora** (en vivo, calculado con
`src/data/program.ts` y la hora real; `TZ_OFFSET = -07:00`, fechas 17 y 18 oct 2026)
· **Mi kit** (paquete e incluidos) · carrusel **Menú** (`MenuCarousel`) ·
carrusel **Mercancía** (`MerchCarousel`). "Próximos eventos" está oculto con
`SHOW_UPCOMING_EVENTS = false` (se reactiva cambiando ese valor).

---

## 42. Menú de alimentos administrable (3 oct 2026)

- **Migración** `migrations/003_menu.sql`: tablas `Venue` (catálogo **fijo** de dos
  sedes: *12va IAFCJ* y *21ra IAFCJ*; sin CRUD) y `Dish` (platillos).
- **Admin**: `/admin/menu` (`src/admin/Menu.tsx`). CRUD de platillos, selector de
  sede, disponible/no disponible, foto (JPG/PNG/WebP ≤ 4 MB).
- **Fotos**: Netlify Blobs, store `dish-photos`; en la base solo `Dish.imageKey`.
- **Búsqueda automática de foto** (`server/openverseSearch.ts`): consulta la API
  pública de Openverse (sin API key, sin filtro de licencia por decisión del
  cliente: uso interno). Guarda licencia/autor/enlace solo para mostrarlos al admin.
- **Endpoints** (`netlify/functions/`): `GET /api/menu` (público; solo platillos
  disponibles), `GET|POST /api/admin/dishes`, `PATCH|DELETE /api/admin/dishes/:id`,
  `POST /api/admin/dish-image-search`, `GET /api/dish-image/:key`.
- **Lógica**: `server/dishes.ts`. Un platillo agotado se marca *no disponible*; el
  DELETE real existe solo para corregir errores.
- **Público**: carrusel en `/home` (`MenuCarousel.tsx`). Es **informativo**: no hay
  pedidos, paquetes ni consumos asociados.

---

## 43. Mercancía oficial administrable (3–5 oct 2026)

- **Migración** `migrations/004_merch.sql`: `MerchItem` y `MerchImage` (1 a N,
  `ON DELETE CASCADE`). Catálogo **editorial**: la mercancía **no se vende en la
  app** (sin inventario, carrito ni pedidos).
- **Campos**: `name`, `description`, `price` (opcional; `NULL` = "Por definir"),
  `availability` (`tbd` = por confirmar, `onsite` = disponible presencialmente),
  `sortOrder`.
- **Precio**: se guarda en **centavos** (igual que `Package.price`) y se muestra con
  `formatPrice(cents)`. El formulario admin trabaja en **pesos enteros** (escribir
  `100` = **$100 MXN**; sin decimales) y envía `pesos × 100`. *(Bug corregido el
  5 oct: antes se enviaba sin multiplicar y quedaba guardado 100 veces menor.)*
- **Fotos**: hasta **6** por artículo, JPG/PNG/WebP ≤ 4 MB, en Netlify Blobs
  (store `merch-photos`). Patrón anti-huérfanos: subir → actualizar fila → borrar
  lo viejo.
- **Admin**: `/admin/merch` (`src/admin/Merch.tsx`): crear, editar, borrar,
  reordenar, varias fotos.
- **Endpoints**: `GET /api/merch` (público), `GET|POST /api/admin/merch`,
  `PATCH|DELETE /api/admin/merch/:id`, `POST /api/admin/merch/:id/reorder`,
  `GET /api/merch-image/:key`. Lógica en `server/merch.ts`.
- **Público**:
  - Carrusel en `/home` (`MerchCarousel.tsx`). Su leyenda *"Lleva contigo un
    recuerdo de Arraigados 2K26."* usa la fuente Antarctican
    (`var(--font-flyer-display)`, peso 400).
  - **"Ver todo" → `/home/mercancia`** (`MerchGallery.tsx`): página completa en
    mosaico estilo *lookbook* (tiles de tamaño alterno: cada 5.º grande, 1 de 3
    alto; foto a sangre con degradado inferior). Reemplazó la hoja/modal anterior.
    El **detalle sigue siendo un modal** (`MerchDetailModal`, exportado desde
    `MerchCarousel.tsx`).
- `src/data/merch.ts` (catálogo demo estático original) quedó **sin referencias**
  al conectar los datos reales; ver §45.

---

## 44. Notas — carrusel, likes y panel Admin (5 oct 2026)

**Concepto.** Cada asistente puede publicar una nota corta (≤ 60 caracteres) que dura 24 h y se
muestra en una burbuja sobre su avatar, al estilo de las Notes de Instagram. Las notas vigentes de
los demás asistentes aparecen en un **carrusel horizontal en `/home`**; se les puede dar **like**
(doble toque) y se revisan/filtran en **Admin → Notas**. No hay comentarios, fotos ni "historial"
visible para el asistente (el historial se ve solo en Admin).

> **Cambio de producto del 5 oct:** al inicio las notas eran privadas (solo las veía su dueño).
> Ahora las notas **nuevas son `PUBLIC`** y las ven los demás asistentes. Las `PRIVATE` anteriores
> nunca salen en el carrusel. El panel de escribir avisa: "La verán los demás asistentes…".

### 44.1 Modelo de datos (migración `002_notes.sql`; no se agregó ninguna migración nueva)
- `Note(id, attendeeId → Attendee ON DELETE CASCADE, text VARCHAR(60), visibility PRIVATE|PUBLIC,
  createdAt, expiresAt)`. **La fila nunca se borra**: "quitar" y "reemplazar" = *vencer*
  (`expiresAt = ahora`). Activa ⇔ `expiresAt > NOW_UTC`.
- `NoteLike(noteId, attendeeId)` con índice único (un like por persona y nota).
- **Regla**: una sola nota activa por persona. `POST` vence la anterior en la misma sentencia (CTE).
- **Identidad**: siempre por `x-pulse-token` (pulsera ACTIVA). El servidor nunca acepta un
  `attendeeId` del cliente en los endpoints del asistente.

### 44.2 Endpoints
| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET /api/notes` | asistente | Sus notas (activas y vencidas) — de aquí se deriva "mi nota activa" y su `likeCount` |
| `POST /api/notes` | asistente | Publica `{text}` (PUBLIC, 24 h). Reemplaza la activa. **400** vacío/largo · **422** `code:'blocked_language'` si hay groserías |
| `DELETE /api/notes` | asistente | "Quitar nota": vence la(s) activa(s). Responde `{removed}`; idempotente |
| `GET /api/notes/feed` | asistente | Carrusel: notas PUBLIC vigentes de **otros** (máx. 40, recientes primero). Solo `attendeeId` (semilla del avatar), **primer nombre**, `likeCount`, `likedByMe`. Vuelve a filtrar lenguaje |
| `POST /api/notes/:id/like` | asistente | Alterna el like. Solo notas PUBLIC, vigentes y **de otra persona**: propia → **403**; vencida/privada/inexistente → **404** |
| `GET /api/admin/notes` | ADMIN | Lista con filtros, orden, paginación y KPIs (ver 44.5) |
| `POST /api/admin/notes/:id/retire` | ADMIN | Retira una nota activa `{reason}` (obligatorio, ≤ 200). Queda Vencida; AuditLog `note.retire`. **400** sin motivo · **404** inexistente · `{outcome:'already_expired'}` si ya no estaba activa |
| `GET/POST /api/admin/blocked-words` · `DELETE /api/admin/blocked-words/:id` | ADMIN | Lista que administra el Admin (5 oct, ver `docs/MODERACION.md`) |

Archivos: `netlify/functions/{notes,notes-feed,notes-like,admin-notes,admin-note-retire,admin-blocked-words,admin-blocked-word}.mts` · lógica en
`server/notes.ts` y `server/blockedWords.ts` · tipos en `shared/api.ts` · cliente en `src/lib/api.ts`.

### 44.3 Filtro de lenguaje (`shared/moderation.ts`)
- `hasBlockedLanguage(texto)` lo usan el **cliente** (bloquea "Publicar" y avisa en vivo, sin repetir
  la palabra) y el **servidor** (barrera real, 422) y el **feed** (por si hay notas anteriores).
- Normaliza acentos, leetspeak (`p3nd3j0`), letras repetidas (`puuuta`), letras separadas (`p u t a`)
  y puntuación pegada (`culero!!`). Coincide por **palabra completa** o raíces largas, nunca por
  subcadena corta (`computadora`, `reputación`, `Honra a tu madre` pasan). Se amplía en `WORDS`/`STEMS`.
- Error encontrado en pruebas y corregido: `culero!!` pasaba porque `!` se leía como "i".
- **Actualización 5 oct (tarde):** lista fija ampliada y **lista administrable** por el Admin
  (`BlockedWord`, migración `005_blocked_words.sql`; solo servidor + feed). Detalle, lista completa y
  criterios en **`docs/MODERACION.md`**.

### 44.4 Frontend (`src/components/notes/` + `src/pages/home/`)
- **`/home`**: encabezado "Hola, Nombre" + campana; debajo, el carrusel (`NoteTray`).
- `NoteTray.tsx`: fila deslizable (scroll-snap) de avatares con su nota en burbuja. El primero eres
  tú ("Tu nota": tu nota o "¿Qué tienes en mente?"; abre `NoteSheet`; muestra "♥ N" si tienes likes).
  Aparición escalonada, esqueleto de carga, flechas **solo en escritorio** (la izquierda se oculta al
  inicio y la derecha al final), desvanecido solo del lado con más contenido. Mensaje "Aún no hay
  notas de otros. ¡Sé el primero!" **solo si tú no tienes nota activa** (corregido el 5 oct 16:14).
- `NoteBubble.tsx`: burbuja chica; reparte el texto en **dos líneas parejas y centradas**
  (`splitLines`); una palabra o texto muy corto = una línea; lo que no quepa termina en «…».
  Antarctican Bold (`--font-flyer-display`), sin comillas. Ancho de cada elemento: 176 px.
- **Likes**: **doble toque** sobre la nota/avatar de otra persona = like directo (corazón que sale y
  corazoncito rojo en su avatar; nunca quita). **Un toque** abre `NoteViewer` (nota completa, nombre,
  botón de corazón que alterna, doble toque sobre el texto). El toque simple espera 260 ms por si
  llega el segundo. Optimista (`useNotesFeed.like`): cambia al instante, se concilia con el servidor
  y vuelve atrás si falla; un envío a la vez por nota.
- `NoteSheet.tsx`: panel de tu nota (hoja inferior en celular, tarjeta ≥ 640 px): vacía · nota actual
  (Cambiar / Quitar) · editor · error. **Contador** `n / 60`: ámbar con "QUEDAN N" en los últimos 10 y
  rojo "LÍMITE" en 60. **Ya no hay "Mis notas"/historial para el asistente.**
- Hooks: `useMyNotes` (tu nota activa; refresco silencioso cada minuto para tus likes),
  `useNotesFeed` (carrusel; refresca cada minuto y al volver a la pestaña; oculta notas vencidas).
- Respeta `prefers-reduced-motion`. Un fallo de Notas nunca rompe `/home`.
- **Lección aprendida**: `/home` se redibuja cada segundo (cuenta regresiva). Un efecto con `onClose`
  en sus dependencias le robaba el foco al campo de texto → `onClose` va en un ref y los efectos
  corren una sola vez (`NoteSheet`, `NoteViewer`).

### 44.5 Admin → Notas (`/admin/notas`, solo ADMIN)
- KPIs: notas, activas ahora, vencidas, asistentes con notas, likes.
- Filtros (en la URL): `q` (texto de la nota o nombre, sin acentos) · `estado` (`ACTIVA`/`VENCIDA`) ·
  `zona`/`presbiterio`/`iglesia` · `likes` (con/sin) · `desde`/`hasta` · `orden` (recientes/likes) ·
  `pagina`/`porPagina`. Tabla: publicada, asistente (enlace a su ficha), nota, estado, likes.
- Estado: "Activa – vence en X" / "Vencida – hace X" / "quitada o reemplazada" (venció antes de 24 h).
- **Moderación (5 oct, tarde):** botón **Retirar** en cada nota activa (motivo obligatorio; la nota queda
  *Vencida – retirada por Admin*, nunca se borra; AuditLog `note.retire`) y panel plegable **Palabras
  bloqueadas** (agregar/quitar; AuditLog `blocked_word.add|remove`).

### 44.6 Datos demo (`npm run db:notas-demo`)
- Crea asistentes demo (`id` con prefijo `demo-notas-`, nombre "… (demo)") con notas PUBLIC
  activas/vencidas y likes; `-- --n=300` cambia la cantidad (máx. 500); `-- --limpiar` borra solo eso
  (cascada). Si ya existen, solo se aseguran como PUBLIC. Muestra la base destino y pide escribir `SI`.
  No crea lotes ni pulseras (no ensucia Lotes/kits). Aparecen en Admin → Asistentes.
- **Cuidado**: si el `.env` apunta a la Neon de producción, los demo quedan visibles para asistentes
  reales → correr `-- --limpiar` antes de publicar.

### 44.7 Verificación realizada (entorno aislado: Postgres real vía PGlite + las funciones reales)
- Prueba de carga con 300 asistentes con pulsera: 1,018 peticiones, 0 errores 5xx, 30/30 groserías
  rechazadas, 0 asistentes con más de una nota activa, 0 groserías guardadas.
- Likes: dar/quitar, propia 403, inexistente 404, sin token 401; doble toque envía 1 sola petición y
  un segundo doble toque no repite; botón del visor alterna; Escape cierra.
- UI revisada en celular (390 px) y escritorio (1280 px) sin desbordes horizontales. `npm run build`
  y el type-check del servidor sin errores.
- **No se pudo probar** la concurrencia real (PGlite acepta una conexión a la vez).

### 44.8 Riesgos y pendientes
- ~~Carrera conocida~~ ✅ **Corregida el 5 oct (tarde)**: `createNote` corre en una transacción que toma
  `pg_advisory_xact_lock(hashtext('note:'||attendeeId))` antes del CTE. ⚠️ Sigue sin poder probarse con
  concurrencia real en PGlite (una sola conexión): se verificó el SQL y que el flujo no cambió.
- Agregar `Note` y `NoteLike` a las tablas de los scripts de respaldo (`scripts/_db.mjs`).
- ~~Ampliar lista / acción de moderación~~ ✅ hecho el 5 oct (tarde), ver `docs/MODERACION.md`.
- La nota tarda ~0.26 s en abrirse al tocar (espera el posible 2º toque).
- Antes de hacer el repo público: licencias de fuentes (Pressio TEST, Degular Demo, Antarctican).

### 44.9 Despliegue de este módulo
1. Aplicar `npm run db:migrar` a la Neon de **producción** (la `002` crea `Note`/`NoteLike`; la `005`
   crea `BlockedWord`; son idempotentes y solo agregan). Sin la 002 `/api/notes` y el carrusel fallan;
   sin la 005 solo falla el panel "Palabras bloqueadas" (las Notas siguen con la lista fija).
2. Limpiar datos demo si el `.env` apunta a producción (`npm run db:notas-demo -- --limpiar`).
3. `git push origin main` → Netlify despliega solo. Commits: `28f6979` (carrusel, panel Admin, filtro,
   demo; publicado 3:47 PM) y `73607a0` (likes, dos líneas, flechas, documentación).
4. Probar en `/home` con pulsera real: publicar, ver la burbuja, quitar, y revisar en `/admin/notas`.
5. Volver atrás si algo falla: Netlify → Deploys → deploy anterior → *Publish deploy* (las migraciones
   solo agregan tablas; no hay que revertirlas).

---

## 45. Preparación para GitHub y despliegue (5 oct 2026)

### Repositorio
- Remoto `origin`: `https://github.com/Javier10Castro/arraigados-app.git`, rama
  `main`. Había 2 commits previos (`babbc30`, `8e43aae`).
- **Auditoría de historial**: en ningún commit se rastrearon `.env`, `.env.*`
  (salvo `.env.example`), `respaldos/`, logs, claves ni volcados de la base. El
  `.env.example` antiguo solo traía valores de relleno (no credenciales).

### Archivos y configuración
- `.gitignore` ignora: `node_modules/`, `dist/`, `.vite/`, `coverage/`,
  `*.tsbuildinfo`, `/vite.config.js`, `/vite.config.d.ts`, `.env`, `.env.*`
  (menos `.env.example`), `*.pem`, `*.key`, `.netlify/`, `respaldos/`, `*.log`,
  `deno.lock`, `.DS_Store`, `Thumbs.db`.
- **`vite.config.js` / `vite.config.d.ts`**: los genera `tsc -b` en la raíz
  (`tsconfig.node.json` es *composite*). **Vite prioriza `vite.config.js` sobre
  `.ts`**, así que una copia vieja le ganaría al `.ts`. La fuente es
  `vite.config.ts`. Estaban versionados por error → quitar del índice con
  `git rm --cached` (ver pasos abajo).
- **`deno.lock`**: lo crea Netlify CLI (`netlify dev`) para el runtime de edge
  functions (6 hashes de `edge.netlify.com`). El proyecto no usa Deno ni edge
  functions; Netlify no lo necesita ni sirve para Cloudflare. Ignorado.
- **`waves.html`**: prototipo suelto ("Animated Purple Waves") sin referencias en el
  código → **eliminado** (ya no existe en el repo).
- **`src/data/merch.ts`**: sin importaciones → **eliminado**. Sus 4 imágenes
  `src/assets/img/merch-{vaso,tote,stickers,pulsera}.webp` quedaron huérfanas
  (no se borraron).
- **`.env.example`** documenta las variables; **`README.md`** es la versión corta; las
  notas históricas largas se conservan en `docs/NOTAS_DEL_PROYECTO.md`.

### Variables de entorno (todas solo de servidor; el frontend no usa ninguna)
| Variable | Obligatoria | Uso |
|---|---|---|
| `DATABASE_URL` | Sí | Neon PostgreSQL (endpoint *pooler*) |
| `SESSION_SECRET` | Sí | Firma de sesiones Staff/Admin (≥ 32 caracteres aleatorios) |
| `PUBLIC_BASE_URL` | Solo producción | Dominio de los QR (`{PUBLIC_BASE_URL}/p/{token}`); queda grabado en cada pulsera impresa |

Netlify Blobs no necesita variables dentro del runtime de Netlify.

### Fuentes (`public/rcs/fonts/`, 76 archivos)
| Familia | Archivos | Origen | En uso |
|---|---|---|---|
| Antarctican Headline | 10 pesos | fonnts.com | Se cargan Book, Bold, Black y Ultrabold: portada (`Cover`) y `--font-flyer-display` (tagline de Mercancía) |
| Pressio **TEST** | 20 (`No.21`–`No.55`) | no consta | Solo `No.35`: títulos del panel admin, cifras del Dashboard, fecha de portada. No tiene tildes/ñ |
| Degular **Demo** (Text/Display/Mono) | 56 | no consta | Solo se declara Degular Text Regular/Semibold/Bold, y `--font-flyer-body` no la usa ningún componente |

Google Fonts (`index.html`): Barlow Condensed y DM Sans (base), Caveat y EB Garamond
(usos puntuales). **Pendiente**: confirmar licencias de Antarctican (fonnts.com),
Pressio TEST y Degular Demo antes de publicar el repo (los archivos quedarían
descargables) y decidir si se eliminan los no usados.

### Netlify
`netlify.toml` define build, redirect SPA y cabeceras. Si el sitio de Netlify está
conectado a este repo, **cada push a la rama de producción dispara un deploy**
automático. Antes del primer deploy con estos cambios:
1. Las variables de arriba deben existir en *Site settings → Environment variables*.
2. Las migraciones `002`, `003` y `004` deben estar aplicadas en la base de
   producción (`npm run db:migrar`; son idempotentes). Si la base de producción es
   la misma Neon que usa el desarrollo local, ya están.
3. Probar con un *deploy preview* (rama distinta de `main`) antes de fusionar.

### Estado al cierre del 5 oct 2026
- Repo `Javier10Castro/arraigados-app`, rama `main`, conectado a Netlify (`redjuveniltijuana.com`);
  cada push a `main` despliega solo. Deploys del día: `2ce87b5` (Home, Menú, Mercancía), `28f6979`
  (Notas: carrusel, panel Admin, filtro, demo — publicado 3:47 PM) y `73607a0` (likes, dos líneas,
  flechas, documentación). `deno.lock` y `vite.config.*` ya no están en Git; `waves.html` y
  `src/data/merch.ts` ya no existen.
- Los avisos "LF will be replaced by CRLF" de Git en Windows son normales y no afectan.
- Detalle del módulo de Notas, su operación y sus pendientes: §44.

### Pendiente para Cloudflare (no iniciado)
38 Netlify Functions `.mts` con `config.path`, `@netlify/blobs` (fotos), `pg` por TCP
(requiere Hyperdrive/driver serverless de Neon) y cabeceras de `netlify.toml`
(→ `_headers`). `public/_redirects` (`/* /index.html 200`) ya es compatible.

---

## 46. Moderación, programa real y limpieza (5 oct 2026, tarde)

Pedido del propietario tras el análisis de pendientes (lista completa y estado de cada punto en
**`docs/PLAN_PENDIENTES.md`**).

### Hecho
- **Notas**: candado contra publicaciones simultáneas; **Retirar nota** en Admin (motivo + AuditLog);
  **palabras bloqueadas administrables** (migración `005_blocked_words.sql`, `server/blockedWords.ts`,
  3 funciones nuevas); lista fija ampliada y revisada contra 19 frases normales (0 falsos positivos).
  Ver §44 y `docs/MODERACION.md`.
- **`/programa`** ahora usa el programa **oficial** de `src/data/program.ts` (la misma fuente que `/home`):
  pestañas Sábado 17 / Domingo 18, sede del día con botón de ubicación y, el domingo, la sede según la
  zona del asistente. Antes mostraba un programa de relleno (`data/app.ts` → `schedule`, ya sin uso).
  También se corrigió que el texto de la pestaña activa se volviera morado sobre morado al pasar el
  cursor/tocar (`.day:hover` pisaba a `.dayActive`).
- **SVG** `Cita_Beige.svg` / `Cita_Morado.svg`: 348 KB → 162 KB (svgo, precisión 2; 56 píxeles de borde
  distintos de 1.5 M en una comparación a 2×).
- `server/auth.ts`: el mensaje de contraseña larga dice **bytes** (antes "caracteres").
- Documentos nuevos: `docs/MODERACION.md`, `docs/CODIGO_SIN_USO.md`, `docs/PLAN_PENDIENTES.md`.

### Hallazgos
- La campana de `/home` muestra **3 avisos inventados** iguales para todos ("Auditorio Principal",
  "Recepción Norte"…). Plan en `PLAN_PENDIENTES.md` §4.
- `AuthContext.tsx` y el recuadro "Datos de prueba" del Login **ya no existen**; el comentario de
  `AdminShell.tsx` ya estaba corregido. §21 tenía esos puntos desactualizados.
- `AuditLog` ya se llena en la mayoría de acciones: la Etapa 8 es principalmente una **pantalla** (§6 del plan).
- No hay `AuditLog` para cambios de menú/mercancía ni para canjes nuevos.

### Para desplegar
1. `npm run db:migrar` en producción (aplica la `005`).
2. Commit y `git push origin main` (el propietario lo hace; no se hizo commit desde aquí).
3. Probar en producción: Admin → Notas → *Palabras bloqueadas*, *Retirar* en una nota, `/programa`.



## 47. Campana, Auditoría y Recursos (5 oct 2026, noche)
- **Home campana:** `src/pages/home/Home.tsx` ya no inventa avisos; panel vacío honesto (`.panelEmpty`).
- **Auditoría (Etapa 8):** `shared/audit.ts` (catálogo de acciones, `auditDetails` sin `fp`, enlaces a entidad),
  `server/audit.ts` (`listAudit`, solo lectura, filtros q/category/actorId/from/to + paginación, quita
  `metadata.fp`), `GET /api/admin/audit` (ADMIN), `src/admin/Auditoria.tsx`, ruta `/admin/auditoria`,
  `nav.ts` con `ready: true`. Probada (API, UI desktop/móvil, sin overflow ni errores).
- **Recursos:** `src/data/resources.ts` (`RESOURCES`, vacío) + `Recursos.tsx` con `<a download>` reales y
  estado vacío; se eliminaron `resources/resourceFilters` y 3 imports de `data/app.ts`.
- **Respaldo:** ver `docs/PLAN_RESPALDO.md`.
- **Pendiente del propietario:** `npm run db:migrar` (migración 005), commit/push.

## 48. Notificaciones, Fase 1: avisos + campana (5 oct 2026, noche)
- **BD:** `migrations/006_announcements.sql` → `"Announcement"` (title≤60, body≤280, audience ALL|Zona 1|Zona 2, publishAt, retiredAt, createdById) y `"NotificationState"` (attendeeId PK, seenAt). Idempotente.
- **Compartido:** `shared/notifications.ts` (tipos, topes, `zoneAudienceOf` = misma regla que `resolveZoneForDisplay`).
- **Servidor:** `server/announcements.ts` — `listNotifications(token)` (zona del asistente por Church→Presbytery→Zone; tolera tabla inexistente 42P01), `markNotificationsSeen`, `listAnnouncementsAdmin`, `createAnnouncement` (valida, auditoría), `retireAnnouncement`.
- **Endpoints:** `GET /api/notifications`, `POST /api/notifications/seen` (x-pulse-token); `GET/POST /api/admin/announcements`, `POST /api/admin/announcements/:id/retire` (ADMIN).
- **Cliente:** `src/components/notifications/useNotifications.ts`, campana en `Home.tsx` (punto `.bellDot`, `.panelItemNew`), `src/admin/Avisos.tsx` (ruta `/admin/avisos`, `nav.ts`), `api.ts`.
- **Auditoría:** categoría `avisos`; `auditTarget` toma el título de `metadata` (no se une a "Announcement" para que Auditoría no dependa de la migración 006).
- **Fase 2 prevista:** likes agrupados reutilizando `seenAt` (no hace falta otra tabla de lectura).
- **Pendiente del propietario:** `npm run db:migrar`, commit/push.


## 49. Likes en la campana, "En vivo", plantillas y moderación v2 (5 oct 2026, noche)
- **BD:** `migrations/007_announcement_live.sql` (`"Announcement"."live"`). El servidor trata 42P01/42703 (tabla o columna inexistente) como campana vacía.
- **Campana:** `AppNotification` pasó a unión `announcement | like` (`shared/notifications.ts`). `listNotifications` une avisos + likes a tus notas (JOIN LATERAL: like más reciente + conteo; excluye el like del propio autor). Claves de fila `kind-id`. `NotificationRow` (`src/components/notifications/`) la comparten `/home` y la vista previa de Admin.
- **Admin → Avisos:** plantillas, casilla EN VIVO, vista previa y panel de ejemplos.
- **Moderación v2 (`shared/moderation.ts`):** `prep()` (NFKC, invisibles, homoglifos cirílico/griego, `_`→espacio), `fold()` (ph→f, k→c, v→b), comodines `* # ?`, unión de trozos cortos ("pu ta"), `FIXED_BLOCKED` exportado para mostrarlo. `PATCH /api/admin/blocked-words/:id` (editar; auditoría `blocked_word.update`). Script `npm run moderacion:probar` (`scripts/moderacion-prueba.mjs`, usa `typescript` para transpilar; solo lee).
- **Panel de palabras:** abierto por defecto, edición en línea, probador, lista fija en solo lectura.
- **Pendiente del propietario:** `npm run db:migrar` (007) ANTES del deploy; commit/push.
- (5 oct 2026) `scripts/db-likes-demo.mjs` (`npm run db:likes-demo`): likes de prueba para ver la campana. Solo inserta/borra filas con prefijo `demo-likes-`; pide escribir SI; muestra la base a la que se conecta.
- (5 oct 2026, noche) Las filas de like ya NO muestran el texto de la nota (se quitó `noteText` del payload y de la UI); el corazón va en círculo rojo sobre el avatar con el total al lado.
- (5 oct 2026, noche) **Likes en las notas con estilo Instagram:** `src/components/notes/LikeBadge.tsx` (círculo rojo `#e5365a` + corazón blanco + número; `on={false}` = círculo con borde) se usa en el botón de like de `NoteViewer` y en `NoteSheet`. `NoteBubble` tiene la prop `likes`: pastilla blanca con corazón rojo y número en la esquina inferior derecha de la burbuja (carrusel, nota propia y ajenas). Se quitó el contador junto a "Tu nota".
- (5 oct 2026, noche) **Quién le dio like a MI nota:** `GET /api/notes/likers` (`netlify/functions/notes-likers.mts`, `listMyNoteLikers` en `server/notes.ts`; identidad por `x-pulse-token`, solo la nota vigente propia, más reciente primero, máx. 50, solo primer nombre). Tipos `NoteLiker`/`NoteLikersResponse` en `shared/api.ts`; cliente `api.noteLikers`. `NoteSheet` (vista "Tu nota") recibe `token` desde `Home.tsx` y lista avatar + nombre + círculo de like. Sin migración. Probar: `npm run db:likes-demo -- --nombre=<dueño> --n=5` y `npm run dev` (con `dev:vite` no existen las funciones). Limpiar: `npm run db:likes-demo -- --limpiar`.
- **Pendiente del propietario:** `npm run db:migrar` (007) antes del deploy; commit/push; backup (ver `PLAN_RESPALDO.md`).

## 50. /homev2 — animación del gafete antes del Home (6 oct 2026)
- **Qué es:** `/homev2` = réplica exacta de `/home` + una animación de ~9.4 s (portada de la ruta `/try` del proyecto HangingCards): el gafete de la persona cae, muestra el frente, gira y muestra el reverso (programa de su sede + QR de su pulsera). Al terminar la capa se desvanece y queda el Home. Botón **Omitir** siempre visible. `/home` NO se tocó.
- **Archivos (`src/pages/homev2/`):** `HomeV2.tsx` (monta `Home` debajo y la capa encima; `SHOW_INTRO = true` = siempre; es el punto para limitarlo, p. ej. una vez por sesión), `IntroExperience.tsx` (secuencia + portal a `<body>`), `credentialData.ts` (`buildBadge(me, qrValue)`: único punto de unión con `/api/me`; programa de `src/data/program.ts`), `brand.ts` (rutas de logos/colores), `hanging/` (`HangingBadge`, `LanyardRibbon`, `MetalClasp`: física del péndulo, TSX), `credential/` (frente, reverso, QR, recorte de arte), `homev2.css` (CSS de HangingCards con TODOS los selectores bajo `.hc`, no afecta al resto; fuente 'Antarctican Headline' → 'Antarctican'), `overlay.css`.
- **Ruta:** `src/App.tsx` → `/homev2` con `React.lazy` + `Suspense` (la física/estilos solo cargan en esa ruta), dentro de `shell(...)` (requiere sesión de asistente, igual que `/home`).
- **Reutilizado:** `UserAvatar` (respeta Blobatar/Iniciales), librería `qrcode` (ya existente; el QR codifica `{origin}/p/{token}`, igual que el de la pulsera), fuentes y SVG de `public/rcs/`. Sin dependencias nuevas, sin cambios de BD.
- **Recursos nuevos:** `public/rcs/hc/marca-congreso.png` (wordmark "Congreso Distrital 2K26"; no existía en la app). La cita bíblica usa `public/rcs/svg_editables/Cita_Beige.svg`.
- **Decisiones:** sonido omitido; se quitaron la pantalla de bienvenida temporal, el estudio/editor y el modo "editorial" de HangingCards. Con `prefers-reduced-motion` la secuencia se acorta y la física se calma.
- **Probar:** `npm run dev`, entrar con una sesión de asistente y abrir `/homev2`.
- (6 oct 2026, mañana) **Ajustes de /homev2:** (1) fondo de cristal: la capa ya no tiene fondo propio, es un velo morado translúcido con `backdrop-filter: blur(18px)` (se ve la app detrás); estilos en `overlay.css`. (2) Animación más larga: ~13.4 s (frente 5.2 s, giro 1.15 s, reverso 7 s; versión "calma" 2.2/0.24/2.6 s). (3) **Mi gafete:** botón en el menú lateral (`AppShell.tsx`, estilo `.gafeteBtn`) y fila en `/mas` (móvil) → abre `GafeteViewer.tsx` (mismo gafete físico, sin temporizadores) con **Girar**, **Descargar imagen** y cerrar (X / Escape). Carga bajo demanda (`React.lazy`).
- **Descarga como imagen (sin dependencias):** `exportCredential.ts` clona el DOM plano (`credential/CredentialSheet.tsx`: frente + reverso lado a lado, fuera de pantalla), congela el estilo calculado, incrusta imágenes y fuentes como data-URI, lo envuelve en SVG `<foreignObject>` y lo dibuja en `<canvas>` (PNG, fondo transparente, 3×). Todo en el navegador. El brillo diagonal de la tarjeta pasó de `::after` a un elemento real (`.cred-sheen`) para que se pueda exportar.
- `vite.config.ts`: `server.watch.ignored` excluye `.netlify/` y `dist/` (en Windows `netlify dev` bloqueaba un archivo y Vite caía con `EBUSY`).
- (6 oct 2026) **Movimiento:** la animación de entrada es más tranquila (caída 0.2 rad en vez de 0.46, rebote vertical corto, viento 0.12): oscila ±70 px en lugar de ±100+ y se alcanza a leer. **"Mi gafete" (visor) arranca QUIETO y recto** (sin caída ni viento); la persona lo arrastra y lo gira si quiere. Constantes en `IntroExperience.tsx` (`DROP_*`, `physicsParams`; el modo `viewer` decide).
- (6 oct 2026) **El contador de likes es SOLO del dueño de la nota.** Quien da like ve únicamente el corazón: en el visor (`NoteViewer`, "Me gusta"/"Te gusta" + círculo) y en la burbuja del carrusel (`NoteBubble` prop `liked`: pastilla solo con corazón; se quitó el corazoncito del avatar). El servidor tampoco lo envía: `listNotesFeed` devuelve `likeCount: 0` y `toggleNoteLike` responde `likeCount: 0`. El dueño lo ve en su burbuja ("Tu nota"), en su hoja y en la campana.
- (6 oct 2026, tarde) **Bug del giro del gafete:** al girar se veía un instante el frente invertido. Causa: la animación `filter: brightness` sobre `.cred-card.is-turning` aplana el contexto 3D (`preserve-3d`) y rompe `backface-visibility`. Solución: el destello ahora es un `::before` blanco con animación de `opacity` dentro de cada `.cred-face.badge-face` (`homev2.css`, keyframes `cred-turn-light`); con `prefers-reduced-motion` no anima. Verificado por fotogramas: pasados 90° ya se ve el reverso.
- (6 oct 2026, tarde) **Notas que se adaptan de 1 a 2 líneas:** `NoteBubble.tsx` → `BubbleText` mide el texto (useLayoutEffect + ResizeObserver + `document.fonts.ready`) y prueba `one` (una línea) → `two` (dos líneas balanceadas) → `tight` (dos líneas con fuente `.88em`, clase `.tight` en `NoteBubble.module.css`). Notas cortas ("Hola") quedan en una línea; las largas en dos. La burbuja de invitación ahora es de una línea.

---

## 51. Admin → Iglesias (CRUD de iglesias, 6 oct 2026)
- **Qué es:** pantalla `/admin/iglesias` (solo ADMIN; entrada "Iglesias" en el menú del panel). Administra las **iglesias**; **presbiterios y zonas son fijos** (no hay endpoint ni pantalla para tocarlos, solo se leen y se eligen).
- **Fuente de verdad:** las tablas de Neon `"Church" → "Presbytery" → "Zone"` (las 109 iglesias del Excel oficial ya están ahí; `src/data/churches.ts` sigue muerto). **No hay migración nueva** ni cambios de BD.
- **Reglas (las aplica el servidor, `server/churches.ts`):** una iglesia pertenece a **un solo presbiterio** y la zona sale de él (`Presbytery.zoneId`); el nombre no se repite entre iglesias (sin importar mayúsculas ni acentos, 3–80 caracteres, espacios normalizados); se puede **agregar**, **renombrar**, **mover de presbiterio** y **eliminar**; con asistentes registrados **no se puede eliminar** (409 con el conteo; además la llave foránea protege el caso de carrera) → se renombra o se mueve. Los ids nuevos son estilo cuid (`newId()`); los existentes (slugs) no cambian.
- **API:** `GET /api/admin/churches` (iglesias con presbiterio, zona, ciudad derivada y nº de asistentes + lista de presbiterios) · `POST /api/admin/churches {name, presbyteryId}` · `PATCH /api/admin/churches/:id {name, presbyteryId}` · `DELETE /api/admin/churches/:id`. Archivos: `netlify/functions/admin-churches.mts`, `admin-church.mts`. Tipos en `shared/api.ts` (`AdminChurchRow`, `AdminPresbyteryOption`, `AdminChurchesResponse`, `ChurchInput`); cliente en `src/lib/api.ts`.
- **Auditoría:** `church.create`, `church.update` (guarda `{name|presbytery|zone: {from,to}}`), `church.delete`; categoría nueva **Iglesias** en `/admin/auditoria` (`shared/audit.ts`) con enlace a `/admin/iglesias`.
- **UI (`src/admin/Iglesias.tsx` + `Iglesias.module.css`, reutiliza estilos de `Usuarios.module.css`):** chips por zona, buscador (sin acentos), filtro por presbiterio, lista paginada; modal de alta/edición con selector de presbiterio agrupado por zona, aviso cuando mover cambia la zona (cambia también la sede del domingo y los avisos por zona de sus asistentes) y borrado con confirmación solo si no tiene asistentes.
- **Efecto en el registro:** `/api/churches` (buscador del registro) lee las mismas tablas; trae `cache-control: max-age=300`, así que una iglesia nueva puede tardar hasta ~5 min en aparecer en el buscador de quien ya lo tenía abierto.
- **Probado (PGlite con el esquema Prisma real: `updatedAt` obligatorio y FK):** 401 sin sesión, alta, duplicados (mismo nombre, otro acento/mayúsculas, otro presbiterio), presbiterio inválido, nombre corto, mover (cambia zona), renombrar, sin cambios, 404, borrar con asistentes (409) y sin ellos, auditoría; UI en escritorio y 390 px (crear, mover, eliminar, filtros, sin scroll horizontal ni errores de consola).

---

## 52. Programa oficial (6 oct 2026)
- El propietario compartió la hoja oficial "PROGRAMA — CONGRESO ARRAIGADOS RJDT". Fuente única en la app: `src/data/program.ts` (la leen `/home`, `/programa` y el reverso del gafete `/homev2`).
- **Formato corto respetado:** solo HORA + EVENTO. La hoja trae además Tiempo, Responsable, Iglesia y Notas; **no se publican** (regla editorial del propietario, ver encabezado de `program.ts`).
- **Cambios:** sábado 5:30 pm "Video / Contador" → **"Video Bienvenida y Contador"**; se **quitó "Convivencia 7:30 pm"** del sábado (no está en el programa oficial: el sábado cierra con Despedida 7:25 pm). Domingo sin cambios (6:00 Video / Contador · 6:05 Inicio Culto · 6:30 Ofrenda · 6:45 Predicación y Ministración · 7:45 Despedida).
- **Sedes (ya estaban bien):** sábado IAFCJ 12 para todos; domingo Zona 1 → IAFCJ 21, Zona 2 → IAFCJ 12 (`SUNDAY_VENUE_BY_ZONE`).
- La tarjeta "En vivo" de `/home` calcula el fin de cada bloque con el inicio del siguiente; ahora la última del sábado es "Despedida" (su fin = fin del día).
- Verificado: `/programa` (sábado 9 filas, domingo 5) y reverso del gafete con el horario nuevo, sin recortes.
- (6 oct 2026, despliegue) **Nombres cortos en la app** (pedido del propietario; el nombre oficial queda guardado en el encabezado de `program.ts` por si se requiere volver a él): sábado 4:10 pm **"Break"** (oficial "Break / Venta por parte del Distrito") y sábado 5:30 pm **"Intro"** (oficial "Video Bienvenida y Contador"). Se cambió en `program.ts` (única fuente) y en `Home.tsx` (`KIND_TITLE_OVERRIDES`: clave `Break` → etiqueta "Receso" en la tarjeta "Ahora"). Aplica a `/home`, `/programa` y el reverso del gafete.
- (6 oct 2026) El domingo 6:00 pm también pasó a **"Intro"** (oficial: "Video / Contador"), igual que el sábado 5:30 pm. Nombre oficial guardado en el encabezado de `program.ts`.

---

## 53. Home principal = HomeV2 · Instantáneas oculto (6 oct 2026)
- **Rutas intercambiadas** (`src/App.tsx`): `/home` ahora es **HomeV2** (el Home de siempre precedido por la animación del gafete, con "Omitir"); el Home anterior, **sin animación**, quedó en **`/homev2`** (para comparar o volver atrás). `/inicio` y todos los `navigate('/home')` (registro, "volver" de Mi kit/Mercancía, logo) llevan al nuevo Home. Para volver atrás basta intercambiar de nuevo las dos líneas de `<Route>`.
- ⚠️ La animación sale **cada vez que se entra a `/home`** (también al regresar desde Mi kit, Programa, etc.), porque `SHOW_INTRO = true` en `src/pages/homev2/HomeV2.tsx`. Si resulta molesto: limitarla a una vez por sesión del navegador (punto único de cambio: ese archivo).
- **Instantáneas oculto** (no se borró nada; `src/pages/Instantaneas.tsx` y su CSS siguen en el proyecto): quitado del menú lateral/rápido (`AppShell.tsx`), de "Más" (`Mas.tsx`) y del panel Admin (`admin/nav.ts`, donde era una entrada deshabilitada "Etapa 9"). La ruta `/instantaneas` ya no abre la maqueta: **redirige a `/home`** (import y ruta comentados en `App.tsx`). Cada lugar trae un comentario "OCULTO" con los pasos para restaurarlo.

## 54. Admin → Beneficios (CRUD) · respaldo total · limpieza de pruebas (6 oct 2026)
**Beneficios administrables.** Lo que dice "Incluye" en cada kit (Mi kit y Home) ya no es una lista fija: sale de la tabla `PackageBenefit`.
- **Migración `migrations/008_package_benefits.sql`** (idempotente; el seed corre solo al crear la tabla, así que re-correr `db:migrar` NO resucita beneficios borrados). Siembra lo de `packageContent`: Kit - A (Botella de agua, Rifa categoría 1), Kit - B (Bote personalizado, Botella de agua, Rifa categoría 2), Especial (Bote personalizado, Tote bag, Botella de agua, 1 entrada, 2 stickers, Rifa especial). Se enlaza por `Package.name`.
- **Servidor:** `server/benefits.ts`; funciones `admin-benefits.mts` (GET/POST `/api/admin/benefits`), `admin-benefit.mts` (PATCH/DELETE `/:id`), `admin-benefit-reorder.mts` (POST `/:id/reorder` `{dir:-1|1}`). Límites: 80 caracteres, 20 por kit; duplicado (sin importar mayúsculas/acentos) → 409. Auditoría `benefit.create/update/delete/move` (categoría "beneficios", enlace a `/admin/beneficios`).
- **Asistente:** `/api/me` devuelve `package.benefits` (si existe la tabla). `src/pages/Beneficios.tsx` y `Home.tsx` usan `me.package.benefits ?? packageContent[...]` → si no se corrió la 008, se ve la lista de siempre (sin romper).
- **UI:** `src/admin/Beneficios.tsx` (+ css), ruta `/admin/beneficios`, entrada "Beneficios" en `admin/nav.ts`. Chips por kit, subir/bajar, editar (el borrado pide confirmación), agregar; aviso si falta la migración. Las bebidas incluidas (`includedDrinks`) siguen perteneciendo al kit y se muestran solo de lectura.
- Probado en PGlite (API completa + auditoría + 401) y con Playwright 1280/390 px sin overflow.

**Respaldo total** (`docs/PLAN_RESPALDO.md`): `npm run db:respaldo-total` (solo lectura; carpeta `respaldos/respaldo-AAAAMMDD-HHMM/datos.json` con SHA-256 y conteos, + fotos de Netlify Blobs si `NETLIFY_SITE_ID`/`NETLIFY_AUTH_TOKEN` están en `.env`) y `npm run db:restaurar-total -- <carpeta> [--reemplazar]`. Helpers en `scripts/_respaldo.mjs`. ⚠️ La parte de fotos no se ha probado contra Netlify real.

**Limpieza** (`scripts/db-limpiar-pruebas.mjs`, reescrito): `npm run db:limpiar-pruebas -- --simular` (solo muestra) y `npm run db:limpiar-pruebas` (pide escribir `LIMPIAR TODO`; antes hace un respaldo total automático `antes-de-limpiar-…`). **Borra:** notas y likes, avisos y su estado, canjes, pulseras (Pulse), asistentes, lotes, Instantáneas y su auditoría. **Conserva:** todos los usuarios (Admin y Staff), kits, zonas/presbiterios/iglesias, menú (Venue/Dish), mercancía, beneficios, palabras bloqueadas, config. Aborta si no hay ADMIN activo; avisa de cuentas con pinta de demo sin borrarlas. ⚠️ Borra TODAS las pulseras/asistentes, aunque sean reales: ejecutarlo antes de generar los lotes definitivos.

## 55. Borrar lote · Vaciar bitácora (7 oct 2026)
Para dejar la app lista para entrega sin tener que usar scripts: dos botones en el panel Admin, ambos con confirmación escrita (`src/admin/ConfirmTypeModal.tsx`; el servidor también valida la palabra).
- **Borrar lote** (`/admin/lotes/:id`, tarjeta "Borrar lote"): `DELETE /api/admin/batches/:id` `{confirm: <código exacto del lote>}` → `deleteBatch()` en `server/batches.ts`, en UNA transacción: borra las pulseras del lote, los canjes hechos con ellas, y los asistentes que se registraron SOLO con pulseras de este lote (con sus notas, likes y estado de campana). Un asistente con pulsera en otro lote (reemplazo) se conserva; las pulseras de otros lotes que "reemplazaban" a una de este pierden esa referencia (`replacesId` → NULL). Deja auditoría `batch.delete` (código y conteos). Si hubiera datos que dependan del lote y bloqueen el borrado (FK 23503), responde que se use `db:limpiar-pruebas`. ⚠️ Es permanente; para lotes con pulseras reclamadas el modal lo advierte con el número.
- **Vaciar bitácora** (`/admin/auditoria`, botón "Vaciar bitácora"): `DELETE /api/admin/audit` `{confirm:'BORRAR BITACORA'}` → `clearAudit()` en `server/audit.ts`: borra TODO `AuditLog` y **no deja ninguna entrada propia** (la bitácora queda en cero; cambio del 6 oct tarde). Es lo único que borra la bitácora desde la app.
- Orden recomendado para entregar: borrar los lotes de prueba → (si quedan datos sueltos) `npm run db:limpiar-pruebas -- --simular` → vaciar la bitácora al final (así solo queda el rastro de lo que se haga ya en producción).
- Probado en PGlite (401 sin sesión, confirmación incorrecta, lote inexistente, asistente compartido que se conserva, conteos) y con Playwright 1280/390 px sin overflow.
- Archivos: `server/batches.ts`, `server/audit.ts`, `netlify/functions/admin-batch.mts`, `admin-audit.mts`, `shared/audit.ts` (acciones `batch.delete`, `audit.clear`), `src/lib/api.ts`, `src/admin/ConfirmTypeModal.tsx`, `LoteDetalle.tsx`, `Auditoria.tsx`.
- **Restricción (7 oct 2026):** "Vaciar bitácora" solo la puede usar la cuenta `javiercastro9912@gmail.com` (`canClearAudit()` → `isOwnerEmail()` en `server/owner.ts`; se puede cambiar con la variable de entorno `OWNER_EMAIL`, que reemplaza a la antigua `AUDIT_CLEAR_EMAIL`). La pantalla recibe `canClear` en `GET /api/admin/audit` y a los demás Admin no les muestra el botón; además el servidor responde 403 a `DELETE /api/admin/audit` si no es esa cuenta. "Borrar lote" sigue disponible para todos los Admin.
- **Ubicación de los botones (6 oct, tarde):** ambos van en la cabecera de la pantalla (slot `action` de `AdminShell`), pegados al extremo derecho y centrados con el título, con el mismo componente `src/admin/HeaderDangerButton.tsx` (ícono de bote; en celular solo ícono, desde 560 px ícono + texto). "Borrar lote" ya no tiene tarjeta propia: toda la explicación (qué se borra y qué se conserva) está en el modal de confirmación.

## 56. Eliminar cuentas · Kits (solo lectura) (6 oct 2026, tarde)
- **Eliminar cuenta** (Admin → Usuarios → abrir una cuenta → "Eliminar cuenta", con confirmación escribiendo `ELIMINAR`): `DELETE /api/admin/users/:id` → `deleteUser()` en `server/users.ts`. **Nunca** se puede eliminar: la cuenta dueña (`server/owner.ts`, `javiercastro9912@gmail.com`; cambia con `OWNER_EMAIL`) — a esa cuenta la pantalla ni le muestra el botón (`AdminUserRow.protected`) y el servidor también la rechaza —, la propia cuenta de quien lo pide, ni al último Admin activo. Si la cuenta ya tiene historial que la referencia (lotes, canjes…) la base lo impide y el mensaje sugiere **desactivarla**. Auditoría `user.delete` (nombre, correo, rol).
- **Kits** (`/admin/kits`, antes deshabilitado como "Etapa 5"): pantalla **de solo lectura** (v1 de `PLAN_PENDIENTES` §5). `GET /api/admin/packages` (`server/packages.ts`, sin migración): por kit nombre, precio, aguas incluidas, pulseras impresas / sin reclamar / reclamadas / deshabilitadas, aguas canjeadas vs. incluidas (% de uso), ingreso esperado (precio × reclamadas) y lo que incluye (de Beneficios). Los kits siguen siendo fijos: no se crean ni se editan desde la app.
- Archivos: `server/owner.ts`, `server/users.ts`, `server/packages.ts`, `server/audit.ts`, `netlify/functions/admin-user.mts`, `admin-packages.mts`, `shared/api.ts`, `shared/audit.ts` (acción `user.delete`; se quitó `audit.clear`), `src/lib/api.ts`, `src/admin/Usuarios.tsx`, `Kits.tsx` (+ css), `nav.ts`, `App.tsx`.
- **Ruta de Kits (6 oct, tarde):** la pantalla vive en **`/admin/kits`** (entrada "Kits" del menú lateral). La ruta anterior `/admin/paquetes` ya no es una pantalla: redirige a `/admin/kits`. (Si en el menú aún se ve "Kits" deshabilitado con "Etapa 5", es que se está viendo una versión anterior: falta subir/reiniciar.)
