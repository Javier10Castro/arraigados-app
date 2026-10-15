# Límite de frecuencia (rate limiting)

Guía técnica y operativa de la protección contra abuso de la API. Código: [`server/rateLimit.ts`](../server/rateLimit.ts) · tabla: [`migrations/011_rate_limit.sql`](../migrations/011_rate_limit.sql) · pruebas: [`tests/rate-limit/`](../tests/rate-limit/) (`npm run test:ratelimit`).

> **Estado:** implementado y probado **en local** (PostgreSQL 16 real y desechable + mocks). **No** se ha probado contra Neon ni contra Netlify. La migración 011 **no está aplicada** en ninguna base. Los puntos sin verificar están en §12.

---

## 1. Qué problema resuelve

Antes de este cambio **ninguna ruta tenía límite** (solo el enfriamiento de guardado de perfil, §7.4 del README). Riesgos encontrados:

| # | Riesgo | Dónde |
|---|---|---|
| R1 | Fuerza bruta de contraseñas y consumo de CPU (bcrypt costo 12) sin tope | `POST /api/auth/login` |
| R2 | Adivinar la contraseña actual desde una sesión robada | `POST /api/auth/password` |
| R3 | Adivinar tokens de pulsera / inundar la base con consultas | `/api/pulse/:token`, `/api/claim`, rutas con `x-pulse-token` |
| R4 | Adivinar códigos manuales (`AR26-XXXXX`, ~28 millones) con una cuenta de Staff | `/api/staff/pulse` |
| R5 | Automatizar canjes (el saldo ya estaba protegido por transacción; faltaba frenar la ráfaga) | `/api/staff/redeem` |
| R6 | Operaciones caras o con servicio externo sin tope: export, PDF de lote, búsqueda en Openverse, subida de fotos | rutas Admin y `PUT /api/profile` |
| R7 | Inundación de cualquier ruta con una sesión válida | todo `/api/*` protegido |

El límite **no sustituye** nada de lo existente: autenticación, autorización por rol, `idempotencyKey` y `UPDATE` condicional del canje, validaciones de la foto (tipo, tamaño, dimensiones, JPEG real) y firma de las URLs de foto siguen igual y se siguen probando.

## 2. Arquitectura

**Almacén: tabla `RateLimit` en Neon.** Es lo único compartido y ya configurado en el proyecto. Las Netlify Functions son efímeras y hay varias instancias a la vez, así que un `Map` en memoria **no** serviría (cada instancia contaría por su lado). Redis/KV u otro servicio externo requeriría credenciales y cuentas que hoy no existen. Netlify Blobs no ofrece un incremento atómico simple (habría que armarlo con escrituras condicionales y reintentos: más frágil que un `UPSERT`).

- **Una fila por clave, no por solicitud:** `key` (regla + huella), `count`, `resetAt`.
- **Un solo `INSERT … ON CONFLICT DO UPDATE` atómico** por llamada, con todas las claves de la solicitud a la vez y en orden fijo (sin interbloqueos). Dos instancias nunca pierden una cuenta.
- **Ventana fija.** Cuando pasa `resetAt` el contador vuelve a 1 solo. El reloj es el de la base (no el de cada función). Insistir mientras se está bloqueado **no alarga** la espera. Limitación: en el borde de una ventana se puede llegar a ~2× el límite en un instante.
- **Privacidad:** las claves son `HMAC-SHA256(SESSION_SECRET, …)` de la IP, el correo normalizado, el token de pulsera o el id de cuenta (32 hex). La base **no** guarda IP, correos, contraseñas ni tokens en claro. Cambiar `SESSION_SECRET` reinicia los contadores (efecto secundario inofensivo).
- **Limpieza:** 1 de cada 100 llamadas borra (máx. 1000) filas vencidas hace más de 10 min. La tabla se mantiene pequeña: una fila por identidad activa en las últimas ventanas.
- **Costo:** +1 consulta a Neon por solicitud limitada (las lecturas públicas baratas y las imágenes no pagan nada, §6). No medido contra Neon; local: ~1 ms por consulta.
- Sin variables de entorno nuevas ni dependencias nuevas. Usa `DATABASE_URL` y `SESSION_SECRET` (ya obligatorias).

