# Pulsera para Staff/Admin y autocanje (15 oct 2026)

**Estado: implementado y probado SOLO en PostgreSQL local. La migración `012_staff_selfredeem.sql` está PREPARADA y NO se ha aplicado en Neon. No hay commits, push ni deploy.**

## Qué hace
- Una cuenta Staff/Admin puede tener **una** pulsera propia, asignada **solo por un Admin** (Admin → Usuarios → Editar cuenta → «Pulsera propia»).
- Puede ver la experiencia de visitante (Inicio, Programa, Beneficios con el saldo real de su pulsera, Comida, Recursos, Más) con «Modo visitante» / «Entrar como visitante» y volver con «Volver a mi equipo» (ver «Vincular pulsera y vista de visitante»), **sin cerrar sesión ni crear otra cuenta**.
- **Autocanje** (escanear su propia pulsera): apagado por defecto. Dos interruptores globales (Admin → Configuración → «Autocanje de pulseras») y excepciones por persona (heredar / permitir / negar) que **solo la cuenta propietaria** puede cambiar.
- Que alguien no pueda autocanjearse **no** impide que otro miembro del equipo escanee su pulsera.

## Cómo se asocia pulsera ↔ cuenta
Tabla `"StaffPulse"` (userId, pulseId, linkedById, createdAt, unlinkedAt, unlinkedById). Vigente = `unlinkedAt IS NULL`; índices únicos parciales: una pulsera por cuenta y una cuenta por pulsera (también bajo concurrencia). La pulsera queda `ACTIVE` con `attendeeId = NULL`. **No se crea ningún Attendee.**
- Solo se vincula una pulsera `UNCLAIMED` sin asistente; nunca se toma la de un asistente ni la de otra cuenta.
- El registro normal (`claimPulse`: `WHERE status='UNCLAIMED'`) y el reemplazo de asistentes (`reassignPulse`) no pueden tomar una pulsera de equipo. Además dos **triggers** de la base lo impiden aunque otra ruta fallara.
- Desvincular/reemplazar deja la pulsera `INVALIDATED` y conserva el historial.

## Canjes (reutiliza `Redemption`)
`attendeeId` pasa a admitir NULL; columna nueva `beneficiaryUserId`; `CHECK redemption_one_beneficiary` (exactamente uno de los dos). Autocanje = `beneficiaryUserId = createdById` (se deriva, no hay bandera). Los canjes existentes y el flujo de asistentes no cambian. Anular un canje de equipo devuelve el saldo a la pulsera correcta. Los tableros de asistentes **no** cuentan pulseras ni consumo del equipo; los canjes de equipo aparecen en Admin → Canjes rotulados «Equipo».

## Cómo se calcula el permiso efectivo (siempre en el servidor, dentro de la transacción del canje)
1. Excepción individual (`SelfRedeemOverride`): `allow` / `deny` → manda.
2. Si no hay, interruptor global del rol de la sesión (`SelfRedeemSetting`).
3. Cualquier otra cosa (sin fila, error, tabla ausente, rol desconocido) → **denegado**.
Tablas propias, **no** `AuditLog` (el dueño puede vaciar la bitácora). Cambiar el global no borra excepciones. Cada cambio se audita (`selfredeem.global_update`, `selfredeem.override_set`, `staffpulse.link|replace|unlink`), sin tokens.

## Cuenta propietaria
`isOwnerEmail()` (`server/owner.ts`: variable `OWNER_EMAIL` o el valor por defecto del repositorio) evaluada **en el servidor sobre el usuario de la sesión cargado de la base**. El correo no se edita desde la app. Nuevo: ningún otro Admin puede restablecer su contraseña, desactivarla ni cambiarle el rol (antes sí podía).

### ⚠ OWNER_EMAIL NO está verificada
No se asume cuál es la configuración real. **Antes de desplegar:**
1. Entra como la cuenta que debe ser propietaria y abre `/api/auth/me` en el navegador: debe decir `"isOwner": true`. Entra como **otro** Admin: debe decir `false`.
2. En Netlify (Site configuration → Environment variables) **solo mira** si existe `OWNER_EMAIL` y su valor; no la cambies sin decidirlo.
3. Si ninguna cuenta resulta propietaria, o lo es la equivocada: **no despliegues**; sin propietaria las excepciones individuales quedan inaccesibles (falla cerrado: nadie puede cambiarlas).

