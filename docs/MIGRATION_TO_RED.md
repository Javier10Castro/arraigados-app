# Guía de migración a infraestructura oficial de Red Juvenil Tijuana

Guía práctica para quien ejecute, en el futuro, el paso de Arraigados 2K26 de
cuentas personales a infraestructura oficial de la Red. **Nada de lo descrito
aquí se ha ejecutado todavía** — es la hoja de ruta, no un registro de acciones
realizadas. Complementa el inventario técnico en `docs/INFRASTRUCTURE.md`.

> **Regla de oro: no se debe apagar ni eliminar la infraestructura personal
> hasta comprobar que la infraestructura oficial funciona correctamente.**

---

## 1. Estado actual

- Frontend + Functions: Vite/React + Netlify Functions, desplegado en Netlify
  bajo la cuenta personal de Javier.
- Base de datos: un único proyecto Neon PostgreSQL, usado hoy como entorno de
  desarrollo/pruebas de Arraigados 2K26. Fue creado originalmente para una app
  Next.js hermana que ahora queda considerada **PROYECTO HISTÓRICO/REFERENCIA**
  (ya no se usa en producción ni como dependencia activa — ver
  `docs/INFRASTRUCTURE.md` §19). Por esa razón, los datos actuales de ese Neon
  se consideran parte del ecosistema de Arraigados 2K26, salvo que el código
  demuestre lo contrario.
- Repositorio: GitHub, cuenta personal `Javier10Castro`.
- Dominio: no existe uno definitivo. `PUBLIC_BASE_URL` queda vacía en
  desarrollo.
- Nada de esto se migra como parte de la auditoría de portabilidad — solo se
  documenta y se deja el código portable para cuando se decida ejecutar esta
  guía.

## 2. Qué servicios están en cuentas personales

| Servicio | Cuenta actual | Decisión del propietario |
|---|---|---|
| GitHub | Personal (`Javier10Castro`) | Permanece personal por ahora; transferencia futura en §3 |
| Netlify | Personal | Permanece personal por ahora; configuración futura en §12 |
| Neon | Personal (proyecto originalmente compartido con el Next.js histórico) | Permanece como entorno de desarrollo/pruebas; se crea uno oficial nuevo para producción (§7) |
| Dominio | No existe | Pendiente de definición/adquisición; cuando exista, debe quedar bajo control de la Red (§14) |

## 3. Qué recursos deben pasar a Red Juvenil

- Repositorio de GitHub (por transferencia de propiedad o repo nuevo bajo una
  organización oficial — a decidir cuando llegue el momento; la arquitectura y
  la documentación del proyecto no dependen del username personal de GitHub).
- Proyecto y equipo de Netlify.
- Proyecto Neon oficial, nuevo (no el actual).
- Dominio (registro, DNS, facturación).
- Cuentas de Staff/Admin con correos oficiales de la Red (sustituyendo a las
  demo/prueba, conservando a Javier y Perla como se detalla en §4).

## 4. Qué datos se conservan

- **Usuarios reales de operación**: únicamente las cuentas ADMIN/STAFF que
  efectivamente se usan — hoy, **Javier** y **Perla**. Ninguna otra cuenta
  demo/prueba se migra a producción.
  - Los hashes de contraseña (nunca contraseñas en texto plano, que no existen
    en la base) pueden incluirse en la estrategia técnica de migración si es
    necesario para que esos usuarios conserven su acceso sin tener que
    restablecer contraseña. Esta decisión se toma en el momento de migrar, y
    esos valores **nunca se muestran ni se documentan** en ningún reporte.
- **Estructura territorial/eclesial**: Iglesias → Presbiterios → Zonas, con su
  jerarquía completa. Se consideran datos oficiales **hasta nuevo aviso, no
  permanentes** — la arquitectura no debe asumir que la lista actual es
  definitiva (ver la nota sobre actualización vía Excel, al final de este
  documento).
- **Configuración oficial de paquetes/beneficios** del evento.

## 5. Qué datos NO se conservan

- Asistentes de prueba, registros de prueba, pulseras de prueba, lotes de
  prueba, canjes de prueba, reasignaciones de prueba, y cualquier otro dato
  generado únicamente para testing.
- Esto **no se borra ahora**. Se identifica y se excluye en el momento de la
  migración real (§9), de forma selectiva — nunca copiando la base completa
  sin revisar.

## 6. Preparación previa

Antes de iniciar la migración real:
1. Confirmar que el dominio oficial (si ya existe para entonces) está
   definido y controlado por la Red — ver §14.
2. Confirmar quién tendrá acceso administrativo a los nuevos GitHub/
   Netlify/Neon oficiales.
3. Congelar brevemente la escritura de datos nuevos en el entorno actual
   (ventana de mantenimiento corta) para que el conteo de verificación (§10)
   sea estable durante la migración.
4. Tomar un respaldo del Neon actual (`npm run db:respaldo`, script ya
   existente en el proyecto) antes de tocar nada.