**IP del cliente.** Solo `context.ip` de Netlify (en el runtime instalado sale de la cabecera `x-nf-client-connection-ip`). **Nunca** se leen `X-Forwarded-For`, `X-Real-IP`, `Forwarded` ni ninguna otra cabecera del cliente (hay pruebas con cabeceras falsificadas). IPv6 se agrupa por `/64`; IPv4 mapeada se reduce a IPv4; sin IP válida se usa un cubo compartido `sin-ip`. *Falta verificar en un despliegue real que Netlify sobrescribe siempre esa cabecera (§12).*

**El recinto comparte una sola IP.** Toda la Wi‑Fi del congreso saldrá con la misma IP pública. Por eso los límites por IP de las rutas de asistentes **no cuentan volumen**, cuentan **fallos** (pulseras o tokens inexistentes) con umbrales altos; el límite estricto se aplica por pulsera, por cuenta o por pareja correo+IP.

## 3. Orden de verificación

1. **Autenticar** (cookie válida / token con formato válido). Sin credencial válida: 401 sin tocar la base de contadores.
2. **Autorizar** (rol). Rol insuficiente: 403 sin gastar cuota.
3. **Gastar cuota** (`staff_base` dentro de `authorize()`, y la regla específica de la ruta).
4. Ejecutar la operación (con sus validaciones y transacciones).

Excepciones deliberadas: el **login** gasta cuota *antes* de verificar la contraseña (justo lo que se quiere frenar, y bcrypt es caro) y la devuelve si el acceso es correcto; el **registro** y las consultas de pulsera cuentan los fallos *después* de ver el resultado.

## 4. Políticas

Fuente única: `RULES` en `server/rateLimit.ts`. «Fallo» = qué pasa si el almacén no responde (§8).

### Staff y Admin (cookie)

| Regla | Límite | Clave | Fallo | Por qué |
|---|---|---|---|---|
| `login_pair` | 5 / 15 min | correo + IP | cerrado | Fuerza bruta clásica. Un atacante bloquea **su** par, no la IP de la víctima. |
| `login_ip` | 40 / 15 min | IP | cerrado | Una IP probando muchas cuentas. Holgado: el Staff comparte Wi‑Fi y los accesos correctos se devuelven. |
| `login_id` | 20 / 15 min | correo | cerrado | Una cuenta atacada desde muchas IP. *Compromiso:* un atacante distribuido puede bloquear el login de esa cuenta ≤15 min (§11). |
| `pwd_user` | 5 / 15 min | cuenta | cerrado | Adivinar la contraseña actual. Solo cuenta ese fallo (errores en la contraseña nueva se devuelven). |
| `staff_base` | 600 / min | cuenta | abierto | Tope general de toda ruta protegida (R7). 10/s por persona. |
| `staff_lookup` | 120 / min | cuenta | abierto | Escanear / buscar pulseras. |
| `staff_miss` | 40 / 10 min | cuenta | abierto | Códigos manuales inexistentes (R4). Los válidos no cuentan. |
| `staff_redeem` | 90 / min | cuenta | cerrado | Canjes: ~1.5/s sostenido, muy por encima de una barra real. |
| `redeem_pulse` | 15 / min | pulsera | cerrado | Ráfagas sobre una misma pulsera. El saldo y los dobles toques los sigue resolviendo la transacción. |
| `staff_reassign` | 20 / 10 min | cuenta | cerrado | Reemplazo de pulsera. |
| `admin_heavy` | 12 / 10 min | cuenta | cerrado | Exportar dashboard, PDF de lote, crear lote. |
| `admin_imgsearch` | 30 / 10 min | cuenta | cerrado | Búsqueda en Openverse (servicio externo). |
| `admin_user_w` | 20 / 10 min | cuenta | cerrado | Crear/editar/borrar cuentas, restablecer contraseñas. |
| `admin_danger` | 20 / 10 min | cuenta | cerrado | Vaciar bitácora, borrar lote, desvincular pulsera, anular canje. |

