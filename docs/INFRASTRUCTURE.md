# Inventario de infraestructura — Arraigados 2K26

Documento de referencia técnica permanente. Pensado para que cualquier persona de
la Red Juvenil Tijuana que en el futuro administre, depure o migre este proyecto
pueda entenderlo sin depender de quien lo construyó. No contiene secretos.

Cada sección distingue:
- **CURRENT** — lo que existe y funciona hoy.
- **FUTURE** — lo que deberá existir cuando el proyecto pase a infraestructura oficial de la Red.
- **HISTORICAL** — lo que ya no se usa, pero se documenta como referencia/registro de decisiones.

---

## 1. Arquitectura actual

**CURRENT**
```text
Navegador del asistente / Staff / Admin
            │
            ▼
   Frontend (Vite + React + TypeScript) — archivos estáticos
            │
            ▼
          Netlify  (hosting + CDN)
            │  /api/* se enruta a:
            ▼
   Netlify Functions (netlify/functions/*.mts, Node)
            │  `pg` (node-postgres), pool de 3 conexiones
            ▼
      Neon PostgreSQL  (endpoint "pooled")
```
No hay backend separado ni contenedor propio: todo el "servidor" son las
Functions de Netlify, que ejecutan bajo demanda el código de `server/*.ts`.

## 2. Frontend

**CURRENT:** Vite + React 18 + TypeScript + React Router v6. Sin code-splitting
por ruta (un solo bundle para asistente, Staff y Admin). Build medido: JS ~715 KB
sin comprimir (~218 KB gzip), CSS ~131 KB (~25 KB gzip), imágenes del build
~226 KB. Algunas fuentes `.otf` y texturas de marca no resuelven en el build
(hueco conocido, pendiente de investigar, no bloquea el funcionamiento).

## 3. Netlify

**CURRENT:** sitio en la cuenta personal de Javier. Configuración 100% portable
en `netlify.toml` (build command, publish dir, Node 20, carpeta de funciones,
redirects SPA, headers de seguridad) — no depende de ningún ID ni nombre de sitio
específico; se corrigió durante esta auditoría la única línea que sí dependía de
una ruta de carpetas personal (`[dev].envFiles`).

**FUTURE:** sitio nuevo bajo un equipo/cuenta oficial de Netlify de la Red. El
`netlify.toml` se transporta sin cambios con el repositorio.

## 4. Netlify Functions

**CURRENT:** 26 funciones en `netlify/functions/*.mts`, todas en TypeScript,
compiladas con `esbuild` por Netlify. Cubren: registro/pulsera/beneficios
(público/asistente), búsqueda/canje/reasignación (Staff), dashboard/lotes/
usuarios/exportaciones (Admin). Timeout por defecto de Netlify Functions:
10 segundos — ya identificado como riesgo puntual (no de volumen) en la
generación de PDFs de lotes grandes.

## 5. Neon (base de datos)

**CURRENT:** un único proyecto Neon, creado originalmente para una app Next.js
hermana (ya **histórica**, ver sección 19) y usado también por esta app Vite.
Conexión vía el endpoint **pooled** (`-pooler`), con `pg` directo (sin ORM en
este proyecto). Pool de 3 conexiones por instancia de función
(`server/db.ts`). El esquema completo (tablas, columnas, índices) fue creado
originalmente por las migraciones de Prisma del proyecto Next.js; este repo solo
aporta una migración incremental propia: `migrations/001_batch_status.sql`. Esta
app **nunca crea ni altera tablas** — solo `SELECT`/`INSERT`/`UPDATE` sobre el
esquema existente.

> **Decisión confirmada (2 oct 2026):** dado que la app Next.js ya no se usará
> operativamente (ver §19 Histórico), **los datos actuales de este proyecto Neon
> se consideran parte del ecosistema de Arraigados 2K26**, salvo que el código
> demuestre explícitamente lo contrario. Este Neon seguirá usándose durante
> desarrollo/pruebas. No se migra nada todavía.

**FUTURE:** cuando se pase a infraestructura oficial, se creará un **proyecto
Neon oficial** bajo la cuenta de la Red, y se migrarán **únicamente los datos que
correspondan conservar** (ver §16 Política de datos de prueba y
`docs/MIGRATION_TO_RED.md`) — nunca una copia completa sin revisar.

## 6. Autenticación

**CURRENT:** dos sistemas, de naturaleza muy distinta:
- Asistentes: sin cuenta/contraseña — su "sesión" es el token QR de su pulsera.
- Staff/Admin: cuentas reales en la tabla `User` (Neon), contraseña con bcrypt,
  sesión = cookie HttpOnly firmada con `SESSION_SECRET` (HMAC-SHA256), revalidada
  contra Neon en cada request protegido. No usa ningún proveedor externo
  (no hay OAuth/Auth.js/Clerk).

