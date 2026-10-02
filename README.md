# Arraigados 2K26 · App del Congreso

Web app del **Congreso Juvenil Arraigados 2K26**, organizado por la **Red Juvenil Tijuana**.

- **Fechas:** sábado 17 y domingo 18 de octubre de 2026
- **Sedes:** 12va Iglesia y 21ra Iglesia, Tijuana
- **Lema:** Colosenses 2:6-7

> **Estado (1 oct 2026):** Etapa 1 (base y autenticación) y **Etapa 2 (Usuarios)
> COMPLETADAS Y VERIFICADAS**. **Etapa 3 — Lotes: COMPLETADA** (base real
> confirmada con `npm run db:esquema` el 1 oct 2026; ver [Etapa 3](#etapa-3--lotes)).
> **Etapa 4 — Asistentes: COMPLETADA** (2 oct 2026; ver [Etapa 4](#etapa-4--asistentes)).
> **Etapa 7 — Dashboard: v1 COMPLETADA** (1 oct 2026, noche; ver [Dashboard](#etapa-7--dashboard-v1)).
> **Avatares:** todas las personas usan Blobatar (`UserAvatar`). Ver
> [Estado actual](#estado-actual) y [`docs/CLAUDE_HANDOFF.md`](docs/CLAUDE_HANDOFF.md) §34–§35.

---

## Arquitectura

```
Navegador → Vite (5173) → Netlify Dev (8888) → /api/* (Netlify Functions) → Neon PostgreSQL
```

| Capa | Tecnología |
|---|---|
| Build | Vite 5 |
| UI | React 18 + TypeScript (strict) |
| Rutas | React Router 6 (`BrowserRouter`, fuente única: `src/App.tsx`) |
| Estilos | CSS Modules + `src/styles/global.css` y `tokens.css` |
| Íconos | lucide-react |
| Backend | **Netlify Functions** (`netlify/functions/*.mts`, una por ruta `/api/*`) |
| Lógica de servidor | `server/` — `attendee`, `auth`, `db`, `http`, `staff`, `users` |
| Contrato front↔server | `shared/api.ts` (tipos, regex y constantes) |
| Base de datos | **Neon PostgreSQL** (ya conectada, misma base que el Next.js) |
| Driver | `pg` (node-postgres) sobre el host *pooler* |
| Deploy | Netlify (`netlify.toml`, SPA con redirect a `index.html`) |
| Escáner QR | `html5-qrcode` (cámara real) |

**Las credenciales de Neon nunca llegan al navegador.** Vite solo habla con
`/api/*`; `DATABASE_URL` y los secretos viven en `.env` y los usan únicamente las
Functions, en el servidor.

**Desarrollo local:** `npm run dev` (= `netlify dev`) levanta Vite + Functions
juntos en **http://localhost:8888**. Las variables se cargan desde `.env` mediante
`[dev] envFiles` de `netlify.toml`. Usa siempre `:8888`, no `:5173`.

## Cómo correrlo

Requiere Node 20+ y Netlify CLI (una sola vez: `npm install -g netlify-cli`).

1. Copia `.env.example` como `.env` (en esta carpeta) y pon en `DATABASE_URL` la conexión a Neon:
   es **la misma base del proyecto Next.js** (puedes copiar el valor de su `.env`).
2. Agrega `SESSION_SECRET` (clave aleatoria para las sesiones de Staff/Admin). En PowerShell:

```powershell
$b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); Add-Content .env ("SESSION_SECRET=" + [Convert]::ToBase64String($b))
```

3. Corre:

```bash
npm install
npm run dev         # netlify dev: Vite + funciones /api en http://localhost:8888
npm run dev:vite    # solo Vite (sin /api; las pantallas con datos reales no cargan)
npm run dev:https   # https en :5174 para probar la cámara desde un celular (requiere `npm run dev` en otra terminal)
npm run build       # tsc -b && vite build → dist/
npm run db:esquema  # SOLO LECTURA: estructura real de Batch/Pulse/Package/Attendee en Neon
npm run db:renombrar-kits  # renombra los paquetes a "Kit - A", "Kit - B", "Especial" (pide confirmación)
```

> Abre **http://localhost:8888** (no 5173): ahí viven las rutas `/api/*`.

### Probar desde un celular (cámara)

Los navegadores solo dan acceso a la cámara en https. Con el celular en la misma red Wi-Fi:

1. Terminal 1: `npm run dev` (deja corriendo).
2. Terminal 2: `npm run dev:https`. Muestra una dirección tipo `https://192.168.0.188:5174`.
3. Abre esa dirección en el celular y acepta la advertencia del certificado ("Avanzado → Continuar").
   Es un certificado de desarrollo; con el dominio real esto ya no aparece.

### Probar con pulseras

- Crea un lote en **Admin → Lotes** (`/admin/lotes`) y copia el enlace de una pulsera.
- En desarrollo deja `PUBLIC_BASE_URL` vacío: el enlace queda `http://localhost:8888/p/{qrToken}`
  (el mismo origen de `npm run dev`). También puedes escanear el QR desde **Mi registro**.
- Los QR con `localhost` **no se imprimen** para el congreso: la pantalla lo advierte.

## Base de datos (Neon, compartida con Next.js)

Vite **no crea ni modifica tablas**: lee y escribe las mismas que el Next.js, con sus mismas reglas.

- Reclamar pulsera: `server/attendee.ts` (réplica de `src/lib/claim.ts` del Next.js; atómica).
- Prisma genera `id` y `updatedAt` en su cliente: Vite los llena igual en cada INSERT/UPDATE (`server/db.ts`).
- Rangos de edad (`shared/api.ts`) = CHECK de Neon = `age-ranges.ts` del Next.js.
- Ciudad de cada iglesia (`shared/churches.ts`) = `deriveCity` del Next.js.

### Rutas de la API (`netlify/functions`)

| Ruta | Para qué |
|---|---|
| `GET /api/churches` | Iglesias con presbiterio, zona y ciudad |
| `GET /api/packages` | Paquetes activos (precio en centavos, aguas frescas) |
| `GET /api/pulse/:token` | Estado de una pulsera: `active`, `unclaimed`, `invalidated`, `not_found` |
| `POST /api/claim` | Registro del asistente + reclamación atómica |
| `GET /api/me` | Datos del asistente (token en la cabecera `x-pulse-token`) |
| `POST /api/auth/login` · `logout` · `GET /api/auth/me` | Sesión de Staff/Admin con su cuenta de `User` (cookie httpOnly firmada) |
| `GET /api/staff/pulse?token=…` / `?code=…` | Datos de una pulsera para el modal de canje (solo Staff). `code` = `AR26-XXXXX` o `QRONLY:<qrToken>` |
| `GET /api/staff/search?q=…&churchId=…` | Buscar asistentes con pulsera activa por nombre y/o iglesia (solo Staff) |
| `POST /api/staff/redeem` | Canjear 1 agua fresca (atómico, con `idempotencyKey`; `createdById` = Staff) |
| `POST /api/staff/reassign` | Reemplazar la pulsera de un asistente: la actual queda deshabilitada y una nueva del mismo kit queda activa, con las aguas ya canjeadas descontadas (Staff/Admin) |
| `POST /api/auth/password` | La cuenta de la sesión cambia su contraseña (obligatorio si es temporal) |
| `GET/POST /api/admin/users` | Admin: lista de cuentas / crear cuenta con contraseña temporal |
| `PATCH /api/admin/users/:id` · `POST …/:id/password` | Admin: nombre, rol, activar/desactivar / nueva contraseña temporal |
| `GET/POST /api/admin/batches` | Admin: lotes con conteos + paquetes / crear lote de 1 a 500 pulseras |
| `GET /api/admin/batches/next-code` | Admin: siguiente nombre libre `LOTE-AAAA-NNN` |
| `GET /api/admin/batches/:id?page=&pageSize=&q=&status=` | Admin: detalle del lote y UNA página de sus pulseras (búsqueda y filtro en el servidor). Pantalla: `/admin/lotes/:id` |
| `GET /api/admin/batches/:id/pdf?size=a4\|letter\|tabloid` | Admin: PDF imprimible del lote (tarjetas de 50 × 35 mm) |
| `GET /api/admin/batches/:id/pulses/:pulseId/qr` | Admin: PNG del QR de una pulsera |
| `GET /api/admin/attendees` | Admin: asistentes con búsqueda y filtros (`q`, zona, presbiterio, iglesia, kit, aguas, `page`, `pageSize` 10/25/50; 10 por defecto) |
| `GET /api/admin/attendees/catalog` | Admin: zonas, presbiterios, iglesias y kits para los filtros |
| `GET/PATCH /api/admin/attendees/:id` | Admin: detalle (pulseras y canjes) / corregir nombre, edad e iglesia (queda en auditoría) |
| `GET /api/settings` · `GET/PATCH /api/admin/settings` | Configuración global (modo de avatar). Leer: público · cambiar: solo Admin |
| `GET /api/admin/dashboard?period=&zoneId=&presbyteryId=&churchId=&packageId=` | Admin: todas las métricas del Dashboard en una respuesta (solo lectura) |

### Sesión del asistente

El token de su pulsera se guarda en su celular (`localStorage`) al escanear o registrarse. El servidor
lo valida en Neon en cada consulta. Escanear otra pulsera cambia la sesión; volver a escanear la recupera.
El código manual `AR26-XXXXX` **no** es un acceso del asistente: es herramienta exclusiva de Staff.

## Estructura

```
arraigados-app/
├── index.html              # Meta, Google Fonts (Barlow Condensed, DM Sans, EB Garamond, Caveat)
├── netlify.toml            # Build, Functions, redirect SPA, headers y config de netlify dev
├── package.json            # dev = netlify dev · build = tsc -b && vite build · scripts db:*
├── server/                 # Lógica de servidor (nunca llega al navegador)
│   ├── db.ts               # ÚNICA conexión a Neon: pool, query(), withTransaction(), newId()
│   ├── auth.ts             # Cookies, sesiones, fingerprint, reglas de contraseña
│   ├── users.ts            # Cuentas, auditoría, cambio de contraseña
│   ├── attendee.ts         # Pulsera, claim atómico, datos del asistente
│   ├── staff.ts            # Lookup, búsqueda y canje de bebidas
│   ├── dashboard.ts        # Métricas del Dashboard (solo lectura)
│   └── http.ts             # Respuestas y errores JSON
├── netlify/functions/      # 22 Functions: cada una declara su ruta con `export const config`
├── shared/                 # Contrato front↔server (api.ts, churches.ts)
├── scripts/                # Mantenimiento de DB: conteo, respaldo, limpieza, restaurar
├── docs/                   # CLAUDE_HANDOFF.md (detalle) + CONEXION_NEON, PLAN_DOMINIO, RESPALDO_Y_LIMPIEZA
├── public/
│   ├── _redirects
│   └── rcs/
│       ├── background/     # Capas SVG del fondo del flyer
│       ├── fonts/          # Antarctican, Degular (demo), Pressio (test)
│       └── svg_editables/  # Logos, cita, sedes, hashtag, aros RJDT
└── src/
    ├── main.tsx            # BrowserRouter
    ├── App.tsx             # 19 rutas + guardas RequireAttendee / RequireStaff
    ├── admin/              # AdminShell (sidebar + barra móvil), AdminMas, Usuarios, Lotes, Asistentes, nav
    │   └── dashboard/      # Dashboard (Etapa 7): página, gráficas, actividad, polling
    ├── context/            # StaffSession (sesión real) · PulseSession (pulsera real)
    ├── lib/                # api.ts (cliente fetch) · pulseCode.ts (parseo de QR/códigos) · avatar.ts (semillas)
    ├── data/               # app.ts = contenido fijo (mock) de programa, comida, recursos, beneficios
    ├── components/         # AppShell, Button, Badge, QrScanner, RedeemModal, ChurchCombobox, UserAvatar, …
    ├── pages/              # Una página por pantalla (.tsx + .module.css)
    ├── styles/             # tokens.css (paleta, tipografía, radios) y global.css
    └── assets/             # Imágenes .webp y texturas del flyer
```

Fuera de `arraigados-app/`, en la carpeta del proyecto, están los recursos originales: `rcs/`, `Mockups/`, `instantaneas/`, `platillos/`, `Wallpaper/`, `logo.png` y los wallpapers.

## Rutas

Todas definidas en `src/App.tsx`. "Asistente" = requiere pulsera activa en ese celular.

| Ruta | Pantalla | Protegida | Notas |
|---|---|---|---|
| `/` | Portada (Cover) | No | Arte del flyer. Botones "Conocer más" y "Mi registro" |
| `/conocer` | Conocer más | No | Fechas, sedes, paquetes (precio y aguas de Neon), cómo funciona la pulsera |
| `/login` | Ingreso | No | Correo y contraseña contra `User` **de Neon** (no usuarios demo) |
| `/registro` | Mi registro | No | Escáner de QR con cámara real; también acepta URL o código manual |
| `/p/:token` | Mi registro | No | Es la URL que trae el QR impreso. Decide según el estado de la pulsera |
| `/cuenta/contrasena` | Crear / cambiar contraseña | Staff o Admin | **Obligatoria** si entraste con contraseña temporal |
| `/staff` | Staff | **Staff o Admin** | Buscar pulsera (token o `AR26-XXXXX`), buscar asistente, **canjear bebida**. Real, no maqueta |
| `/inicio` | Inicio | Asistente | "Ahora", próximos eventos y notificaciones |
| `/programa` | Programa | Asistente | Pestañas por día — **contenido fijo de prueba** |
| `/beneficios` | Mi paquete | Asistente | Vasos e información del paquete. **Los beneficios son texto fijo** |
| `/comida` | Comida | Asistente | Menú por sede — **contenido fijo de prueba** |
| `/instantaneas` | Instantáneas | Asistente | **Maqueta local, sin red.** El concepto correcto es "Instants" (Instagram), NO stories |
| `/recursos` | Recursos | Asistente | Fondos, stickers y presentaciones |
| `/mas` | Más | Asistente | Accesos, cuenta e información del evento |
| `/admin` | → `ADMIN_HOME` | Solo Admin | Redirige a la primera sección lista; hoy **`/admin/resumen`** (Dashboard) |
| `/admin/resumen` | Dashboard | Solo Admin | **Etapa 7 v1.** Monitoreo operativo, polling 60 s |
| `/admin/lotes` · `/admin/lotes/:id` | Lotes | Solo Admin | Etapa 3 |
| `/admin/asistentes` · `/admin/asistentes/:id` | Asistentes | Solo Admin | Etapa 4 |
| `/admin/usuarios` | Usuarios | Solo Admin | Etapa 2 |
| `/admin/mas` | Más (Admin) | Solo Admin | Secciones no-`primary` + herramientas + cuenta |
| `/admin/*` | → `ADMIN_HOME` | Solo Admin | ⚠️ Catch-all: toda ruta admin **no implementada** rebota aquí en silencio |

Secciones construidas: **Dashboard** (`/admin/resumen`, la que abre el panel),
**Lotes**, **Asistentes** y **Usuarios**. Las otras 3 existen **solo como etiquetas** en `src/admin/nav.ts`,
con su etapa y deshabilitadas: Paquetes (5), Auditoría (8), Instantáneas (9).

**No existe `/admin/staff`** (ni debe crearse): el acceso a las herramientas de
Staff es el botón **"Abrir Staff"**, que lleva a `/staff`.

Las rutas de asistente se muestran dentro de `AppShell`: barra lateral en escritorio y navegación inferior en móvil.

## Etapas

| Etapa | Contenido | Estado |
|---|---|---|
| 1 | Base / Autenticación | ✅ Completada |
| 2 | Usuarios | ✅ **Completada y verificada** |
| 3 | **Lotes** | ✅ **Completada** (Neon confirmado con `npm run db:esquema`) |
| 4 | **Asistentes** | ✅ **Completada** |
| 5 | Paquetes | ⬜ |
| 6 | Canje de bebidas | ⬜ (el motor ya existe; falta la parte de Admin) |
| 7 | Dashboard | ✅ **v1** (export y modo pantalla pendientes) |
| 8 | Auditoría | ⬜ |
| 9 | Instantáneas | ⬜ |

**El Dashboard iba al final**, pero el usuario pidió construirlo el 1 oct 2026
(antes de las Etapas 5 y 6). Usa solo datos que ya existen; lo que depende de
Paquetes o de la parte Admin de canjes está documentado como limitación
(handoff §34.8). Antes tendría que inventar métricas o duplicar consultas que
después habría que reescribir. En el menú admin la sección que antes decía
"Resumen" ahora se llama **Dashboard**.

> ℹ️ Las etapas mostradas en el menú del panel de Admin coinciden con esta tabla
> (`src/admin/nav.ts`, campo `stage`). La **Etapa 6 (Canje de bebidas) todavía no
> aparece como sección del menú**, porque su alcance está sin definir.

## Identidad visual

- **Paleta** (`tokens.css`): morado `#3e07a6`, morado oscuro `#1e0263`, morado claro `#7b5bff`, crema `#f2f7d7` e ink `#0b0f1a`.
- **Tipografía:** Barlow Condensed para títulos, DM Sans para texto, EB Garamond y Caveat como acentos. Antarctican y Degular para el arte del flyer.
- **Fondo:** `FlyerBackground` apila 12 capas SVG (`public/rcs/background`) con viñeta y grano.
- Respeta `prefers-reduced-motion`.

## Estado actual

### Listo (Fase 1, contra Neon)
- **Portada → Conocer más** (`/conocer`): fechas, sedes, paquetes (precio y aguas frescas de Neon) y cómo funciona la pulsera.
- **Mi registro**: escáner de QR con cámara real (`html5-qrcode`) → `/p/:token` decide: pulsera activa → Inicio;
  sin reclamar → formulario (iglesias de Neon, presbiterio/zona automáticos, rangos de edad de Neon); invalidada o inexistente → aviso.
- **Reclamación atómica** probada con 8 reclamos simultáneos de la misma pulsera: gana uno, no quedan asistentes de más.
- **Inicio, Mi paquete y Más** con los datos reales del asistente. Mi paquete es solo consulta: vasos sólidos (disponibles) y punteados (canjeados).
- `tsc` pasa sin errores.

### Listo (Fase 2, Staff)
- **Login de Staff/Admin** (`/login`) con las mismas cuentas de `User` del Next.js; cuentas desactivadas pierden acceso al instante.
- **Staff** (`/staff`): escanear QR, buscar por nombre (sin importar acentos) y/o iglesia, o escribir el código `AR26-…`.
- **Modal de canje:** nombre, iglesia · presbiterio · zona, paquete, código y 3 vasos (sólido = disponible, punteado = canjeada).
  "Aceptar" descuenta exactamente 1 y el modal se cierra solo a los 2 s. Kit - A o sin saldo: sin botón Aceptar.
- Probado: doble clic y 6 toques simultáneos descuentan solo 1; 5 canjes simultáneos con 1 de saldo: pasa 1.
- `Redemption.location` queda vacío por ahora (la zona/iglesia se obtiene del asistente).

### Listo (Etapa 2, acceso y Usuarios)
- **Login por rol:** Admin entra al panel (`/admin`), Staff a `/staff`. Staff no puede abrir el panel; Admin sí puede abrir Staff.
- **Contraseña temporal:** las cuentas que crea Admin (o a las que restablece la contraseña) deben crear su propia
  contraseña al entrar (`/cuenta/contrasena`). Sin cambios de esquema: se detecta con `AuditLog` + una huella de la
  contraseña cifrada. Cambiar o restablecer una contraseña cierra las sesiones abiertas de esa cuenta.
- **Panel de Admin** (`src/admin/`): menú lateral en computadora, barra inferior en celular (Dashboard · Lotes · Asistentes · Más).
  Las secciones de etapas futuras aparecen deshabilitadas con su etapa.
- **Usuarios** (`/admin/usuarios`): crear (con contraseña temporal generada), editar nombre y rol, desactivar/reactivar,
  restablecer contraseña. Nunca se borran cuentas; nadie puede quitarse el rol de Admin ni desactivarse; siempre queda un Admin activo.
- Cada cambio de cuenta queda en `AuditLog` (`user.create`, `user.update`, `user.password_reset`, `user.password_change`).
- **Bug corregido (1 oct 2026) — `/cuenta/contrasena`:** el botón "Guardar contraseña" se quedaba deshabilitado sin
  explicación, porque una de las condiciones del botón (`!current`) no tenía regla visible y el `submit` fallaba en
  silencio. Ahora las 5 reglas visibles reflejan las 5 condiciones (incluida la actual/temporal y el máximo de 72 bytes,
  que replica `passwordProblem()` del servidor), y si algo falta se muestra el mensaje exacto. **Causa y corrección
  100 % en frontend** (`src/pages/CambiarContrasena.tsx`); el backend no se tocó. La regla "distinta a la temporal" se
  mantiene a propósito: sin ella el usuario podría "cambiar" su temporal por sí misma. Detalle en
  `docs/CLAUDE_HANDOFF.md` §27.

### Etapa 2 — COMPLETADA Y VERIFICADA
- **Login por rol:** Admin entra al panel (`/admin`), Staff a `/staff`. Staff no puede abrir el panel; Admin sí puede abrir Staff.
- **Contraseña temporal:** las cuentas que crea Admin (o a las que restablece la contraseña) deben crear su propia
  contraseña al entrar (`/cuenta/contrasena`). Sin cambios de esquema: se detecta con `AuditLog` + una huella de la
  contraseña cifrada. Cambiar o restablecer una contraseña cierra las sesiones abiertas de esa cuenta.
- **Panel de Admin** (`src/admin/`): menú lateral en computadora, barra inferior en celular (Dashboard · Lotes · Asistentes · Más).
  Las secciones de etapas futuras aparecen deshabilitadas con su etapa.
- **Usuarios** (`/admin/usuarios`): crear (con contraseña temporal generada), editar nombre y rol, desactivar/reactivar,
  restablecer contraseña. Nunca se borran cuentas; nadie puede quitarse el rol de Admin ni desactivarse; siempre queda un Admin activo.
- Cada cambio de cuenta queda en `AuditLog` (`user.create`, `user.update`, `user.password_reset`, `user.password_change`).

### Bug corregido — cambio de contraseña (1 oct 2026)
El botón "Guardar contraseña" de `/cuenta/contrasena` se quedaba **deshabilitado sin
explicación**: una de las condiciones del botón (`!current`) no tenía ninguna regla
visible, así que las 3 reglas podían aparecer **en verde** con el botón muerto, y el
`submit` además fallaba en silencio.

Corregido (4 cambios, **100 % frontend**, backend intacto):
1. Regla visible `Escribe tu contraseña temporal` (o "actual") que refleja esa condición.
2. El `submit` muestra el mensaje del primer requisito incumplido en vez de no hacer nada.
3. `name` en los inputs (`currentPassword`, `newPassword`, `newPasswordConfirm`) para el gestor de contraseñas.
4. Límite de **72 bytes** visible y medido con `TextEncoder`, idéntico al `passwordProblem()` del servidor.

La regla "distinta a la temporal" se mantiene **a propósito**: sin ella el usuario
podría "cambiar" su contraseña temporal por sí misma y quedaría con una que el
Admin cree temporal. Verificado con build + **44/44 pruebas E2E** en navegador real
(flujo forzado y flujo normal, contra Neon). Detalle en `docs/CLAUDE_HANDOFF.md` §27.

### Etapa 3 — Lotes

Implementada (OpenCode la empezó; Claude la terminó y la corrigió el 1 oct 2026). Detalle en `docs/CLAUDE_HANDOFF.md` §31.

- **`/admin/lotes`** (solo Admin; es la pantalla con la que abre el panel): crear lote (nombre, paquete,
  1 a 500 pulseras), lista con conteos, detalle con tabla de pulseras, copiar enlace, bajar el QR de una
  pulsera y descargar el PDF del lote en **A4, Carta o 11 × 17**.
- **Una pulsera = un `qrToken`** (16 caracteres base62). QR = `{PUBLIC_BASE_URL}/p/{qrToken}`. No se generan
  códigos `AR26-…` nuevos; `Pulse.manualCode` (obligatorio en la base) se llena con `QRONLY:<qrToken>`.
  Staff acepta ese valor para abrir y canjear, y en pantalla lo muestra como `QR aBcD…`.
- **PDF:** plantilla oficial `template_card_clean.png`; cada tarjeta mide **exactamente 50 × 35 mm**
  (sin escalar para llenar la hoja); A4 y Carta = 21 por hoja, 11 × 17 = 55. Regla de 5 cm al pie para
  comprobar que se imprimió al 100%. El QR va en vectores: un lote de 500 sale en ~3 s.
- **Esquema:** único cambio, `migrations/001_batch_status.sql` (`Batch.status`, inicial `ABIERTO`).
  No hay botón para cerrar lotes.
- **Antes de imprimir pulseras reales:** poner el dominio definitivo en `PUBLIC_BASE_URL` (queda grabado en
  cada QR) y correr `npm run db:esquema` para confirmar la base.

### Etapa 4 — Asistentes

Detalle en `docs/CLAUDE_HANDOFF.md` §33.

- **`/admin/asistentes`** (solo Admin): buscador por nombre (cada palabra, sin acentos), filtros zona →
  presbiterio → iglesia, kit y aguas (con aguas / agotadas / su kit no incluye). Los filtros quedan en la URL.
- **`/admin/asistentes/:id`**: datos, pulsera activa y anteriores, aguas y canjes. **Corregir** nombre, edad e
  iglesia (cada corrección queda en `AuditLog` como `attendee.update`). El kit no se cambia aquí.
- Sin cambios de esquema.

### Etapa 7 — Dashboard (v1)

Detalle completo (definición de cada métrica, filtros, alertas, limitaciones) en `docs/CLAUDE_HANDOFF.md` §34.

- **`/admin/resumen`** (= `/admin`, solo Admin): encabezado "En vivo" con hora de la última
  actualización, botón Actualizar y **refresco automático cada 60 s** (solo con la pestaña visible).
- Jerarquía: **1 ¿Cómo vamos?** (Registrados, Registros de hoy vs ayer, Aguas, Kits, Valor estimado
  —no son pagos—, Pulseras reclamadas) · **2 ¿Quién está llegando?** (por día, por hora + velocidad,
  presbiterio, zona, top 10 iglesias; clic → Asistentes filtrado) · **3 ¿Qué están consumiendo?**
  (dona de kits + tabla con valor, aguas, canjes por hora, canjes por Staff) · **4 ¿Quiénes son?**
  (edades, representación) · **5 ¿Qué está pasando ahora?** (actividad con pestañas, sábado vs domingo,
  estado de pulseras y de lotes) + **alertas** con umbrales documentados.
- **Filtros globales** en la URL: periodo (Todo/Hoy/Ayer/Sábado 17/Domingo 18), zona, presbiterio,
  iglesia y kit. Cada módulo que no respeta un filtro lo indica.
- Todo en hora de Tijuana. Gráficas con CSS/SVG propios: **sin dependencias nuevas**.
- Backend: `server/dashboard.ts` + `netlify/functions/admin-dashboard.mts` (rol ADMIN revalidado en servidor).
- Pendiente: **Exportar reporte** (botón deshabilitado) y **modo pantalla** del congreso.

### Avatares (Blobatar)

- `src/components/UserAvatar.tsx`: avatar determinista generado en el navegador (sin columnas, sin imágenes).
- Semilla `user-<id>` (Staff/Admin) o `attendee-<id>` (asistentes), en `src/lib/avatar.ts`; el nombre solo si no hay id.
- Se usa en Inicio, AppShell, Más, Instantáneas, AdminShell, Usuarios, LoteDetalle, AsistenteDetalle y Dashboard.
- **Configuración global (Admin → Usuarios → "Apariencia de usuarios"):** Blobatar (por defecto) o Iniciales para toda la app.
  Solo ADMIN la cambia (`PATCH /api/admin/settings`); se lee con `GET /api/settings`. Se guarda en `AuditLog`
  (`entityType = 'Setting'`), sin tablas nuevas. `components/BloBatar.tsx` es el estilo del modo Blobatar
  (fondo transparente). Detalle en handoff §36.

### Tablas: paginación y carga (handoff §37–§38)

- **Toda tabla se pagina** con `<Pagination>` (`src/components/Pagination.tsx`): 10 por página por defecto, 10 · 25 · 50.
  Pulseras de un lote y Asistentes se paginan **en el servidor** (con búsqueda/filtros sobre todo el conjunto);
  Usuarios, Lotes y los feeds del Dashboard en el navegador (`usePagedList`). Filtros ⇒ página 1. Sin "Ver todos".
- **Esqueletos de carga** (`src/components/Skeleton.tsx`): mientras carga nunca se muestran "0" ni "sin resultados".

### Pendiente / simulado
- **Cierre de lotes:** fuera de la Etapa 3. El **reemplazo de pulsera** ya existe en Staff (ver handoff §32).
- **Sin construir:** Paquetes (5), la parte admin de canjes (6), Auditoría (8), Instantáneas admin (9).
  Del Dashboard (7) faltan exportar y el modo pantalla.
- **Etapa 6 — Canje de bebidas: el motor YA EXISTE.** `POST /api/staff/redeem` +
  `server/staff.ts` hacen el canje de forma **idempotente y transaccional** (con
  `idempotencyKey`, `UPDATE` condicional y tope contra `Package.includedDrinks`), y
  el modal ya está integrado en `/staff`. Lo que falta es la **parte de Admin**
  (ver canjes, historial, anulaciones) y revisar/completar la experiencia de Staff.
  Por eso **no aparece todavía como sección del menú admin**. No se implementó nada.
- **Instantáneas:** `/instantaneas` es maqueta local sin red; el concepto correcto es "Instants" (Instagram), not stories.
- **Reasignación de pulsera:** ya existe desde Staff (`POST /api/staff/reassign`, handoff §32) y usa `Pulse.replacesId`.
- **Programa, Comida, Recursos, notificaciones, "Ahora" y los beneficios de los paquetes:** contenido fijo de prueba.
- **Se pueden borrar (ya no los usa nadie):** `src/data/churches.ts` y `src/context/AuthContext.tsx`
  ⚠️ el segundo tiene contraseñas de demo en texto plano; está muerto, pero borrarlo es limpieza pendiente de tu OK.

### ⚠️ Drift de esquema: `age` vs `ageRange` (NO corregir)
`arraigados-app` **no usa Prisma**: habla con Neon por SQL crudo (`pg`). Pero en el
Next.js hay **dos `schema.prisma` distintos** y el que describe la base real es
`Projects\Arraigados\prisma\schema.prisma`; el de la raíz de `Projects\` está
**desfasado** (define `Attendee.age` obligatorio y no conoce `ageRange`).

La app escribe y lee **`ageRange`** (`server/attendee.ts:104,150`); `age` existe en la
base pero es nullable y solo se conserva por historial.

⇒ **Al escribir SQL nuevo, no copies nombres de columna de `Projects\prisma\schema.prisma`.**
⇒ **No se corrige automáticamente:** tocar schema o migraciones requiere tu aprobación explícita.

### Errores de contenido conocidos
- [ ] Programa dice "VIE 17 / SÁB 18", pero el 17 es **sábado** y el 18 **domingo**.
- [ ] Las notificaciones de Inicio mencionan "Auditorio Principal" y "Recepción Norte", que no son las sedes reales.
- [ ] La lista de iglesias es de relleno; falta el listado oficial (unos 27 presbiterios y 120 iglesias).
- [x] ~~El avatar con foto está fijo~~ → reemplazado por Blobatar (1 oct 2026).
- [ ] `server/auth.ts` dice "máximo 72 caracteres" pero mide **bytes** (confuso con `ñ`/emoji).

### Limpieza pendiente
- [ ] Borrar código y assets sin uso: `components/Wallpaper.tsx`, `assets/brand/logo.png`, `flyer-bg*.webp` y `flyer-shapes.webp`.
- [ ] Excluir los archivos que genera `tsc -b` (`vite.config.js`, `vite.config.d.ts`, `*.tsbuildinfo`) y también `dev.log`.
- [ ] Optimizar los SVG pesados con svgo (`Cita_*.svg` pesa unos 348 KB cada uno).
- [ ] Revisar las licencias de las fuentes demo y test (Degular, Pressio, Antarctican) y confirmar que incluyen acentos y ñ.
- [ ] Quitar el recuadro "Datos de prueba" del Login antes de producción.
- [ ] Hay 6 lotes de prueba `TEST-*` en Neon. `npm run db:limpiar-pruebas` los borra **junto con el lote real y los 4 asistentes**: decidir antes.

## Lo que ya no está planeado (estaba en un borrador viejo)

Esta lista estaba como "alcance planeado" y **ya se hizo casi todo**. Se conserva solo
lo que sigue pendiente:

1. ~~**Pulseras y QR:** crear lotes desde el admin y exportar para imprimir~~ — hecho en la Etapa 3 (`/admin/lotes`).
2. **Reasignación de pulsera** por pérdida o daño, dejando la anterior `INVALIDATED` — sin etapa asignada.
3. **Funciones por paquete** (A: botella de agua y ruleta · B: bote, 3 aguas frescas y rifa categoría 2 ·
   C: bote, tote bag y rifa especial categoría 3) — validar contra los paquetes reales de Neon.
4. **"Ahora" administrable** y programa real.
5. **Contenido:** menú de Salmos Café, merch, galería y descarga real de recursos y presentaciones.

> El detalle completo de arquitectura, rutas, auditoría del código y el análisis previo
> de Lotes está en **[`docs/CLAUDE_HANDOFF.md`](docs/CLAUDE_HANDOFF.md)**.
> Empieza por su §0 (qué funciona, qué es maqueta y qué no existe) y §28 (Lotes).