### Públicas (sin sesión)

| Regla | Límite | Clave | Fallo | Por qué |
|---|---|---|---|---|
| `claim_ip` | 1200 / 10 min | IP | cerrado | Volumen de registros. Holgado: ~2/s con todo el recinto en una IP. Registrar exige un token válido sin reclamar. |
| `claim_token` | 15 / 10 min | pulsera | abierto | Reintentos legítimos (errores de captura) sobre la misma pulsera. |
| `tok_miss_ip` | 200 / 10 min | IP | abierto | Solo **pulseras inexistentes** (`not_found`) en `/api/claim` y `/api/pulse`. Escanear pulseras válidas no gasta nada. |

### Asistente (`x-pulse-token`, por pulsera)

| Regla | Límite | Rutas |
|---|---|---|
| `att_me` | 60 / min | `GET /api/me` |
| `att_profile_r` | 60 / min | `GET /api/profile` |
| `att_profile_w` | 10 / 10 min | `PUT /api/profile` (además del enfriamiento propio de 10 s con foto / 2 s sin ella) |
| `att_photo` | 5 / 10 min (cerrado) | `PUT /api/profile` **con** archivo; se consulta antes de procesar la foto |
| `att_profiles` | 30 / min | `POST /api/profiles` (como asistente; el Staff usa `staff_base`) |
| `att_notes_r` · `att_note_w` | 30 / min · 10 / 10 min | `GET` · `POST`/`DELETE /api/notes` |
| `att_feed` · `att_notif` · `att_likers` | 30 / min | `/api/notes/feed` · `/api/notifications` · `/api/notes/likers` |
| `att_like` · `att_seen` | 40 / min · 20 / min | `POST /api/notes/:id/like` · `POST /api/notifications/seen` |
| `bad_token_ip` | 600 / 10 min | **Consulta** (no suma) en cada ruta del asistente; suma un fallo cuando la ruta responde 401 a un token con formato válido pero inexistente. Alto a propósito: el recinto comparte IP. |

Las lecturas periódicas de la app (notas, avisos) ocurren cada 60 s, es decir 1/min frente a 30/min permitidos.

Un token con **formato inválido** no gasta cuota ni crea filas (la ruta responde 401 sin tocar la base).

## 5. Respuestas