## Aplicar en pruebas y luego en producción
Orden obligatorio: **migración primero, código después** (el código nuevo consulta columnas/tablas de la 012).
1. Rama de Neon o base de pruebas (nunca producción primero). `npm run db:respaldo-total` antes.
2. `npm run db:migrar -- --only 012_staff_selfredeem.sql` (NO `npm run db:migrar` a secas: aplicaría también la 011, aún pendiente de decisión). Verifica con `npm run db:esquema`.
3. Desplegar el código en pruebas y revisar: vincular una pulsera, canje por otro miembro, autocanje con interruptores, anulación.
4. Producción: respaldo → migración 012 → deploy.
**Reversión:** restaurar el deploy anterior en Netlify + `docs/rollback/012_staff_selfredeem_down.sql`. Se corre a mano con `psql "<cadena>" -v ON_ERROR_STOP=1 -f docs/rollback/012_staff_selfredeem_down.sql` y **aborta sin cambiar nada** si existe cualquiera de estos datos, para no perderlos:
- canjes de equipo (`Redemption.attendeeId` NULL) o vínculos (`StaffPulse`): no hay forma de saltarse esta guarda;
- excepciones por persona (`SelfRedeemOverride`) o interruptores activados/cambiados (`SelfRedeemSetting`): expórtalos primero (`\copy "SelfRedeemOverride" TO 'overrides.csv' CSV HEADER`) y, solo si decides continuar, confirma en la misma sesión con `SET arraigados.confirmo_perder_ajustes = 'si';`.
Es repetible (si ya se revirtió no falla). Probado en PostgreSQL local desechable con el esquema real de Neon y pulseras solo-QR (ver `tests/team-pulse`, bloque «migración 012»); **no** se ha probado contra Neon.

## Pruebas
`npm run test:team` (pulseras de equipo/autocanje, notas, descuentos y rifas) y `npm run test:ratelimit` (67, ahora con la 012 aplicada en su base). Requieren `TEST_DATABASE_URL` local `arraigados_test*`.
`node scripts/test-team.mjs --sin-011` repite las 124 con la base creada **sin** la migración 011: la 012 y el código no dependen de ella (el limitador queda inactivo y registra «[ratelimit] … no existe», sin fallar).

### Esquema de las pruebas (v5)
`tests/team-pulse/testdb.mts` reproduce el esquema REAL de Neon tal como lo mostró `npm run db:esquema` (16 oct 2026) para Batch, Pulse, Package, Attendee, User, Redemption y AuditLog: `Pulse.batchId` NOT NULL, ids y `updatedAt` sin DEFAULT, `Redemption.packageId` sin llave foránea, índice único `Pulse_replacesId_key`, CHECK de edad, de estado de lote y de bebidas, etc. Las pruebas incluyen pulseras **solo-QR** (`QRONLY:<token>`), que es como están las pulseras de Lotes en Neon. Sigue sin verificarse contra Neon: Zone/Presbytery/Church, la precisión de los timestamp, los valores de los enums y qué migraciones 002–010 están aplicadas (se consulta con un script de solo lectura entregado aparte, que no forma parte del paquete).

## «Vincular pulsera» y vista de visitante (16 oct 2026)
Fuente única de este tema. Ruta `/cuenta/pulsera` (cualquier cuenta del equipo con sesión; acceso desde el menú de Admin, «Más» del celular y la pantalla `/staff`). El estado sale SIEMPRE del servidor (`GET /api/staff-me`, tabla `StaffPulse`): persiste al cerrar sesión y entre dispositivos; no usa localStorage. No se agregó ninguna tabla ni migración para esto.

### 1. Cómo vincular una pulsera por QR (solo Admin)
1. Entra a `/cuenta/pulsera` → «Escanear pulsera» y apunta la cámara al QR de una pulsera **sin registrar** (el QR de cada pulsera está en `/admin/lotes/<lote>`). La interfaz **ya no ofrece escribir el código**; el servidor sigue aceptando el código interno `AR26-XXXXX` / `QRONLY:<token>` porque lo usan las pulseras existentes y el panel Admin → Usuarios.
2. La app lee el QR (acepta la URL `/p/<token>`, el token de 16 caracteres o el código interno), consulta la pulsera (`GET /api/staff/pulse`) y la vincula con la cuenta de **la propia sesión** (`POST /api/admin/staff-pulse`, `userId` = el de la sesión, nunca elegido por el usuario). Queda en AuditLog.
3. Un mismo QR leído varias veces seguidas se ignora durante 4 s y un doble toque no manda dos solicitudes (el escáner decodifica varias veces por segundo y esto agotaba el límite de frecuencia).

### 2. Qué pasa al vincular
La pantalla pasa a «Pulsera vinculada» con el paquete y las aguas restantes y dos acciones: **«Entrar como visitante»** y **«Volver a gestión»**. No hay que escanear otra pulsera ni volver a iniciar sesión.