**HISTORICAL:** existió un archivo `src/context/AuthContext.tsx` — un prototipo
de login puramente de cliente (localStorage), con usuarios de demostración y una
contraseña en texto plano. Se confirmó que no estaba importado por ningún otro
archivo (código muerto) y **fue eliminado** en la auditoría de seguridad del
2 oct 2026. *(Pendiente: el archivo se eliminó en la copia de trabajo, pero no se
pudo borrar directamente en la máquina del propietario por falta de acceso de
terminal remota en esta sesión — ver Pendientes del reporte de esa auditoría.)*

## 7. Variables de entorno

**CURRENT:** el proyecto completo usa exactamente **3** variables de entorno
(confirmado por búsqueda de `process.env.` en todo el código fuente):

| Variable | Obligatoria/Opcional | Para qué | Dónde se usa | Entorno |
|---|---|---|---|---|
| `DATABASE_URL` | Obligatoria | Conexión a Neon (endpoint pooled) | `server/db.ts` | Desarrollo y producción (valores distintos) |
| `SESSION_SECRET` | Obligatoria | Firma HMAC de las cookies de sesión de Staff/Admin | `server/auth.ts` | Desarrollo y producción (valores distintos — nunca reusar) |
| `PUBLIC_BASE_URL` | Opcional en desarrollo / Obligatoria en producción | Dominio con el que se arma el link de cada QR | `server/wristband.ts` | Vacía en desarrollo; dominio real en producción |

Los valores reales de estas variables se configuran **externamente en cada
entorno** (archivo `.env` local, o panel de *Environment variables* de Netlify en
producción) — nunca en el código ni en `.env.example`.

## 8. GitHub

**CURRENT:** repositorio en la cuenta personal `Javier10Castro`
(`github.com/Javier10Castro/arraigados-app`). **Permanece ahí por decisión
explícita del propietario** — no se migra todavía. El código y la configuración
(`netlify.toml`, `package.json`) no dependen de ese nombre de usuario en ningún
punto funcional (confirmado: no hay username hardcodeado en ningún archivo de
código o configuración, solo en documentación — ver §14).

**FUTURE:** el repositorio podrá transferirse a una cuenta/organización oficial
de GitHub de la Red Juvenil Tijuana (ver `docs/MIGRATION_TO_RED.md`).

## 9. Dominio

**CURRENT:** no existe un dominio definitivo. `PUBLIC_BASE_URL` es una variable
de entorno vacía en desarrollo; sin ella en producción la app simplemente no
genera QR (no inventa ni adivina un dominio).

> **Dominio oficial pendiente de definición/adquisición.**

**FUTURE:** cuando se compre, deberá quedar bajo el control/propiedad de la
organización Red Juvenil Tijuana (registrador, facturación, acceso DNS) — nunca
de una cuenta personal. El plan completo de corte de `localhost`/URL temporal al
dominio real ya está en `docs/PLAN_DOMINIO.md`.

## 10. Google Maps

**CURRENT:** dos enlaces públicos (`maps.app.goo.gl`) a las sedes del congreso
(12va y 21ra IAFCJ), centralizados en una sola constante (`VENUE_MAPS` en
`src/data/app.ts`) y referenciados desde ahí — sin duplicados en otras partes del
código. Son URLs públicas de Google Maps, no requieren cuenta ni API key, y por
lo tanto no están ligadas a ninguna cuenta personal.

## 11. Dependencias externas

**CURRENT:** además de Netlify y Neon, el proyecto usa Google Fonts (enlace
público en `index.html`, sin cuenta ni API key) y los dos enlaces de Google Maps
de arriba. **No se encontró ninguna integración** de: email/SMTP, OAuth,
analytics/tracking, ni almacenamiento externo de archivos. Dependencias de NPM:
ver `package.json` — todas son librerías públicas estándar (React, pdf-lib, xlsx,
html5-qrcode, bcryptjs, pg, etc.), ninguna atada a una cuenta de servicio.

## 12. Qué pertenece actualmente a Javier

- Repositorio de GitHub.
- Sitio de Netlify.
- Proyecto de Neon (compartido históricamente con la app Next.js — ver §19).
- El dominio, cuando se compre, **no debe** quedar en este punto (ver §9 Future).

## 13. Qué debería pertenecer eventualmente a Red Juvenil

- Repositorio de GitHub (transferencia u organización nueva).
- Cuenta/equipo de Netlify.
- Proyecto Neon oficial (nuevo, no el actual).
- Dominio (registrador + DNS).
- Cuentas de Staff/Admin creadas con correos oficiales de la Red.

## 14. Qué NO debe estar hardcodeado

Revisado explícitamente en esta auditoría — estado actual:

| Tipo | Estado |
|---|---|
| Credenciales/API keys/tokens en código | No se encontró ninguna (las 3 variables de entorno son las únicas) |
| Username de GitHub personal en código/config | No existe (solo aparece en 2 archivos `.md` de documentación, de forma documental/histórica) |
| Rutas de carpetas personales (`C:\Users\...`) en código/config | Ya corregido en `netlify.toml`; persiste solo en `docs/CLAUDE_HANDOFF.md` como nota histórica (marcada como tal) |
| IDs de proyecto Netlify/Neon hardcodeados | No se encontró ninguno |
| Contraseñas en texto plano | Existía una en código muerto (`AuthContext.tsx`, prototipo sin usar) — eliminado |
| Correos personales como configuración | No existen; los únicos correos en código son de demostración (`@redjuvenil.mx`), dentro del mismo archivo ya eliminado |

