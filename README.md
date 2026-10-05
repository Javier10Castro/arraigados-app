# Arraigados 2K26

App web del **Congreso Juvenil Arraigados 2K26** (Red Juvenil Tijuana, 17 y 18 de octubre de 2026): registro de asistentes con QR de pulsera, paquetes y canje de bebidas, panel de Admin/Staff, Menú de alimentos y Mercancía oficial.

## Requisitos

- Node.js 20 o superior
- npm
- Una base de datos Neon PostgreSQL (ver variables de entorno)

## Instalación

```bash
npm install
```

## Variables de entorno

Copia la plantilla y completa los valores:

```bash
cp .env.example .env        # en PowerShell: Copy-Item .env.example .env
```

`.env` nunca se sube a Git. Las variables (todas **solo de servidor**, el frontend no usa ninguna) están documentadas en [`.env.example`](.env.example):

| Variable | Obligatoria | Para qué sirve |
|---|---|---|
| `DATABASE_URL` | Sí | Conexión a Neon PostgreSQL (endpoint *pooler*) |
| `SESSION_SECRET` | Sí | Firma las sesiones de Staff/Admin (mínimo 32 caracteres aleatorios) |
| `PUBLIC_BASE_URL` | Solo en producción | Dominio con el que se arman los QR de las pulseras |

## Desarrollo

```bash
npm run dev
```

Levanta Vite y las Netlify Functions juntos en **http://localhost:8888** (usa siempre ese puerto, no el 5173). Si la primera vez Netlify CLI pregunta por enlazar un sitio, no es necesario para trabajar en local.

`npm run dev:vite` levanta solo el frontend (sin `/api`) y `npm run dev:https` sirve con certificado local para probar la cámara desde un celular.

## Build

```bash
npm run build      # tsc -b && vite build  ->  dist/
```

## Preview

```bash
npm run preview    # sirve dist/ localmente (solo frontend, sin /api)
```

## Base de datos

Las migraciones SQL viven en `migrations/` y se aplican con `npm run db:migrar` (son idempotentes). Otros scripts de apoyo: `db:esquema`, `db:conteo`, `db:respaldo`, `db:restaurar`. Los respaldos se guardan en `respaldos/`, que está ignorado por Git porque contiene datos personales.

## Arquitectura

```text
React 18 + Vite + TypeScript  (src/)
      │   fetch('/api/...')
      ▼
Netlify Functions             (netlify/functions/*.mts, una por ruta /api/*)
      │   lógica en server/ · contrato de tipos en shared/api.ts
      ├──────────────► Neon PostgreSQL   (driver `pg`)
      └──────────────► Netlify Blobs     (fotos de Menú y Mercancía)
```

- **Frontend:** React Router 6, CSS Modules; fuente única de rutas en `src/App.tsx`.
- **Backend:** una Netlify Function por endpoint; la lógica compartida está en `server/`.
- **Despliegue actual:** Netlify (`netlify.toml`: build, SPA con redirect a `index.html`, cabeceras).

Documentación más detallada en [`docs/`](docs/) (`INFRASTRUCTURE.md`, `MIGRATION_TO_RED.md`, `CONEXION_NEON.md` y las notas históricas del proyecto en `NOTAS_DEL_PROYECTO.md`).

## Despliegue (Netlify)

Hoy el sitio vive en Netlify y se despliega desde este repositorio: un push a la rama de producción dispara el build (`npm run build`, publica `dist/`). Antes de desplegar: variables de entorno configuradas en Netlify y migraciones aplicadas (`npm run db:migrar`). Detalles en `docs/CLAUDE_HANDOFF.md` §45 y `docs/INFRASTRUCTURE.md`.
