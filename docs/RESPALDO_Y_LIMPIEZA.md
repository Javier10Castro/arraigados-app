# Respaldo y limpieza de datos de prueba

Comandos para empezar "de cero" con las pulseras **sin perder nada**: primero se guarda
un respaldo, luego se limpia, y si algo sale mal se restaura. Se corren en la carpeta
`arraigados-app`, con el `.env` apuntando a la base que quieres limpiar.

> ⚠️ La base de Neon es **la misma** que usa el Next.js. Limpiar aquí también
> limpia lo que ve el Next.js (eso es lo esperado: comparten los datos).

## Qué se borra y qué no

| Se borra (datos de prueba) | Nunca se toca |
|---|---|
| Pulseras (`Pulse`) y lotes (`Batch`) | Zonas, presbiterios, las 109 iglesias |
| Asistentes registrados (`Attendee`) | Paquetes (Kit - A, Kit - B, Especial) |
| Canjes de aguas frescas (`Redemption`) | Usuarios Admin / Staff (`User`) |
| Instantáneas: créditos, publicaciones y vistas | Configuración de Instantáneas |
| Historial de esas pruebas (`AuditLog` de lotes, pulseras, canjes, instantáneas) | Historial de cambios de configuración |

La estructura de la base (tablas, columnas, reglas) **no cambia**. Después de limpiar,
el siguiente lote vuelve a ser `LOTE-2026-001`.

## Paso a paso

**0. (Recomendado) Copia extra en Neon.** En el panel de Neon → tu proyecto → *Branches* →
*Create branch* (desde `main`, nombre por ejemplo `respaldo-antes-limpieza`). Es una copia
completa e instantánea de toda la base. No es obligatoria: el paso 2 ya guarda un respaldo.

**1. Ver qué hay** (solo lee, no cambia nada):

```bash
npm run db:conteo
```

**2. Guardar el respaldo** (solo lee la base; escribe un archivo en `respaldos/`):

```bash
npm run db:respaldo
```

Al terminar te muestra el nombre del archivo, por ejemplo
`respaldos/respaldo-20261001-162859.json`, y ya trae escritos los comandos para
restaurarlo o borrarlo. **Ese archivo contiene nombres de asistentes: no lo compartas.**

**3. Limpiar** (pide el respaldo recién hecho y que escribas `BORRAR`):

```bash
npm run db:limpiar-pruebas -- respaldos/respaldo-20261001-162859.json
```

Protecciones: no corre sin respaldo, ni con un respaldo de más de 2 horas, ni si la base
cambió desde el respaldo. Todo ocurre en una sola transacción: o se borra todo, o nada.

**4. Revisar:** `npm run db:conteo` debe mostrar ceros en los datos de prueba, y el admin
del Next.js no debe mostrar lotes.

## Si algo salió mal: regresar todo

```bash
npm run db:restaurar -- respaldos/respaldo-20261001-162859.json
```

Escribe `RESTAURAR`. Inserta exactamente las mismas filas (mismos IDs, códigos `AR26-…`,
tokens de QR, fechas). Si ya hay datos nuevos que chocan con el respaldo, no inserta nada
y avisa.

Si usaste la copia del paso 0, también puedes restaurar desde Neon: *Branches* →
`respaldo-antes-limpieza` → *Restore*.

## Si todo salió bien: borrar el respaldo

Cuando confirmes que todo funciona y ya no lo necesitas:

```bash
npm run db:borrar-respaldo                                       # lista los respaldos
npm run db:borrar-respaldo -- respaldos/respaldo-20261001-162859.json   # pide escribir ELIMINAR
```

Esto solo borra el archivo (no toca la base). Si creaste la copia en Neon (paso 0),
bórrala desde el panel: *Branches* → `respaldo-antes-limpieza` → *Delete*.

## Probado

Ciclo completo probado contra una copia local del esquema de Neon (mismas migraciones del
Next.js) con pulseras activas, sin reclamar e invalidadas, un canje, una instantánea con
vista y su historial: respaldo → limpieza → restauración dejó la base **idéntica fila por
fila**; restaurar dos veces falla sin cambiar nada.