## 15. Separación entre desarrollo y producción

**CURRENT:** desarrollo y producción **comparten el mismo proyecto Neon** — no
hay separación por entorno todavía. La única separación existente es por
convención de nombres (lotes/datos de prueba con prefijo `TEST-*`).

**FUTURE:** `docs/PLAN_DOMINIO.md` ya recomienda separar con *branches* de Neon
(una rama `main` para producción, una `desarrollo` para local) — decisión
pendiente de ejecutar, no implementada todavía.

## 16. Política de datos de prueba

Ver sección dedicada **"Production Data Policy"** más abajo.

## 17. Política de migración

Ver `docs/MIGRATION_TO_RED.md` para el procedimiento completo. Principio rector:
**migración selectiva y verificada, nunca "copiar toda la base sin revisar".**

## 18. Proceso general de recuperación/rollback

- **Netlify:** *Deploys → Publish deploy* de una versión anterior revierte el
  sitio en segundos.
- **Neon:** mientras no se migre nada, el proyecto actual sigue siendo el único
  origen de datos — no hay nada que revertir todavía. Antes de cualquier cambio
  futuro que toque datos reales, se exige un respaldo (`npm run db:respaldo`) o
  una copia por *branch* de Neon.
- **Dominio/DNS:** el entorno personal no se apaga ni se modifica hasta confirmar
  que el entorno nuevo funciona end-to-end (detalle en `docs/MIGRATION_TO_RED.md`).

---

## 19. HISTORICAL — Aplicación Next.js anterior

> **Decisión confirmada (2 oct 2026):** la aplicación Next.js anterior queda
> considerada oficialmente **PROYECTO HISTÓRICO / REFERENCIA**. Ya no se
> utilizará como aplicación de producción ni como dependencia de Arraigados
> 2K26. La aplicación Vite + React actual es el sistema oficial del congreso.

Implicaciones de esta decisión:
- No es necesario mantener compatibilidad operativa con el Next.js.
- La migración a infraestructura de la Red **no** necesita diseñarse para que
  ambas apps sigan funcionando simultáneamente.
- No debe asumirse que el Next.js seguirá consumiendo el mismo Neon.
- El proyecto Next.js fue la base/referencia original de este sistema (de ahí
  vienen el esquema de Prisma y buena parte de las reglas de negocio que esta
  app replica en `server/*.ts`), pero su función operativa ya fue reemplazada.

No se borró ningún archivo ni repositorio del proyecto Next.js — sigue existiendo
como referencia histórica, simplemente no forma parte del plan de producción.

---

## Production Data Policy

El entorno de desarrollo (el Neon actual) puede contener, y de hecho contiene,
datos de prueba. Antes de la puesta en producción oficial debe hacerse una
**limpieza o migración selectiva** — nunca una copia automática de todo.

**Se conserva:**
- La información territorial oficial: Iglesias → Presbiterios → Zonas, y su
  jerarquía. Se considera oficial hasta nuevo aviso, pero **no permanente**: la
  lista de iglesias puede cambiar, y el sistema deberá poder actualizarla a
  partir de un Excel que proporcione el propietario (ver sección dedicada más
  abajo) — el código no debe asumir que la lista actual es definitiva.
- Los usuarios reales de operación (`User` con rol ADMIN/STAFF) que
  efectivamente se usarán: actualmente **Javier** y **Perla**. Cualquier otra
  cuenta de prueba/demo no se migra a producción.
- La configuración oficial de paquetes/beneficios del evento.

**NO se conserva (no debe pasar automáticamente a producción):**
- Asistentes de prueba, registros de prueba, pulseras de prueba, lotes de
  prueba, canjes de prueba, reasignaciones de prueba, y cualquier otro dato
  generado únicamente para testing.

Nada de esto se borra como parte de esta auditoría — es una política para
aplicarse en el momento de la migración real, documentada aquí para que quien
la ejecute sepa exactamente qué conservar y qué no.

---

## Actualización futura de iglesias/presbiterios/zonas mediante Excel

Requisito documentado para una etapa futura (no implementado todavía, no hay
especificación suficiente para hacerlo ahora):

- La lista oficial de iglesias puede cambiar; el código no debe asumir que la
  lista actual es permanente.
- La jerarquía Iglesia → Presbiterio → Zona debe mantenerse en cualquier
  actualización.
- Un futuro importador de Excel deberá validar duplicados, relaciones y
  consistencia antes de aplicar cambios.
- Una actualización de catálogo **no debe borrar accidentalmente** registros
  históricos de asistentes ya ligados a una iglesia existente.
- Antes de modificar datos territoriales en producción debe existir un respaldo.

Cuando el propietario proporcione el Excel definitivo, se diseñará el proceso
específico de importación/actualización — no antes.