### 3. Entrar a la vista visitante
- Desde esa pantalla: «Entrar como visitante» (va a `/home`).
- Admin: botón «Modo visitante» (flechas ⇄) en el menú lateral, en «Más» y en la tarjeta de cuenta. Staff: botón «Modo visitante» en `/staff` si ya tiene pulsera (si no, «Vincular pulsera» y «Ver mi experiencia de visitante»).
- Por dentro: `useTeamNav().toVisitor()` → `GET /api/staff-me` con la cookie del equipo. La vista es solo navegación; el servidor decide los permisos en cada llamada. En esta vista las **notas de los asistentes se ven en solo lectura** (`GET /api/notes/feed` sin `x-pulse-token` y con cookie del equipo; sin nota propia ni «me gusta»).

### 4. Regresar al panel de gestión
- Desde la vista visitante, con el **mismo botón de las dos flechas** que ya existía (sin botón duplicado): el texto depende del rol real de la sesión — **«Volver a Admin»** (→ `/admin`) o **«Volver a Staff»** (→ `/staff`) (`useTeamNav().backLabel`, `homeForRole`). También desde `/cuenta/pulsera` («Volver a gestión»). La pantalla de «pulsera sin vincular / deshabilitada» (`TeamViewGate`) conserva su botón «Volver a mi equipo».
- **Home de visitante = Home del asistente** (mismo `HomeV2` y misma animación de bienvenida). Se agrega «Mi gafete» a la navegación (barra, barra lateral y «Más») también para el equipo; el visor del gafete conserva girar, descargar imagen, QR y. **No** hay «Mi perfil» para el equipo.
- El QR del gafete del equipo es el de **su propia** pulsera: `GET /api/staff-me` devuelve `qrToken` (solo de la pulsera de la sesión; el servidor no acepta ningún id).
- **Sesión del equipo vencida** (cookie caducada o cuenta desactivada) mientras se está en la vista de visitante: la app limpia la bandera de visitante y manda a `/login` («Tu sesión del equipo caducó…»). Es solo navegación: no otorga privilegios; cada llamada se autoriza en el servidor.

### 5. Pulsera ya vinculada, deshabilitada, inválida o ajena
| Situación | Resultado |
|---|---|
| Tu cuenta ya tiene pulsera | Pantalla «Pulsera vinculada» (no pide escanear; el servidor además responde `user_has_pulse`). |
| La pulsera ya es de otra cuenta del equipo | «Esa pulsera ya está asignada a otra cuenta del equipo.» |
| Es de un asistente o ya está en uso | «Esa pulsera ya pertenece a un asistente o está en uso. Usa una pulsera nueva, sin registrar.» |
| Está deshabilitada (INVALIDATED) | «Esa pulsera está deshabilitada. Usa otra.» |
| No existe | «Esa pulsera no existe. Revisa el QR.» |
| El QR no es de Arraigados | «Ese QR no es de una pulsera de Arraigados.» (ni siquiera se consulta al servidor) |
| Tu pulsera vinculada fue deshabilitada | «Tu pulsera está deshabilitada»: solo un Admin la arregla en Usuarios. |
Una segunda ejecución nunca cambia la pulsera ni el saldo (índices únicos parciales y bloqueo de filas).

### 6. Permisos
| Acción | Admin | Staff |
|---|---|---|
| Vincular su propia pulsera por QR | Sí | No (403 del servidor); pide a un Admin que se la asigne |
| Asignar / reemplazar / desvincular la pulsera de una cuenta (Usuarios) | Sí | No |
| Entrar a la vista visitante y volver | Sí | Sí |
| Autocanje | Según interruptores (Configuración) y excepciones | Igual |
| Excepciones de autocanje por persona | Solo la cuenta propietaria | No |

### 7. Si la sesión caduca o falla el escáner
- Sesión del equipo caducada: «Entrar como visitante» manda a `/login` (`enterTeamView` devuelve `denied`); las rutas protegidas también redirigen a `/login` (estas sí recuerdan la página de origen). Una acción en curso muestra el mensaje de error del servidor («Inicia sesión.», 401).
- Cámara: sin HTTPS (excepto localhost) → «La cámara necesita una conexión segura (https)…»; permiso negado → «No diste permiso para usar la cámara…»; cámara ocupada → «No pudimos abrir la cámara…». Solución: dar permiso en el navegador, cerrar otras apps que usen la cámara o usar otro dispositivo.
- «Demasiadas solicitudes»: espera el tiempo indicado (el límite aplica por cuenta/IP, ver `RATE_LIMITING.md`).
- Si el escáner no funciona en ningún dispositivo, un Admin asigna la pulsera desde Admin → Usuarios → Editar cuenta → Pulsera propia (también por QR).