5. Tener decidido el dominio definitivo si va a usarse de inmediato: el
   dominio queda grabado dentro de cada QR impreso, así que conviene fijarlo
   antes de imprimir pulseras reales (ver `docs/PLAN_DOMINIO.md`).

## 7. Creación del Neon oficial

1. Crear un proyecto Neon **nuevo** bajo la cuenta/organización oficial de la
   Red — no reutilizar el proyecto personal actual.
2. Anotar la nueva `DATABASE_URL` (endpoint **pooled**, `-pooler`, igual
   convención que hoy) y no compartirla fuera del equipo técnico.
3. No apagar ni modificar el Neon actual en este paso — sigue siendo el
   entorno de desarrollo/pruebas mientras tanto.

## 8. Migración del esquema

1. Recrear en el proyecto oficial el mismo esquema que existe hoy (tablas
   `User`, `Church`, `Presbytery`, `Zone`, `Package`, `Attendee`, `Pulse`,
   `Batch`, `Redemption`, `AuditLog`, etc.), replicando la estructura actual
   — originada en las migraciones Prisma del proyecto Next.js histórico, más
   la migración propia de este repo, `migrations/001_batch_status.sql`
   (idempotente — puede ejecutarse más de una vez sin romper nada).
2. Verificar que tipos ENUM, índices y relaciones (foreign keys) queden
   idénticos antes de mover un solo dato. El script `npm run db:esquema`
   (solo lectura) sirve para comparar el esquema real del proyecto nuevo
   contra lo esperado.
3. No ejecutar nada de esto contra el Neon actual ni contra el proyecto
   histórico de Next.js.

## 9. Migración selectiva de datos

1. Exportar únicamente lo que corresponde conservar (§4): usuarios Javier y
   Perla, estructura territorial completa (Iglesias/Presbiterios/Zonas),
   configuración de paquetes.
2. Excluir explícitamente todo lo de §5 (datos de prueba) — por ejemplo,
   filtrando por la convención de nombres ya usada hoy (`TEST-*` en lotes) y
   revisando manualmente cualquier otro dato que sea claramente de prueba
   aunque no siga esa convención.
3. Insertar los datos conservados en el Neon oficial, preservando IDs y
   relaciones (Iglesia → Presbiterio → Zona) para no romper referencias.
4. **Nunca** ejecutar un `pg_dump`/copia completa de una base a otra sin pasar
   primero por este filtro de selección — es el punto central de esta
   política: migración selectiva, no "copiar toda la base sin revisar".

## 10. Verificación de conteos

Después de migrar, comparar conteos entre origen (filtrado) y destino:
- Número de iglesias, presbiterios y zonas migradas vs. las que se decidió
  conservar.
- Número de usuarios migrados (debe ser exactamente los que se decidió
  conservar — hoy, Javier y Perla).
- Número de paquetes migrados.
- Confirmar que **no** se migraron asistentes, pulseras, lotes, canjes ni
  reasignaciones de prueba: el conteo de esas tablas en el Neon oficial recién
  creado debe reflejar solo lo cargado a propósito para pruebas de ese nuevo
  entorno, nunca un arrastre del entorno de desarrollo.

## 11. Configuración de variables

En el nuevo entorno de Netlify oficial, configurar (nunca en el código):
- `DATABASE_URL` → la del Neon oficial, no la de desarrollo.
- `SESSION_SECRET` → un valor **nuevo**, generado para producción, nunca
  reutilizado del entorno de desarrollo.
- `PUBLIC_BASE_URL` → el dominio oficial, una vez exista (§14); sin esta
  variable configurada, la generación de QR no debe asumir un dominio por
  defecto.

## 12. Creación/configuración de Netlify

1. Crear un sitio nuevo en Netlify bajo la cuenta/equipo oficial de la Red (o
   transferir el sitio existente, si se decide esa ruta en su momento).
2. Conectar el repositorio de GitHub oficial (§3).
3. El `netlify.toml` del proyecto ya es portable (build command, publish dir,
   versión de Node, carpeta de funciones, redirects, headers) — se usa tal
   cual, sin IDs ni rutas personales; no requiere reconfiguración manual más
   allá de las variables de entorno.
4. Configurar las variables de entorno de §11 en el panel de Netlify del
   sitio oficial.
5. Probar los endpoints básicos (`/api/packages`, `/api/churches`) en la URL
   temporal `.netlify.app` **antes** de conectar el dominio definitivo.

## 13. Pruebas antes de producción

1. Probar el flujo completo (registro de asistente, entrega de pulsera, canje
   de beneficios, dashboard, exportaciones) contra el sitio y Neon oficiales,
   usando datos de prueba propios de esa validación — nunca datos reales de
   asistentes todavía.
2. Confirmar login de Staff/Admin con las cuentas migradas (Javier y Perla).
3. Confirmar que los QR generados apuntan al dominio correcto una vez
   configurado `PUBLIC_BASE_URL`.
