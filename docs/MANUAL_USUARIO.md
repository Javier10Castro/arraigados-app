# Manual de uso — Asistentes, Staff y Admin (actualización 16 oct 2026)

Guía de procedimientos para las funciones nuevas. Complementa a [`MANUAL_ADMIN.pdf`](MANUAL_ADMIN.pdf), que **no se regeneró** y no incluye estas funciones. El detalle técnico, los permisos y la recuperación están en [`EQUIPO_PULSERA_AUTOCANJE.md`](EQUIPO_PULSERA_AUTOCANJE.md); aquí no se repite.

## Staff: escanear
- Apunta la cámara al QR de la pulsera del asistente; se muestran sus datos y saldo. Un QR de otro sistema, falsificado o de una pulsera deshabilitada se rechaza.
- Si la cámara falla: da permiso en el navegador, cierra otras apps que la usen o usa otro teléfono. Si la sesión caduca, la app te manda a iniciar sesión.

## Staff y Admin: pulsera propia y vista de visitante
1. **Tener pulsera propia.** Staff: pide a un Admin que se la asigne (Usuarios → Editar cuenta → Pulsera propia). Admin: **Más → Vincular pulsera** (o `/cuenta/pulsera`) y escanea el QR de una pulsera **sin registrar**.
2. **Entrar a la vista de visitante:** botón **Modo visitante** (⇄) en tu panel, o **Entrar como visitante** al terminar de vincular.
3. **Volver:** el mismo botón de las dos flechas dice **Volver a Admin** o **Volver a Staff** según tu rol (en la pantalla de vincular: **Volver a gestión**). No se cierra la sesión. Si tu sesión del equipo caduca mientras estás en la vista de visitante, la app te pide iniciar sesión de nuevo.
   El Home de visitante es igual al del asistente (con la animación de bienvenida) y en «Mi gafete» puedes girar, descargar la imagen, ver tu QR. No hay «Mi perfil» para el equipo.
4. **Mensajes al vincular:** «ya pertenece a un asistente», «ya está asignada a otra cuenta», «deshabilitada», «no existe» o «ese QR no es de Arraigados» significan que debes usar otra pulsera nueva y sin registrar.
5. **El autocanje** (escanear tu propia pulsera) está apagado por defecto; lo activan los Admin en Configuración y las excepciones por persona solo la cuenta propietaria.

## Admin: descuentos del equipo e ingresos simulados
- **Dashboard → «Descuentos del equipo e ingresos simulados»** (también `/admin/descuentos`). Es una **simulación**: no cobra nada ni cambia precios, canjes o saldos.
- Hay un descuento para **Staff** y otro para **Admin**. Cada uno tiene tipo (**Porcentaje %** o **Monto fijo MXN**) y valor; vale 0 al inicio (sin descuento). Se muestra «Activo · …» o «Sin descuento (0)».
- **Solo `javiercastro9912@gmail.com` y `perlarivera@redjuveniltijuana.com` pueden guardar cambios**; cualquier otro Admin ve la pantalla en solo lectura. El servidor lo decide con la sesión.
- Fórmulas: porcentaje → `descuento = precio normal × % / 100`; fijo → `descuento = monto`. Nunca es negativo ni mayor al precio normal. Se calcula en centavos.
- Cuenta como equipo quien tiene rol Staff/Admin **activo con pulsera vinculada**; un asistente nunca cuenta como equipo y nadie cuenta dos veces. «Referencia» = lo que corresponde a los asistentes al precio normal; «Simulado» = lo que pagaría el equipo con el descuento.

## Admin: rifas por kit
- **Rifas** (menú de Admin, o enlace en el Dashboard). Abre una rifa por kit, define cuántos ganadores quieres y presiona **Sortear ganador** (uno por vez). El servidor elige entre los asistentes con pulsera activa de ese kit que aún no ganaron (Staff y Admin no participan) y guarda el resultado.
- Si se completa el objetivo, la rifa queda **Completada**; para otro ganador usa **Sorteo extra** (pide confirmación y queda marcado «extra»). Sin elegibles no se puede girar.
- **No hay botón de reiniciar ni de borrar** (solo **Cancelar rifa**, para rifas abiertas). Una edición nueva es una rifa nueva; el historial (ganador, hora, quién sorteó, orden) se conserva y se ve en «Ver historial».
- **Vista pública / proyector:** «Abrir vista pública» abre `/rifa/<id>` (sin controles). Muestra la ruleta, los conteos y, al sortear, anima y anuncia el ganador como «Nombre I.» (nombre e inicial del apellido). Detalle completo en [`MANUAL_RIFAS.md`](MANUAL_RIFAS.md). Recargar no repite ni sortea nada.
