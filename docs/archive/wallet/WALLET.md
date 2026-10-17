# Credencial digital en Apple Wallet y Google Wallet (16 oct 2026)

**Estado: implementado y probado SOLO de forma automática y con certificados/llaves de PRUEBA. NO está activado: faltan la cuenta de Apple Developer (Pass Type ID + certificado) y la cuenta de emisor de Google Wallet (+ cuenta de servicio). Mientras falten, el botón «Agregar a Wallet» NO aparece en la app (no se simula nada). No se ha agregado ningún pase a un teléfono real. Sin commit, push ni deploy; sin migraciones ni cambios en Neon.**

Fuente única para este tema (arquitectura, seguridad, configuración, pruebas). El resto de documentos solo enlazan aquí.

## 1. Qué hace
- Cada asistente (y cada cuenta Staff/Admin con pulsera vinculada) puede guardar su credencial de Arraigados 2K26 en el Wallet del teléfono, como un boleto: **«Agregar a Wallet»**.
- Es un pase real de Wallet (Apple `.pkpass` firmado / pase genérico de Google Wallet), no un PDF, una imagen ni una página.
- Dónde está el botón: **solo en «Mi gafete»** (Más → **Mi gafete**, o el botón «Mi gafete» del menú lateral en escritorio). Junto a «Girar» y «Descargar imagen» aparece **«Agregar a Apple Wallet»** o **«Agregar a Google Wallet»**. No está en Mi perfil ni en ninguna otra pantalla.
  - **Cuentas del equipo (Staff/Admin):** su vista de visitante ahora incluye «Mi gafete», así que tienen el mismo botón de Wallet (la identidad sale de la cookie del equipo; el pase es el de su pulsera asignada). Cambio del 16 oct 2026, compilado (`tsc -b`) pero no probado en navegador ni en teléfono.
- La app detecta el teléfono por el navegador: iPhone/iPad → «Agregar a Apple Wallet»; Android → «Agregar a Google Wallet»; cualquier otro (computadora o no identificado) → las opciones disponibles. Si la plataforma del teléfono no está configurada, simplemente no aparece su botón; nunca se bloquea nada más de la app.
- Si **ninguna** plataforma está configurada, no se dibuja ningún botón.

## 2. Contenido del pase (solo campos que ya existen en el modelo)
| Campo | Origen | Asistente | Equipo |
|---|---|---|---|
| Evento | constante (`server/wallet/event.ts`, igual que `/conocer`) | Arraigados 2K26 · Red Juvenil Tijuana | igual |
| Titular | `Attendee.fullName` / `User.name` | sí | sí |
| Iglesia | `Church.name` del asistente | sí (si tiene) | «Equipo» (no lleva iglesia) |
| Identificador público | derivado por HMAC del id de pulsera: `W26-XXXXXX` | sí | sí |
| QR | código firmado `AR26W1.<id de pulsera>.<firma>` (ver §3) | sí | sí |
| Fechas / sedes / cómo usarla | constantes del evento | sí (reverso en Apple) | igual |

**No** incluye: token privado de la pulsera, código de respaldo `AR26-XXXXX`, `QRONLY:…`, cookies o sesiones, correo, edad, zona/presbiterio, paquete ni saldo de aguas, ubicaciones ni «fecha relevante» (nada se muestra solo en la pantalla bloqueada). El nombre sí se ve en el frente del pase cuando el teléfono está desbloqueado y abierto en Wallet. Apple: `sharingProhibited: true`.

Logo: `src/assets/brand/logo.png` recolorizado en crema sobre el morado del congreso. Apple usa PNG embebidos en `server/wallet/assets.ts`; Google usa `public/wallet/logo.png` (URL pública `PUBLIC_BASE_URL/wallet/logo.png`). **Antes de publicar, sustituir los botones de texto por las insignias oficiales** «Add to Apple Wallet» / «Add to Google Wallet» según las guías de marca de cada proveedor (no se pudieron verificar aquí).

