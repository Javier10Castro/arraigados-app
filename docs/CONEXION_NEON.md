# Conexión a Neon

**Decisión (1 oct 2026):** el backend de Arraigados App usa **`pg` (node-postgres)** con la
conexión **pooler** de Neon, desde Netlify Functions. No se usa `@neondatabase/serverless`:
su ventaja es para entornos *edge* sin conexiones TCP, que no usamos, y `pg` ya está probado
con las operaciones críticas.

## Dónde está

| Archivo | Para qué |
|---|---|
| `server/db.ts` | Conexión de la app (funciones `/api/*`): pool, `query`, `withTransaction`, `newId`, `NOW_UTC` |
| `scripts/_db.mjs` | Conexión de los scripts de mantenimiento (`npm run db:*`) |
| `.env` → `DATABASE_URL` | La cadena de conexión (misma base que el Next.js). Nunca se sube ni se comparte |

## Cómo está configurada

- **Cadena:** se usa la `DATABASE_URL` del Next.js tal cual (host `…-pooler…neon.tech`). Antes
  de conectar se quitan los parámetros que solo entiende Prisma (`schema`, `pgbouncer`,
  `connection_limit`, …) y `sslmode`/`channel_binding`.
- **SSL:** explícito, con verificación completa del certificado (`rejectUnauthorized: true`).
  Para una base local de pruebas (`localhost`) no se usa SSL.
- **Pool por función:** máximo 3 conexiones, se liberan tras 10 s inactivas; espera de
  conexión de hasta 15 s (el plan gratuito de Neon "duerme" y el primer intento tarda).
- **Transacciones:** `withTransaction()` abre `BEGIN`, ejecuta y hace `COMMIT`; ante cualquier
  error hace `ROLLBACK` completo. Funciona igual con el pooler de Neon porque cada
  transacción usa una sola conexión de principio a fin.

## Reglas de compatibilidad con los datos (Prisma / Next.js)

- **No se crean ni alteran tablas** desde la app: solo `SELECT` / `INSERT` / `UPDATE` sobre el esquema existente.
- **`id`:** Prisma lo genera en su cliente (cuid); la base no tiene default. La app lo genera con
  `newId()` (25 caracteres, empieza con `c`, aleatorio de CSPRNG).
- **`updatedAt`:** igual, la base no tiene default; la app lo llena en cada INSERT/UPDATE.
- **Fechas en UTC:** Prisma guarda UTC en columnas sin zona; la app usa `NOW_UTC`
  (`now() AT TIME ZONE 'utc'`), nunca `now()` a secas.

## Operaciones transaccionales (y cómo se protegen)

| Operación | Archivo | Protección |
|---|---|---|
| Reclamar pulsera | `server/attendee.ts` → `claimPulse` | Transacción: crea `Attendee` + `UPDATE … WHERE status='UNCLAIMED'`; si no afecta fila, se deshace todo. Índice único parcial de Neon: una pulsera activa por asistente |
| Canjear agua fresca | `server/staff.ts` → `redeemOne` | `idempotencyKey` único (doble toque / reintento); transacción con `UPDATE … WHERE drinksUsed + 1 <= includedDrinks` + `INSERT Redemption` con `createdById` del Staff |

## Pruebas realizadas (contra una copia local del esquema de Neon)

Copia creada con las **mismas migraciones** del proyecto Next.js (`prisma/migrations`), con
109 iglesias, los 3 paquetes y pulseras de prueba. Última corrida: 1 oct 2026, con el código
actual y la cadena con `sslmode` incluida.

- 8 reclamos simultáneos de la misma pulsera → **1 gana**, sin asistentes duplicados.
- Rango de edad o iglesia inválidos → rechazados; código `AR26-…` no sirve como acceso público.
- Login: contraseña incorrecta, cuenta inexistente o desactivada → no entra; cookie alterada → rechazada; cuenta desactivada con sesión abierta → pierde acceso.
- Canje: el mismo toque repetido y 6 toques simultáneos con la misma llave → **se descuenta 1**.
- 5 canjes simultáneos con llaves distintas y saldo 1 → **pasa 1**; `createdById` = Staff; `location` vacío.
- Respaldo → limpieza → restauración: base idéntica fila por fila.

> Los scripts de estas pruebas se corrieron en el entorno de desarrollo de Claude, no están
> dentro del proyecto. Si se quieren correr en tu computadora, hay que agregarlos junto con una
> base de pruebas (una rama `desarrollo` de Neon o un Postgres local).
