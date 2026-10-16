# Manual de uso — Asistentes, Staff y Admin (actualización 16 oct 2026)

Guía de procedimientos para las funciones nuevas. Complementa a [`MANUAL_ADMIN.pdf`](MANUAL_ADMIN.pdf), que **no se regeneró** y no incluye estas funciones. El detalle técnico, los permisos y la recuperación están en [`EQUIPO_PULSERA_AUTOCANJE.md`](EQUIPO_PULSERA_AUTOCANJE.md) y [`WALLET.md`](WALLET.md); aquí no se repite.

## Asistente: guardar mi credencial en el teléfono (Wallet)
1. Entra a la app con tu pulsera → **Más** → **Mi gafete**.
2. Junto a *Girar* y *Descargar imagen* verás **Agregar a Apple Wallet** (iPhone) o **Agregar a Google Wallet** (Android). Púlsalo y confirma en la hoja que abre tu teléfono.
3. Muestra el código del pase a Staff para canjear tus aguas frescas.
- **Si no ves el botón:** la opción todavía no está activada para el congreso (requiere cuentas de Apple/Google). Puedes seguir usando tu pulsera y el gafete («Descargar imagen»).
- **Si cambia tu pulsera:** el pase viejo deja de servir; vuelve a agregarlo.
- El pase es personal: no lo compartas.

## Staff: escanear
- Apunta la cámara al QR de la pulsera **o al código del pase de Wallet** del asistente; ambos se reconocen igual y muestran sus datos y saldo. Un QR de otro sistema, falsificado o de una pulsera deshabilitada se rechaza.
- Si la cámara falla: da permiso en el navegador, cierra otras apps que la usen o usa otro teléfono. Si la sesión caduca, la app te manda a iniciar sesión.

## Staff y Admin: pulsera propia y vista de visitante
1. **Tener pulsera propia.** Staff: pide a un Admin que se la asigne (Usuarios → Editar cuenta → Pulsera propia). Admin: **Más → Vincular pulsera** (o `/cuenta/pulsera`) y escanea el QR de una pulsera **sin registrar**.
2. **Entrar a la vista de visitante:** botón **Modo visitante** (⇄) en tu panel, o **Entrar como visitante** al terminar de vincular.
3. **Volver:** **Volver a mi equipo** (o **Volver a gestión** en la pantalla de vincular). Admin vuelve a `/admin`, Staff a `/staff`; no se cierra la sesión.
4. **Mensajes al vincular:** «ya pertenece a un asistente», «ya está asignada a otra cuenta», «deshabilitada», «no existe» o «ese QR no es de Arraigados» significan que debes usar otra pulsera nueva y sin registrar.
5. **El autocanje** (escanear tu propia pulsera) está apagado por defecto; lo activan los Admin en Configuración y las excepciones por persona solo la cuenta propietaria.

## Admin: activar Wallet (cuando existan las cuentas)
Ver [`WALLET.md`](WALLET.md) §7: variables de entorno en Netlify (nunca en Git) y verificación en `/api/wallet/status`. Mientras no se configuren, nada cambia para los asistentes.