## 3. Seguridad del QR
- Valor: `AR26W1.<pulseId>.<firma>`; firma = HMAC-SHA256 (clave `WALLET_QR_SECRET`, distinta de `SESSION_SECRET`) truncada a 128 bits.
- **No** reutiliza el token privado de la pulsera (que es la credencial de sesión del asistente en `x-pulse-token`), ni cookies, ni el código de respaldo. `/api/me` rechaza el código del QR de Wallet como sesión (probado).
- **Es un identificador, no una autorización.** Staff lo escanea y el servidor valida en CADA lectura: firma válida **y** estado actual de la pulsera (`GET /api/staff/pulse?wallet=…`, solo con sesión de equipo). El canje sigue usando el mecanismo de siempre (`/api/staff/redeem` con el código que devuelve la consulta). Nada cambia en los QR de las pulseras impresas.
- Registro (`/registro`) y vinculación de pulsera **rechazan** el código de Wallet: solo el escáner de Staff lo acepta.
- Rotar `WALLET_QR_SECRET` invalida todos los QR ya emitidos (los pases hay que volver a agregarlos).
- Los ids de pulsera deben tener solo `A-Z a-z 0-9 _ -` (1–64). Si alguno tuviera otro carácter, ese pase no se emite (error genérico 500); los ids de Neon son tipo cuid, pero **no se inspeccionaron los reales** (solo los de las bases de prueba).