### 8. Evidencia de pruebas de este bloque
Automáticas (`npm run test:team`, PostgreSQL local): vinculación/rechazos, permisos Admin/Staff, notas de solo lectura del visitante y 401 con pulsera inválida. Navegador (Chromium con cámara simulada, base local desechable): escaneo QR, pantalla vinculada, entrar/volver, rechazo de pulsera de asistente y duplicado. **No** se probó en un teléfono real ni contra Neon. La captura de `MANUAL_ADMIN.pdf` no se regeneró (sigue describiendo el panel anterior; la fuente vigente es este documento).

## Prueba manual en navegador (reproducible, solo PostgreSQL local)
Nada de esto toca Neon. Usa una base LOCAL desechable; el script se niega a correr contra cualquier host que no sea `localhost`/`127.0.0.1` o una base que no se llame `arraigados_test*`, y no lee `.env` ni `DATABASE_URL`.

### 0. Preparación
1. Crea la base vacía: `createdb arraigados_test_manual` (o `CREATE DATABASE arraigados_test_manual;` desde psql).
2. Siembra (BORRA y recrea el esquema `public` de ESA base): define `MANUAL_DATABASE_URL=postgres://postgres:CLAVE@localhost:5432/arraigados_test_manual` y ejecuta `npm run test:manual:seed`. Imprime tres cuentas (propietario, admin, staff) y cuatro pulseras sin reclamar (`LOTE-MANUAL`).
3. Arranca la app apuntando a esa base, **sin** el `.env` de Neon: en una copia/carpeta sin `.env`, o con un `.env` temporal que solo tenga `DATABASE_URL` (la local), `SESSION_SECRET` (≥32 caracteres) y `OWNER_EMAIL=manual-owner@arraigados.local`. Luego `npm run dev` (o `npm run dev:vite` + funciones). Comprobación de seguridad: las cuentas `manual-*@arraigados.local` solo existen en la base local; si el login funciona, estás en la local. Si dudas, detente y revisa qué `DATABASE_URL` toma el proceso antes de continuar.
4. Usa ventanas de incógnito distintas (o perfiles) para cada cuenta: propietario, admin y staff no comparten cookie.

### 1. Asignar una pulsera (Admin)
1. Entra como **manual-admin** → `/admin/usuarios` → «Staff manual» → **Editar cuenta** → sección **Pulsera propia** → **Asignar pulsera** y escanea el QR de la pulsera `AR26-M2M2M` (`/p/MANUALPULSETOK01`; si no tienes cámara, puedes probar con la cámara simulada de Chromium y una imagen del QR).
2. Esperado: la cuenta muestra la pulsera vinculada y, en la sesión de Staff manual, `/staff` pasa de «Vincular pulsera · pendiente» a «✓ Pulsera vinculada». En `/admin/lotes` el lote `LOTE-MANUAL` muestra «1 del equipo»; en su detalle, el filtro **Equipo** lista esa pulsera y **Reclamadas** sigue en 0. `AR26-M2M2M` corresponde a `/p/MANUALPULSETOK01`; abrir esa URL en una pestaña sin sesión muestra «Esta pulsera está reservada»; no ofrece formulario de registro.
3. Repite con `AR26-M3M3M` (`/p/MANUALPULSETOK02`) para «Admin manual» (Admin ↔ Admin también cuenta como equipo) si quieres probar a un Admin.

### 2. Experiencia de visitante
1. Entra como **manual-staff** → `/staff` → **Ver mi experiencia de visitante**. Esperado: ves la vista de visitante con su pulsera (bebidas restantes del paquete); ves el carrusel de **notas** de los asistentes en solo lectura (sin nota propia ni me gusta); el Inicio abre con la animación del gafete y «Mi gafete» funciona igual que para un asistente (no hay Mi perfil).
2. Salir de la vista vuelve a `/staff` sin cerrar sesión.
3. Con una cuenta sin pulsera asignada (p. ej. quita la vinculación) se explica que no tiene pulsera; un Staff no puede vincular una por cuenta propia. Un Admin la vincula escaneando el QR en `/cuenta/pulsera`; al terminar (y siempre que ya esté vinculada) esa pantalla ofrece «Entrar como visitante» (va a `/home`) y «Volver a gestión» (`/admin` o `/staff` según el rol).