**429** — mismo formato de error de la API, `code: "rate_limited"`:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 840
RateLimit-Limit: 5
RateLimit-Remaining: 0
RateLimit-Reset: 840
RateLimit-Policy: 5;w=900
{ "error": "Demasiados intentos de inicio de sesión. Espera 14 min e inténtalo de nuevo.", "code": "rate_limited" }
```

`Retry-After` va en segundos (el mensaje lo muestra en s o min). El login responde **igual** exista o no la cuenta. La app ya muestra `error` en pantalla y **no** olvida la pulsera ante un 429 (solo lo hace con 401).

**503** — `{ "error": "Servicio temporalmente no disponible…", "code": "rate_limit_unavailable" }` + `Retry-After: 5`, solo cuando falla el almacén en reglas «cerradas».

## 6. Rutas: protegidas y excluidas

| Grupo | Rutas | Política |
|---|---|---|
| Login y sesión | `POST /api/auth/login` | `login_pair` + `login_ip` + `login_id` |
|  | `POST /api/auth/password` | `staff_base` + `pwd_user` |
|  | `GET /api/auth/me` | `staff_base` |
|  | `POST /api/auth/logout` | **Excluida:** sin credencial ni consulta a la base. |
| Registro y pulseras | `POST /api/claim` | `claim_ip` + `claim_token` + `tok_miss_ip` |
|  | `GET /api/pulse/:token` | `tok_miss_ip` (solo fallos) |
| Asistente | `/api/me`, `/api/profile`, `/api/profiles`, `/api/notes`, `/api/notes/feed`, `/api/notes/:id/like`, `/api/notes/likers`, `/api/notifications`, `/api/notifications/seen` | reglas `att_*` (§4) + consulta de `bad_token_ip` |
| Staff | `GET /api/staff/search` | `staff_base` + `staff_lookup` |
|  | `GET /api/staff/pulse` | `staff_base` + `staff_lookup` + `staff_miss` |
|  | `POST /api/staff/redeem` | `staff_base` + `staff_redeem` + `redeem_pulse` |
|  | `POST /api/staff/reassign` | `staff_base` + `staff_reassign` |
|  | `GET /api/staff/history` | `staff_base` |
| Admin pesado o destructivo | `GET /api/admin/dashboard/export`, `POST /api/admin/batches`, `GET /api/admin/batches/:id/pdf` | `staff_base` + `admin_heavy` |
|  | `POST /api/admin/dish-image-search` | `staff_base` + `admin_imgsearch` |
|  | `POST/PATCH/DELETE /api/admin/users…` (incluye `/password`) | `staff_base` + `admin_user_w` |
|  | `DELETE /api/admin/audit`, `DELETE /api/admin/batches/:id`, `POST /api/admin/pulses/:id/release`, `POST /api/admin/redemptions/:id/void` | `staff_base` + `admin_danger` |
| Resto de `/api/admin/*` | listas, dashboard, asistentes (incl. quitar foto de perfil), canjes, notas, avisos, iglesias, beneficios, kits, palabras bloqueadas, ajustes, menú y mercancía (altas/cambios) | `staff_base` (Admin autenticado; el volumen de escritura es bajo) |
| Públicas de solo lectura | `GET /api/churches`, `/api/packages`, `/api/settings`, `/api/menu`, `/api/merch` | **Excluidas a propósito**, ver abajo |
| Imágenes | `GET /api/dish-image/:key`, `/api/merch-image/:key` | **Excluidas:** solo leen Blobs, caché `immutable`. |
|  | `GET /api/profile-photo/:key` | **Excluida:** exige firma HMAC válida antes de tocar el almacenamiento; sin firma → 403 sin costo. |

**Por qué no se limitan las lecturas públicas.** Devuelven datos no personales, sin efectos secundarios, y *todos* los asistentes las piden a la vez (la app recarga `/api/settings` al volver a primer plano). Con toda la Wi‑Fi en una IP, cualquier tope por IP lo bastante bajo para frenar a alguien **bloquearía la app de todo el recinto**, y uno lo bastante alto no frena nada útil. La defensa adecuada es la caché (`Cache-Control`/CDN) y la protección de plataforma de Netlify, no un contador. *Decisión pendiente (§11).*

## 7. Scripts y servicios externos

Los scripts `npm run db:*` los corre una persona en su equipo; no pasan por la API. El único servicio externo que invoca la API es Openverse (`admin_imgsearch`). `db:respaldo-total` y `db:fotos-huerfanas` usan la API de Netlify solo con credenciales locales del `.env` (no se versionan).

## 8. Qué pasa si falla el límite

| Situación | Reglas «cerradas» (login, contraseña, registro, canje, reemplazo, admin pesado, subir foto) | Reglas «abiertas» (lecturas, escritura ligera) |
|---|---|---|
| **Tabla `RateLimit` no existe** (migración 011 sin aplicar) | **Deja pasar** y registra `[ratelimit] la tabla "RateLimit" no existe…` (1 línea/min por instancia). Es el único caso «abierto» de las sensibles: desplegar antes de migrar no tumba el login, pero **no hay límite** hasta migrar. | Igual |
| Error de conexión / tiempo agotado (8 s) | **503** + `Retry-After: 5`. La operación **no** se ejecuta. | Deja pasar y registra |
| Neon caído | Todo falla igual (las rutas también necesitan la base) | Igual |

Los logs dicen `[ratelimit] fallo del almacén: <mensaje>` y **nunca** incluyen claves, IP, correos, tokens ni contraseñas (hay pruebas).

## 9. Operación

Ver contadores (solo lectura; las claves son huellas, no se pueden leer):

```sql
SELECT split_part("key", ':', 1) AS regla, count(*) AS claves, max("count") AS maximo
FROM "RateLimit" WHERE "resetAt" > now() GROUP BY 1 ORDER BY 2 DESC;
```

**Desbloquear** a alguien (p. ej. el Staff se equivocó 5 veces en el recinto): esperar ≤15 min, o reiniciar contadores de login:

```sql
DELETE FROM "RateLimit" WHERE "key" LIKE 'login\_%';
```

Reinicia **todos** los contadores de login (no se puede filtrar por persona porque la clave es una huella). Es seguro: solo reinicia conteos. Para reiniciar todo: `DELETE FROM "RateLimit";`. *Estas consultas las ejecuta una persona autorizada; no hay script ni endpoint.*

**Cambiar un límite:** editar `RULES` en `server/rateLimit.ts`, actualizar esta guía y correr `npm run test:ratelimit` (algunas pruebas fijan los números actuales). Las filas existentes conservan su ventana hasta vencer.

## 10. Probar en local

Pruebas automáticas (sin servicios externos; usan una base PostgreSQL **desechable en tu equipo**):

```
docker run --name arr-test-pg -e POSTGRES_PASSWORD=postgres -p 54329:5432 -d postgres:16
docker exec arr-test-pg psql -U postgres -c "CREATE DATABASE arraigados_test"   # espera unos segundos a que arranque el contenedor
$env:TEST_DATABASE_URL = "postgres://postgres:postgres@127.0.0.1:54329/arraigados_test"
npm run test:ratelimit
```

(PowerShell, un comando por línea.) Sin `TEST_DATABASE_URL` solo corren las unitarias. El script **se niega** a ejecutarse si el host no es `localhost` o si la base no empieza con `arraigados_test`, porque **borra y recrea** el esquema `public` de esa base. **Nunca** lo apuntes a Neon. `npm run test:ratelimit -- unit` corre solo las unitarias.

Prueba manual con `npm run dev` (requiere haber aplicado la 011 en **tu base de desarrollo**): intenta iniciar sesión 6 veces con una contraseña incorrecta; la sexta debe dar `429` con `Retry-After`. Nota: en local `context.ip` puede ser una IP de loopback o venir vacía (entonces se usa `sin-ip`); no es representativo de producción.

## 11. Decisiones pendientes de tu autorización

1. **Aplicar la migración 011** en una rama de Neon y luego en producción (§12). Hasta entonces no hay límite.
2. **Lecturas públicas** (§6): mantenerlas sin contador (recomendado) o añadir un tope muy alto por IP, sabiendo el riesgo de bloquear el recinto.
3. **`login_id` (20 / 15 min por correo):** frena ataques distribuidos pero permite bloquear 15 min el *login* de una cuenta concreta (p. ej. la del Admin). Alternativas: subirlo, o quitarlo y depender de `login_pair` + `login_ip`.
4. **Límites de Netlify (plataforma):** Netlify ofrece reglas de límite por IP en el `config` de cada función (todos los planes; 2 reglas por proyecto en Free/Starter/Personal, 5 en Pro; el bloqueo tarda hasta ~10 s en activarse; no documenta `Retry-After`). Sirve como primera barrera gruesa y complementaria, pero **no** reemplaza este módulo (no distingue cuentas, tokens ni pulseras). El tipo `Config` de `@netlify/functions` 2.8.2 instalado **no** incluye `rateLimit`; usarlo implicaría actualizar el paquete. No implementado.
5. **Fallo abierto** si falta la tabla (§8): aceptar, o hacer que el login falle cerrado también en ese caso (obliga a migrar *antes* de desplegar sin excepción).

## 12. Qué se probó y qué no

**Probado (local):** 29 pruebas unitarias + 38 de integración contra PostgreSQL 16 real (concurrencia con conexiones simultáneas, ventanas, `Retry-After`, aislamiento por identidad, cabeceras de IP falsificadas, login sin filtrar cuentas, registro de pulseras, canjes sin duplicados, subida y borrado de fotos, regresión de rutas Admin, fallo del almacén abierto/cerrado, tabla inexistente, privacidad de claves y logs). Se verificó con «mutaciones» (romper el código a propósito) que las pruebas detectan límites rotos.

**No probado:**
- **Neon** (latencia real, despertar del cómputo, endpoint *pooled* en modo transacción). El SQL usa solo sentencias sueltas parametrizadas, compatibles en principio; falta confirmarlo.
- **Netlify:** que `context.ip` sea la IP real y que la cabecera de origen no sea falsificable; despliegue; límites de tiempo de las funciones.
- Carga real del recinto (cientos de dispositivos), y la política con tráfico realista.
- La regla `claim_ip` (1200) no tiene prueba de volumen; solo se probaron `claim_token` y `tok_miss_ip`.
- Navegador/UI ante un 429 (se revisó el código del cliente, no se ejecutó la UI).

## 13. Antes de desplegar

1. Rama de Neon (copia de producción). `npm run db:migrar` apunta a **la base de tu `.env`**: confirma que es la rama, no producción.
2. Aplicar la 011 en la rama (dos veces: debe ser idempotente) y verificar `\d "RateLimit"`.
3. Publicar la rama en un sitio de Netlify de prueba con `DATABASE_URL` de la rama y su propia `SESSION_SECRET`.
4. Probar: 6 logins fallidos → `429`; login correcto después de esperar; registro con una pulsera de prueba; canje; subir foto 6 veces.
5. Confirmar en los logs de Netlify que **no** aparece `[ratelimit] la tabla … no existe` ni `fallo del almacén`.
6. **IP real:** desde el sitio de prueba, enviar una petición con `X-Forwarded-For` y `x-nf-client-connection-ip` inventadas y comprobar que el límite sigue contando por tu IP real (se ve en `SELECT count(*) FROM "RateLimit"` antes/después, cambiando de red).
7. Medir el tiempo de respuesta del login y de `/api/me` antes y después.
8. Solo entonces: aplicar la 011 en producción **antes** de desplegar el código, y revisar los logs durante el primer día.

## 14. Qué vigilar en Netlify y Neon

*Los paneles exactos dependen de tu plan de Netlify; no verifiqué cuáles ofrece.* Con los logs de cada función:

- Buscar `[ratelimit] la tabla "RateLimit" no existe` → migración pendiente (**sin protección**).
- Buscar `[ratelimit] fallo del almacén` → Neon lento o caído; coincide con 503 `rate_limit_unavailable`.
- Aumento súbito de respuestas **429** en `auth-login` (ataque o Staff atascado) o en `claim`/`pulse` (alguien probando pulseras).
- Respuestas **503** en login/canje durante el evento (impacto directo).
- En Neon: conexiones activas, consultas lentas sobre `"RateLimit"`, uso de cómputo.

## 15. Riesgos residuales

- Ventana fija: ráfagas de hasta ~2× el límite en el cambio de ventana.
- Un atacante **dentro del recinto** comparte IP con todos: puede agotar `tok_miss_ip` (200 pulseras inexistentes en 10 min) y frenar registros ≤10 min. Se desbloquea con `DELETE FROM "RateLimit" WHERE "key" LIKE 'tok\_miss\_ip:%'`.
- `login_id` permite bloquear el login de una cuenta ≤15 min (§11).
- Sin la tabla, no hay límite (§8).
- El límite añade una consulta por solicitud protegida: el costo en Neon no está medido.
- No se limita el volumen de lecturas públicas ni de imágenes (§6).
