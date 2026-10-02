# Plan: de localhost al dominio real

Guía para cuando se compre el dominio de Arraigados 2K26. Está pensada para hacerse en
orden, probando en cada paso, y **sin imprimir pulseras definitivas hasta el último paso**.

## Dónde estamos hoy

| Pieza | Hoy (desarrollo) | Con dominio (producción) |
|---|---|---|
| App Vite (principal: asistente, Staff, Admin) | `http://localhost:8888` (`npm run dev`) | `https://<dominio>` en Netlify |
| App Next.js (respaldo) | `http://localhost:3000` | Opcional: `https://admin.<dominio>` (Vercel) o solo local |
| Base de datos | Neon (la misma para las dos apps) | Neon, idealmente separando pruebas y producción (ver decisión 2) |
| QR de las pulseras | `http://localhost:3000/p/{token}` (solo pruebas) | `https://<dominio>/p/{token}` (**definitivo**) |

## La regla más importante

El dominio **queda impreso dentro de cada QR**. Una vez impresas las pulseras definitivas:

- el dominio y la ruta `/p/{token}` **no pueden cambiar**;
- el dominio debe **renovarse** al menos hasta después del congreso (compra 1 año o más y activa la renovación automática);
- no se borran ni regeneran los tokens de esas pulseras.

## Decisiones antes de empezar

Se revisan juntos antes de ejecutar nada. Recomendación entre paréntesis.

1. **Qué dominio y cómo se reparte.** (Recomendado: `<dominio>` → app Vite; el Next.js no
   se publica, o se publica en `admin.<dominio>` solo como respaldo.)
2. **Separar pruebas de producción en Neon con *branches*.** (Recomendado.) La rama `main`
   queda para el congreso real y se crea una rama `desarrollo` para localhost. Cada rama
   tiene su propia cadena de conexión: el `.env` local apunta a `desarrollo` y Netlify
   apunta a `main`. Así las pruebas nunca ensucian los datos reales. Las dos apps
   (Vite y Next.js) deben apuntar a la **misma** rama en cada ambiente.
3. **¿Los PDFs del Next.js también deben apuntar al dominio de Vite?** Si se sigue usando su
   admin para generar lotes, su variable `NEXT_PUBLIC_BASE_URL` tendría que ser
   `https://<dominio>`. Es un cambio de configuración, no de código, pero toca el proyecto
   Next.js: se decide en su momento.

## Pasos

### 1. Comprar el dominio
- En cualquier registrador. Si se compra en Netlify, el DNS queda configurado solo.
- Anotar dónde se compró, la fecha de renovación y quién tiene acceso a la cuenta.

### 2. Publicar la app Vite en Netlify (todavía sin dominio)
- Crear el sitio en Netlify: conectar el repositorio, o subirlo con `netlify deploy`.
- La configuración de compilación ya está en `netlify.toml` (`npm run build`, carpeta `dist`, funciones en `netlify/functions`).
- En *Site configuration → Environment variables* agregar:
  - `DATABASE_URL` → la conexión de Neon de **producción** (rama `main`).
  - (Fase 2) `SESSION_SECRET` → clave para las sesiones de Staff/Admin.
- Probar en la dirección temporal que da Netlify (`https://<algo>.netlify.app`):
  - `/api/packages` debe responder con los 3 paquetes;
  - la portada, `/conocer` y `/registro` deben cargar.

### 3. Conectar el dominio
- Netlify → *Domain management* → *Add a domain* → `<dominio>` (y `www.<dominio>`).
- Si el dominio se compró fuera de Netlify, configurar los registros DNS que indique Netlify.
- Netlify activa **HTTPS automáticamente** (puede tardar unos minutos). Verificar el candado.
- Con HTTPS, la **cámara funciona en cualquier celular** sin certificados de prueba.

### 4. (Opcional) Publicar el Next.js como respaldo
- En Vercel, con las variables de su `.env.example`: `DATABASE_URL`/`DIRECT_URL` (misma rama
  que Vite), `AUTH_SECRET`, `NEXT_PUBLIC_BASE_URL` (ver decisión 3).
- Dominio sugerido: `admin.<dominio>`.

### 5. Probar con el dominio real (con pulseras de PRUEBA)
- [ ] Generar un lote de prueba de 3 pulseras (Kit - A, Kit - B, Especial).
- [ ] Imprimir una hoja: medir con regla la línea de 5 cm (impresión "Tamaño real / 100%").
- [ ] Escanear cada QR con la **cámara normal** de un iPhone y de un Android: debe abrir `https://<dominio>/p/...`.
- [ ] Registrar una pulsera y confirmar que entra a Inicio y Mi paquete.
- [ ] Escanear la misma pulsera en otro celular: debe entrar directo a Inicio.
- [ ] Staff (Fase 2): iniciar sesión, escanear y canjear 1 agua fresca; verificar que Mi paquete lo refleja.
- [ ] Admin (Fase 3): ver el lote, el estado de cada pulsera y descargar el PDF.
- [ ] Si se publicó el Next.js: confirmar que ve la misma pulsera, el mismo asistente y el mismo canje.

### 6. Antes de imprimir las pulseras definitivas
1. Respaldo y limpieza de **todo** lo de prueba en la base de producción (`docs/RESPALDO_Y_LIMPIEZA.md`).
2. Confirmar paquetes, precios y aguas frescas en Admin.
3. Generar los lotes reales **desde la app con el dominio** (los QR deben decir `https://<dominio>/p/...`).
4. Imprimir **una sola hoja** primero y repetir las pruebas del paso 5 con esa hoja.
5. Hacer un respaldo justo después de generar los lotes reales.
6. Imprimir el resto.

## Si algo sale mal

- **La versión publicada falla:** Netlify → *Deploys* → elegir la versión anterior → *Publish deploy*. Regresa en segundos.
- **Datos borrados o dañados:** restaurar el respaldo (`npm run db:restaurar -- respaldos/...`) o la copia/branch de Neon.
- **El dominio no responde:** revisar DNS y la renovación en el registrador. Las pulseras dependen de él.

## Lo que falta en el código antes de producción

- Fase 2: login de Staff/Admin contra `User` (necesita `SESSION_SECRET`).
- Fase 3: el PDF de Vite toma el dominio de una variable de entorno (`PUBLIC_BASE_URL`): en local `http://localhost:8888`, en producción `https://<dominio>`.
- Quitar el recuadro de "Datos de prueba" del Login.
