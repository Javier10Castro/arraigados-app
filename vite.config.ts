import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

/** Cabecera con la que el proxy de desarrollo marca sus peticiones (evita ciclos). */
const PROXY_MARK = 'x-arraigados-dev-proxy';

// `npm run dev:https` (--mode https) sirve con un certificado local para
// poder usar la cámara desde un celular en la red (los navegadores solo
// permiten la cámara en https o en localhost).
export default defineConfig(({ mode }) => ({
  plugins: mode === 'https' ? [react(), basicSsl()] : [react()],
  server:
    mode === 'https'
      ? {
          // Para probar la cámara desde un celular: https en el puerto 5174 y las
          // rutas /api se mandan al `npm run dev` (netlify dev, puerto 8888) que
          // debe estar corriendo en otra terminal.
          port: 5174,
          host: true,
          proxy: { '/api': { target: 'http://localhost:8888', changeOrigin: false } },
        }
      : {
          port: 5173,
          host: true,
          // PUBLIC_BASE_URL de desarrollo es http://localhost:5173, así que un QR
          // de prueba abre /p/… directo en Vite. Sin este proxy esa página no
          // llega a las funciones (/api → 404). Con `npm run dev` corriendo,
          // netlify dev atiende /api en el 8888.
          //
          // Cuidado con el ciclo: netlify dev reenvía a Vite (5173) lo que no es
          // función, y Vite mandaría ese /api de vuelta al 8888 sin fin (tumba
          // netlify dev con EMFILE). Por eso el proxy marca sus peticiones y,
          // si una petición marcada regresa, Vite la atiende él mismo (404 de SPA)
          // en vez de reenviarla otra vez.
          proxy: {
            '/api': {
              target: 'http://localhost:8888',
              changeOrigin: false,
              headers: { [PROXY_MARK]: '1' },
              bypass: (req) => (req.headers[PROXY_MARK] ? req.url : undefined),
            },
          },
        },
  // Config de PostCSS en línea: evita que Vite tome un postcss.config.* de carpetas superiores.
  css: { postcss: {} },
}));