## 4. Arquitectura
```
Navegador (React)                 Netlify Function netlify/functions/wallet.mts              server/wallet/
 AddToWallet.tsx  ── GET /api/wallet/status ──────────────► {apple,google} (solo booleanos) config.ts
                  ── POST /api/wallet/apple-ticket ───────► {url:/api/wallet/apple?t=…}      code.ts (QR y boleto, HMAC)
                  ── GET  /api/wallet/apple?t=… ──────────► .pkpass (application/vnd.apple.pkpass)  apple.ts + pkcs7.ts + zip.ts
                  ── POST /api/wallet/google ─────────────► {url:https://pay.google.com/gp/v/save/<JWT>} google.ts
                                                            subject.ts: identidad → pulsera (Neon, solo lectura)
```
- **Identidad (siempre del servidor):** asistente = token de su pulsera (`x-pulse-token`) → su pulsera `ACTIVE` con asistente; equipo = cookie de sesión → su pulsera vinculada (`StaffPulse`) y `ACTIVE`, cuenta activa. **Ningún endpoint acepta ids de pulsera/asistente/cuenta del cliente**: nadie puede pedir la credencial de otra persona. Si llegan token y cookie, manda el token.
- **Apple:** Safari no puede mandar cabeceras en una navegación, así que el cliente pide un **boleto** (POST autenticado) con vigencia de 90 s, firmado por HMAC, que solo sirve para pedir el `.pkpass` de esa pulsera; el GET relee el estado actual de la pulsera antes de emitir. Un boleto reutilizado dentro de los 90 s produce el mismo pase del mismo dueño (no concede nada más).
- **Google:** el servidor firma un JWT RS256 con la llave de la cuenta de servicio; contiene clase + objeto genéricos. La llave **nunca** sale del servidor.
- **Apple y Google están separados** (`apple.ts` / `google.ts`) detrás de la misma interfaz de usuario y del mismo endpoint.
- **Sin dependencias nuevas** (PKCS#7 y ZIP implementados con `node:crypto`/`Buffer`, ver `pkcs7.ts`, `zip.ts`), **sin tablas, migraciones ni cambios de autenticación**, sin servicios externos en tiempo de ejecución. No se guarda nada: todo se deriva de tablas existentes.
- **Límite de frecuencia:** regla `wallet` (12 / 10 min, por pulsera o por cuenta, falla abierto). Ver `RATE_LIMITING.md`.

### Archivos
`server/wallet/{config,code,subject,apple,pkcs7,zip,google,event,assets}.ts` · `netlify/functions/wallet.mts` · `server/staff.ts` (`lookupPulse({wallet})`) + `netlify/functions/staff-pulse.mts` (`?wallet=`) · `src/components/wallet/AddToWallet.{tsx,module.css}` (variante `inline`) · `src/pages/homev2/{GafeteViewer,IntroExperience}.tsx` (ahí vive el botón) · `src/lib/walletPlatform.ts` · `src/lib/pulseCode.ts` (`parseStaffScan`) · `src/pages/Staff.tsx` · `src/components/RedeemModal.tsx` (tipo `PulseRef`) · `src/lib/api.ts` · `public/wallet/logo.png` · `server/rateLimit.ts` · `.env.example` · `tests/team-pulse/wallet.test.mts`.

## 5. Qué pasa cuando…
| Situación | Resultado |
|---|---|
| La pulsera se **reasigna / reemplaza / desvincula** (queda `INVALIDATED`) | El pase queda en el teléfono, pero su QR **deja de servir**: Staff lo ve como «deshabilitada». No se puede volver a emitir (el servidor responde 401/409). El pase del teléfono **no se actualiza ni se borra solo** (no hay notificaciones push de Apple ni actualización de objeto en Google). |
| La pulsera se reasigna a otra persona | El pase viejo apunta al id de la pulsera anterior (inválida); la nueva persona genera el suyo con su propia pulsera. |
| La cuenta del equipo pierde acceso (desactivada / sin pulsera vinculada) | No se emite pase nuevo (probado). El canje de una pulsera de equipo exige vínculo vigente y cuenta activa (`redeemTeamPulse`), así que un pase viejo ya no canjea; el pase queda en el teléfono hasta que su dueño lo borre. |
| Se elimina al asistente | Su pulsera ya no existe → «no encontrada». |
| Cambia el nombre del asistente | El pase ya emitido **no** cambia; hay que agregarlo de nuevo. |
| Se cambia `WALLET_QR_SECRET` | Todos los QR emitidos dejan de validarse. |
| La plataforma no está configurada | 503 «Esta opción todavía no está disponible…»; el detalle de lo que falta solo va al registro del servidor (`[wallet] apple no disponible: …`). |

## 6. Requisitos de cada plataforma (documentación oficial consultada el 16 oct 2026)
### Apple Wallet — https://developer.apple.com/documentation/walletpasses
Verificado en la documentación: el pase es un `.pkpass` (ZIP con `pass.json`, imágenes, `manifest.json` con el hash de cada archivo y `signature` PKCS#7 desprendida del manifest); se identifica con un **Pass Type ID** y el **Team ID**; se firma con el certificado de ese Pass Type ID y se incluye el intermedio de Apple (WWDR); tipo de contenido `application/vnd.apple.pkpass`.
**Necesitas** (pendiente): cuenta del **Apple Developer Program** (de pago) → crear un **Pass Type ID** (identificador `pass.…`) → generar el certificado (CSR) → exportar certificado y llave privada (PEM) → descargar el certificado intermedio «Apple Worldwide Developer Relations» vigente.
**No verificado:** la vigencia/renovación del certificado de Pass Type ID, si Apple exige HTTPS para el enlace (en producción lo será de todos modos), y que iOS acepte la firma con digest **SHA-256** (la implementación la valida con OpenSSL; la aceptación real solo puede comprobarse en un iPhone). El manifest usa SHA-1, como exige el formato.
### Google Wallet — https://developers.google.com/wallet
Verificado en la documentación: pase **genérico** con **clase** y **objeto**; enlace «Add to Google Wallet» = `https://pay.google.com/gp/v/save/<JWT>`; el JWT (RS256) lo firma el servidor con una **cuenta de servicio** y puede llevar clase y objeto (Google crea/actualiza la clase al guardar); mientras la cuenta del emisor está en **modo demostración** solo pueden guardar el pase los **usuarios de prueba** agregados en la consola; para el público hay que solicitar acceso de producción/aprobación.
**Necesitas** (pendiente): cuenta de emisor en la consola de Google Wallet para emisores (ID de emisor) → proyecto de Google Cloud con la **API de Google Wallet** habilitada → **cuenta de servicio** con su llave JSON → autorizar esa cuenta de servicio en la consola de Wallet → (modo demostración) agregar correos de prueba → (producción) solicitar acceso.
**No verificado:** el límite de longitud del enlace (la documentación consultada no lo publica; el enlace de prueba mide ≈1 680 caracteres con un nombre y una iglesia normales — una prueba vigila que no crezca), el valor exacto del enum del código de barras (`QR_CODE` según la referencia REST) y las guías de marca del botón.

## 7. Configuración (variables de entorno del SERVIDOR; ver `.env.example`)
| Variable | Para | Notas |
|---|---|---|
| `WALLET_QR_SECRET` | ambas | ≥32 caracteres, distinta de `SESSION_SECRET`. Sin ella no hay Wallet. |
| `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID`, `APPLE_PASS_CERT`, `APPLE_PASS_KEY`, `APPLE_WWDR_CERT`, (`APPLE_PASS_KEY_PASSPHRASE`) | Apple | PEM; llave RSA que corresponda al certificado y certificado no vencido (se comprueba al leer). |
| `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SA_EMAIL`, `GOOGLE_WALLET_SA_KEY`, (`GOOGLE_WALLET_CLASS_SUFFIX`) | Google | `PUBLIC_BASE_URL` (origen https) también es obligatoria para Google. |
Valores PEM: con saltos de línea reales, con `\n` como texto o en base64 de una línea. Cada plataforma se activa sola cuando sus variables están completas y válidas.

### Desarrollo local (sin cuentas reales)
1. `WALLET_QR_SECRET` en tu `.env` (`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`).
2. Google: sin cuenta real no se puede ver el pase; solo genera un enlace (que Google rechazará si la cuenta de servicio no existe). Para ver el botón y el flujo completos con material de PRUEBA (certificados y llaves autogenerados con `openssl`, no sirven en Wallet real) mira cómo lo hace `tests/team-pulse/wallet.test.mts`.
3. Con cuentas reales en modo demostración/desarrollo: configura las variables de la plataforma, `npm run dev`, abre Más → Mi gafete en el teléfono por **https** (p. ej. `npm run dev:https` o un túnel) e inicia sesión con una pulsera de prueba **de una base local/rama de prueba**.
### Producción (cuando haya cuentas aprobadas)
1. Neon de producción **no cambia** (no hay migración).
2. Netlify → Site configuration → Environment variables: las de §7 (marcar las llaves como secretas; nunca en Git).
3. Verifica `PUBLIC_BASE_URL` = dominio definitivo con https y que `/wallet/logo.png` responde.
4. Despliega, abre `/api/wallet/status` (debe mostrar `true` en lo configurado) y prueba con una cuenta de prueba real en un iPhone y un Android.
5. Google: solicita acceso de producción antes de que lo usen asistentes ajenos a los usuarios de prueba (en modo demostración solo funciona con los usuarios de prueba). Apple: el Pass Type ID debe pertenecer a tu equipo de Apple Developer.

## 8. Pruebas
**Automáticas (se ejecutan con `npm run test:team`; 47 casos de Wallet, `tests/team-pulse/wallet.test.mts`):**
- Lógica: código del QR (firma, falsificación, id ajeno, otro secreto), boleto (vencimiento, propósito único, alteración), configuración (variables incompletas, mensajes, PEM en 3 formas, secreto corto), detección de plataforma, escáner.
- **Validación de formato con material de PRUEBA:** ZIP (CRC, `unzip -t`), `manifest.json` (SHA-1 de cada archivo), firma PKCS#7 verificada con `openssl smime -verify` contra una CA/certificado de prueba y comprobada como inválida si el manifest cambia; JWT de Google (RS256 verificado con la llave pública de prueba, campos y tamaño).
- Endpoints contra PostgreSQL desechable: la persona obtiene **su** credencial; no existe forma de pedir la de otra (parámetros `pulseId/attendeeId/userId` ignorados); 401 sin credencial, con token inventado, malformado, sin reclamar o deshabilitado; Staff sin pulsera 404; token + cookie; pulsera/cuenta deshabilitada o desvinculada; boletos falsos/vencidos; el boleto de una persona no da el pase de otra; límite 429; 503 sin configuración sin filtrar nombres de variables; el JWT/pase no contiene el token ni el código de respaldo.
- Escaneo de Staff del QR de Wallet: persona correcta, igual resultado que la pulsera física, QR falsificado/otro secreto → no encontrada, pulsera deshabilitada → no sirve, sin sesión 401, canje descuenta exactamente 1 (en la base de prueba) y el QR no sirve como sesión (`/api/me` 401).
**Navegador (Chromium, base local desechable, certificados de prueba):** en la ubicación final (dentro de «Mi gafete», comprobado con agente iPhone: aparece junto a Girar/Descargar, no hay botón en Perfil ni en Más y el clic descarga el `.pkpass`). Cuando el botón estaba en Perfil se comprobó además, con la misma lógica del componente: solo Apple con iPhone, solo Google con Android, ambas en escritorio y ninguna sin configuración (no se repitió en el visor); clic en Apple descarga `arraigados-2k26.pkpass` (tipo MIME correcto); clic en Google navega a `https://pay.google.com/gp/v/save/<JWT>` (la solicitud se interceptó: no se contactó a Google).
**NO probado (pendiente):** que un iPhone acepte la firma y agregue el pase; que Google acepte el JWT con una cuenta real y que aparezca en Google Wallet; guías de marca de los botones; diseño del pase en pantalla real; escaneo con la cámara de un QR mostrado desde Wallet (brillo/tamaño); comportamiento con ids reales de Neon.

## 8b. Diseño del pase y actualizaciones (revisión del 16 oct 2026)
- El pase reutiliza la identidad del gafete: colores `#3e07a6` / `#f2f7d7` / `#c0b8df`, logotipo y nombre del congreso, nombre completo, iglesia (o «Equipo»), fechas y el QR firmado (`WALLET_EVENT` en `server/wallet/event.ts` y `assets.ts`). No incrusta React ni renderiza el gafete: es un `.pkpass` / objeto JWT con campos propios de cada plataforma, así que **no es una copia píxel a píxel del gafete** (las plataformas no permiten el mismo lienzo).
- Disponibilidad: cada plataforma se habilita por separado y solo con configuración válida; sin ella no hay botón y los endpoints responden 503 genérico (probado).
- **Cambios de nombre o de vínculo NO se propagan solos:** el pase ya emitido conserva el nombre con el que se creó. Si la pulsera se reasigna/reemplaza/desvincula, el QR viejo deja de servir porque el servidor revisa el estado de la pulsera en cada escaneo; la persona debe agregar un pase nuevo. No se prometen actualizaciones automáticas (requerirían `webServiceURL` + notificaciones push de Apple y la API REST de Google).

## 9. Limitaciones conocidas
- Sin cuentas de Apple/Google configuradas no hay botón ni pase (a propósito).
- El pase no se actualiza solo (nombre, invalidación): ver §5. Actualizaciones requerirían el servicio web de Apple (`webServiceURL` + notificaciones push) y la API REST de Google; no se implementó para no agregar tablas ni servicios.
- Los botones son de texto (no las insignias oficiales).
- El boleto de Apple vive 90 s y no se invalida tras usarse (mismo pase, mismo dueño).
- Cambiar el diseño del pase exige regenerar `assets.ts` y volver a agregar los pases ya emitidos.