4. Confirmar que `npm run db:conteo` contra el Neon oficial coincide con los
   totales esperados de la migración selectiva (§9/§10).
5. Solo después de que todo esto funcione, considerar el sitio oficial listo
   para producción.

## 14. Configuración futura del dominio

1. Adquirir el dominio bajo una cuenta/registrador controlado por la
   organización Red Juvenil Tijuana — nunca por una cuenta o tarjeta
   personal.
2. Apuntar el DNS al sitio oficial de Netlify.
3. Configurar `PUBLIC_BASE_URL` con el dominio definitivo (sin `/` al final).
4. Revisar `docs/PLAN_DOMINIO.md` para el detalle completo del corte de
   dominio temporal/`localhost` al definitivo, incluyendo el recordatorio de
   que el dominio queda grabado dentro de cada QR impreso — fijarlo antes de
   imprimir pulseras reales.

## 15. Verificación final

Antes de declarar la migración completa:
- Todos los conteos de §10 cuadran.
- El login de Staff/Admin funciona en el sitio oficial.
- Los QR generados usan el dominio oficial.
- No hay referencias remanentes a la cuenta personal de Netlify/GitHub en la
  configuración activa del sitio oficial.
- El entorno personal (Netlify + Neon actuales) sigue intacto y disponible
  como respaldo.

## 16. Rollback

Si algo falla durante o después de la migración:
1. El entorno personal (Netlify + Neon actuales) **no se toca ni se apaga**
   hasta pasar la Verificación final (§15) — por lo tanto, sigue disponible
   como entorno funcional en todo momento durante la transición.
2. **Netlify:** el sitio personal sigue sirviendo tráfico normalmente mientras
   el sitio nuevo de la Red se prueba en su URL temporal `.netlify.app`, sin
   afectar nada. Si el sitio oficial falla, se sigue operando desde el
   entorno personal mientras se corrige.
3. **Neon:** el proyecto personal no se borra ni se modifica durante la
   migración — es el origen de los datos, no el destino. Si algo sale mal
   copiando al proyecto nuevo, se repite la migración selectiva (§9) desde
   cero contra un Neon oficial limpio, sin riesgo para los datos originales.
4. **Dominio:** el corte real ocurre cuando el DNS apunta al sitio nuevo.
   Mientras el DNS siga apuntando al entorno anterior (o no se haya
   configurado), no hay punto de no retorno. Si tras cambiar el DNS algo
   falla, se revierte el registro DNS al valor anterior.
5. **GitHub:** si se usó transferencia de repo, GitHub permite transferirlo de
   regreso; si se usó repo nuevo + push, el repositorio personal original
   sigue existiendo sin tocarse.

Ningún paso de esta guía implica borrar ni modificar destructivamente el
entorno personal — es un plan de "copiar y verificar", no de "mover y
confiar".

## 17. Criterios para considerar exitosa la migración

- Todos los puntos de la Verificación final (§15) cumplidos.
- El Staff real (Javier, Perla, y cualquier otro usuario oficial agregado en
  ese momento) puede operar el sistema completo en el entorno oficial sin
  depender de ninguna cuenta personal.
- El dominio oficial resuelve correctamente y los QR funcionan de extremo a
  extremo.
- Ningún dato de prueba quedó mezclado con datos reales en el Neon oficial.
- El repositorio, el sitio y la base de datos oficiales son administrables
  por la Red sin necesidad de acceso a las cuentas personales de Javier.

---

## Production Data Policy

El entorno de desarrollo (Neon actual) puede contener, y de hecho contiene,
datos de prueba generados durante el desarrollo y las pruebas de la
aplicación. **Antes de la puesta en producción oficial debe realizarse una
limpieza o migración selectiva — nunca una copia automática de toda la
base.**

- La información territorial oficial (Iglesias → Presbiterios → Zonas) **sí**
  forma parte de los datos que deben conservarse y migrarse.
- Los usuarios reales ADMIN/STAFF (hoy, Javier y Perla) **también** deben
  conservarse.
- Los asistentes, pulseras, lotes, canjes y reasignaciones generados durante
  pruebas **no** deben pasar automáticamente a producción — se excluyen en el
  paso de migración selectiva (§9).

## Actualización futura de iglesias/presbiterios/zonas mediante Excel

Requisito documentado para una etapa futura, **no implementado todavía**:

- La lista oficial de iglesias puede cambiar; el código no debe asumir que la
  lista actual es permanente.
- Deberá poder actualizarse antes de cada evento mediante un Excel que
  proporcione el propietario del proyecto, respetando la jerarquía territorial
  (Iglesia → Presbiterio → Zona) ya definida.
- No se implementa un importador de Excel ahora porque no existe
  especificación suficiente; se documenta el requisito para cuando se defina.
- Cuando se implemente, deberá: validar duplicados, relaciones y consistencia
  antes de aplicar cambios; nunca borrar accidentalmente historial de
  asistentes ligados a iglesias existentes; exigir un respaldo antes de
  modificar datos territoriales en producción.
