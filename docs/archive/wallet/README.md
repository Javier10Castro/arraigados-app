# Archivo: integración con Apple Wallet y Google Wallet (CANCELADA)

**Estado:** cancelada el 17 de octubre de 2026 **por decisión de alcance y tiempo**. Los requisitos externos (cuenta de Apple Developer de pago, certificados, emisor de Google Wallet, cuenta de servicio y aprobación) no caben en el tiempo disponible antes del congreso (17–18 oct 2026). No fue un fallo técnico.

La app **ya no tiene** botón «Agregar a Wallet», rutas `/api/wallet/*`, panel de Wallet en Configuración ni lectura del QR de Wallet en el escáner de Staff. El gafete digital (animación, visor «Mi gafete», girar, descargar imagen) y su QR de pulsera **no cambiaron**. Nunca se agregó un pase a un teléfono real; no hubo cambios en Neon, ni migraciones, ni despliegue.

## Qué se había implementado
- Servidor (`code/server/wallet/`): QR firmado `AR26W1.<id de pulsera>.<firma HMAC>` (no el token privado de la pulsera), boleto de descarga de 90 s, `.pkpass` de Apple con firma PKCS#7 y ZIP hechos con `node:crypto` (sin dependencias), enlace «Add to Google Wallet» con JWT RS256, configuración por variables de entorno y diagnóstico.
- Endpoint único `code/netlify/functions/wallet.mts` (`/api/wallet/status|diagnostics|apple-ticket|apple|google`): identidad siempre de la sesión (token de pulsera o cookie del equipo), nunca de un id enviado por el cliente.
- Interfaz: `code/src/components/wallet/AddToWallet.*` (botón con estados de carga y errores en español), `code/src/lib/walletPlatform.ts`, `code/src/admin/WalletPanel.tsx` (qué variables faltan, solo nombres).
- Escáner de Staff: aceptaba el QR de Wallet (`?wallet=` en `/api/staff/pulse`), validando firma y estado de la pulsera en cada lectura.
- Pruebas: `code/tests/team-pulse/wallet.test.mts` (47 casos, PostgreSQL local desechable, certificados de PRUEBA) y `walletdiag.test.mts`. Todas pasaban el 16–17 oct 2026.
- Documentación técnica completa: [`WALLET.md`](WALLET.md) (contenido del pase, seguridad, arquitectura, requisitos, pruebas).

## Qué quedó pendiente
- Cuentas y credenciales reales (abajo); **ninguna se obtuvo**.
- Comprobar en un iPhone que acepte la firma y en Android que Google acepte el JWT.
- Sustituir los botones de texto por las insignias oficiales.
- Decisión abierta: el QR del pase es un código derivado y firmado, no el token de la pulsera (por seguridad). Se podría cambiar si se quisiera el mismo QR físico, con el riesgo de exponer la credencial de sesión.
- Los pases no se actualizan solos (nombre, invalidación); requeriría servicio web de Apple y la API REST de Google.

## Qué se necesitaría para retomarla (sin valores aquí)
- **Apple:** Apple Developer Program (de pago), un Pass Type ID (`pass.…`), su certificado y llave privada en PEM, el certificado intermedio WWDR vigente y el Team ID.
- **Google:** cuenta de emisor en la consola de Google Wallet, proyecto de Google Cloud con la API de Google Wallet, cuenta de servicio con su llave, cuenta autorizada en la consola, usuarios de prueba (modo demostración) y solicitud de acceso de producción.
- **Variables de entorno del servidor (Netlify, nunca en Git):** `WALLET_QR_SECRET` (≥ 32 caracteres, distinta de `SESSION_SECRET`); `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID`, `APPLE_PASS_CERT`, `APPLE_PASS_KEY`, `APPLE_WWDR_CERT` (y opcional `APPLE_PASS_KEY_PASSPHRASE`); `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SA_EMAIL`, `GOOGLE_WALLET_SA_KEY` (opcional `GOOGLE_WALLET_CLASS_SUFFIX`); `PUBLIC_BASE_URL` con https.

## Cómo recuperar el trabajo
Todo está en esta carpeta; nada de aquí se compila ni se despliega (`docs/` no forma parte de `tsconfig`, Vite ni de las pruebas).
1. Copia cada archivo de `code/` a su misma ruta relativa en la raíz del proyecto (`code/server/wallet/` → `server/wallet/`, `code/netlify/functions/wallet.mts` → `netlify/functions/`, `code/src/…` → `src/…`, `code/tests/team-pulse/*` → `tests/team-pulse/`, `code/public/wallet/` → `public/wallet/`).
2. Vuelve a conectar los puntos de integración con el parche [`restore-integration.patch`](restore-integration.patch) (formato `diff -u`, rutas `a/…` `b/…`, texto con saltos LF), desde la raíz: `patch -p1 --ignore-whitespace < docs/archive/wallet/restore-integration.patch`. Toca: `server/staff.ts`, `netlify/functions/staff-pulse.mts`, `server/rateLimit.ts` (regla `wallet`), `shared/api.ts`, `src/lib/api.ts`, `src/lib/pulseCode.ts`, `src/pages/Staff.tsx`, `src/components/RedeemModal.tsx`, `src/pages/homev2/{IntroExperience,GafeteViewer}.tsx`, `src/admin/Configuracion.tsx`. Si esos archivos cambiaron mucho, aplica los hunks a mano.
3. Restaura `WALLET.md` a `docs/`, añade las variables a `.env.example`, ejecuta `tsc -b`, `vite build` y `npm run test:team` en una base local desechable, y sigue [`WALLET.md`](WALLET.md) §7–8.
4. Nota: el parche está generado contra el estado del 17 oct 2026. Las rutas relativas dentro de `WALLET.md` apuntan a la ubicación original (`docs/`).

## Limpieza manual pendiente (fuera del repositorio)
- Si alguna vez se cargaron en Netlify las variables `WALLET_QR_SECRET`, `APPLE_*` o `GOOGLE_WALLET_*`: eliminarlas. (En el `.env` local no existía ninguna; solo se revisaron nombres.)
- Si se creó algo en cuentas de Apple Developer o Google Wallet/Cloud (Pass Type ID, certificados, emisor, cuenta de servicio): no se creó nada durante este trabajo; revisar por si acaso y revocar lo que no se vaya a usar.
- Los bloques de `.env.example` de Wallet (si existen en tu copia) se retiran en la entrega de esta limpieza.