### 3. Los dos interruptores (Admin → Configuración)
1. Como **manual-owner** → `/admin/configuracion` → sección **Autocanje de pulseras**. Esperado inicial: ambos interruptores apagados («Permitir autocanje a Staff» y «a Admin»).
2. Como **manual-staff** intenta canjear tu propia pulsera (paso 5): esperado «El autocanje no está permitido para tu cuenta…» y NO se descuenta nada.
3. Enciende «Permitir autocanje a Staff». Repite: ahora se permite (paso 5). Apaga y verifica que vuelve a negarse. Haz lo mismo con el interruptor de Admin usando la pulsera de «Admin manual».
4. Como **manual-admin** (no propietario) el panel muestra los interruptores pero NO las excepciones por persona.

### 4. Excepción individual (solo propietario)
1. Con ambos interruptores apagados, como **manual-owner**, en «Excepciones por persona» pon a «Staff manual» en **Permitir**. Esperado: «Puede autocanjearse · por excepción». Staff puede autocanjearse aunque el interruptor del rol esté apagado.
2. Cámbialo a **Negar** con el interruptor de Staff encendido: queda negado (la excepción manda). **Heredar** vuelve a seguir el interruptor.
3. El propietario no puede ser degradado ni desactivado desde Usuarios (el servidor lo rechaza).

### 5. Registrar y anular un canje
1. Como **manual-admin**, en `/staff` escanea con la cámara el QR de la pulsera de «Staff manual» (el QR de cada pulsera se ve en `/admin/lotes/<lote>`). El código escrito a mano está oculto por `SHOW_MANUAL_CODE = false` en `src/pages/Staff.tsx`; si no tienes cámara, puedes ponerlo temporalmente en `true` **solo en tu copia local de pruebas y revertirlo**, y usar «Código AR26».
2. En el modal pulsa **Aceptar**: descuenta EXACTAMENTE 1. Esperado: «Mis canjes recientes» lo lista; las bebidas restantes bajan en 1.
3. Como **manual-owner** o admin → `/admin/canjes`: la fila muestra «Equipo». Pulsa **Anular**, escribe el motivo (obligatorio) y confirma. Esperado: el canje queda marcado como anulado (no se borra) y la bebida vuelve al saldo de la pulsera.
4. Autocanje: con el interruptor/excepción activo, entra como **manual-staff**, escanea tu propia pulsera → Aceptar → la fila en Canjes aparece como «Equipo · autocanje». Anúlala igual.
5. Registro normal bloqueado: en una pestaña sin sesión abre `/p/<token de una pulsera asignada>`: debe decir «reservada»; intentar `POST /api/claim` con ese token responde `{"outcome":"team"}` y no crea asistente.

### 6. Limpieza
Al terminar, borra el `.env` temporal y, si quieres, `DROP DATABASE arraigados_test_manual;`.

## Limitaciones conocidas
- Admin → Lotes separa las pulseras del equipo en su propia columna/filtro («Equipo»); no se suman a «Reclamadas» (asistentes). El tablero de asistentes no cambió.
- Detección de «equipo»: se decide por un vínculo vigente en `StaffPulse` (pulsera ACTIVE, sin asistente **y** con `unlinkedAt IS NULL`), no por «ACTIVE sin asistente». Una pulsera ACTIVE sin asistente ni vínculo (p. ej. su asistente se borró) NO se marca reservada: sigue `active` y `already_active` al reclamar (nunca se registra otra persona sobre ella). Sin la migración 012 la consulta se tolera (error 42P01 → «no es de equipo»).
- `/p/<token>` de una pulsera de equipo muestra «Esta pulsera está reservada» (`status: 'team'`, sin datos del miembro); `/api/claim` responde `team` y no crea asistente; `/api/me` la rechaza (no sirve como credencial).
- La vista de visitante del equipo es réplica del Inicio del asistente (animación del gafete, «Mi gafete» con su QR); solo cambia el botón extra **«Volver a Admin» / «Volver a Staff»** (menú lateral, «Más» y tarjeta de cuenta). No incluye Mi perfil (depende de la identidad de asistente). El QR del gafete usa el `qrToken` de SU pulsera, que `GET /api/staff-me` entrega solo a la cuenta dueña (cookie); un token de otra pulsera no se puede pedir. Las notas de los asistentes se muestran en solo lectura: `GET /api/notes/feed` sin `x-pulse-token` y con la cookie del equipo; no hay nota propia ni me gusta, y una pulsera enviada pero inválida sigue dando 401.
- El limitador de frecuencia sigue inactivo hasta aplicar la 011; los endpoints nuevos reutilizan `admin_user_w`.
- Reiniciar el navegador en la vista de visitante recuerda la vista solo en esa pestaña (`sessionStorage`); no concede nada: sin cookie válida `/api/staff-me` responde 401.
