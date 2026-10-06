import { lazy, Suspense, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppShell from './components/AppShell';
import Cover from './pages/Cover';

// /homev2 se carga bajo demanda: su física, estilos e imágenes no pesan en el resto de la app.
const HomeV2 = lazy(() => import('./pages/homev2/HomeV2'));
import Registro from './pages/Registro';
import Conocer from './pages/Conocer';
import Login from './pages/Login';
import Programa from './pages/Programa';
import Beneficios from './pages/Beneficios';
import Comida from './pages/Comida';
import Instantaneas from './pages/Instantaneas';
import Recursos from './pages/Recursos';
import Staff from './pages/Staff';
import CambiarContrasena from './pages/CambiarContrasena';
import Usuarios from './admin/Usuarios';
import Dashboard from './admin/dashboard/Dashboard';
import Lotes from './admin/Lotes';
import LoteDetalle from './admin/LoteDetalle';
import Asistentes from './admin/Asistentes';
import AsistenteDetalle from './admin/AsistenteDetalle';
import Canjes from './admin/Canjes';
import Menu from './admin/Menu';
import Merch from './admin/Merch';
import Notas from './admin/Notas';
import Avisos from './admin/Avisos';
import Auditoria from './admin/Auditoria';
import { AdminMas } from './admin/AdminShell';
import { ADMIN_HOME } from './admin/nav';
import Mas from './pages/Mas';
import Home from './pages/home/Home';
import MerchGallery from './pages/home/MerchGallery';
import MenuPreview from './pages/menu-preview/MenuPreview';
import { usePulseSession } from './context/PulseSession';
import { useStaffSession } from './context/StaffSession';
import SessionGate from './components/SessionGate';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

/**
 * Pantallas del asistente: requieren el token de una pulsera ACTIVA guardado
 * en este celular. Sin pulsera -> "Mi registro" (escanear).
 */
function RequireAttendee({ children }: { children: ReactNode }) {
  const { state } = usePulseSession();
  if (state.phase === 'none') return <Navigate to="/registro" replace />;
  if (state.phase !== 'ready') return <SessionGate />;
  return <>{children}</>;
}

/**
 * Pantallas de Staff/Admin: requieren sesión con cuenta de "User" (Neon).
 * El servidor vuelve a verificar la sesión en cada llamada; esto solo
 * decide qué pantalla mostrar.
 */
function RequireStaff({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const { state, reload } = useStaffSession();
  const location = useLocation();
  if (state.phase === 'loading') return <SessionGate message="Verificando tu sesión…" />;
  if (state.phase === 'error') return <SessionGate message={state.message} onRetry={reload} />;
  if (state.phase === 'none') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  // Contraseña temporal: nada más se puede usar hasta crear la definitiva.
  if (state.user.mustChangePassword && location.pathname !== '/cuenta/contrasena') {
    return <Navigate to="/cuenta/contrasena" replace />;
  }
  // Staff que intenta abrir el panel de Admin -> a su pantalla.
  if (adminOnly && state.user.role !== 'ADMIN') return <Navigate to="/staff" replace />;
  return <>{children}</>;
}

const admin = (element: ReactNode) => <RequireStaff adminOnly>{element}</RequireStaff>;

const shell = (element: ReactNode) => (
  <RequireAttendee>
    <AppShell>{element}</AppShell>
  </RequireAttendee>
);

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Cover />} />
        <Route path="/conocer" element={<Conocer />} />
        <Route path="/login" element={<Login />} />
        <Route path="/registro" element={<Registro />} />
        <Route path="/p/:token" element={<Registro />} />
        <Route path="/staff" element={<RequireStaff><Staff /></RequireStaff>} />
        <Route path="/cuenta/contrasena" element={<RequireStaff><CambiarContrasena /></RequireStaff>} />
        <Route path="/admin" element={admin(<Navigate to={ADMIN_HOME} replace />)} />
        {/* La ruta de cada sección va ANTES del catch-all "/admin/*" de abajo;
            si se agrega después, React Router la manda a ADMIN_HOME en silencio. */}
        <Route path="/admin/dashboard" element={admin(<Dashboard />)} />
        {/* Ruta vieja (hasta el 2 oct 2026): por si queda algún enlace o marcador guardado. */}
        <Route path="/admin/resumen" element={admin(<Navigate to="/admin/dashboard" replace />)} />
        <Route path="/admin/lotes" element={admin(<Lotes />)} />
        <Route path="/admin/lotes/:id" element={admin(<LoteDetalle />)} />
        <Route path="/admin/asistentes" element={admin(<Asistentes />)} />
        <Route path="/admin/asistentes/:id" element={admin(<AsistenteDetalle />)} />
        <Route path="/admin/canjes" element={admin(<Canjes />)} />
        <Route path="/admin/menu" element={admin(<Menu />)} />
        <Route path="/admin/merch" element={admin(<Merch />)} />
        <Route path="/admin/notas" element={admin(<Notas />)} />
        <Route path="/admin/avisos" element={admin(<Avisos />)} />
        <Route path="/admin/auditoria" element={admin(<Auditoria />)} />
        <Route path="/admin/usuarios" element={admin(<Usuarios />)} />
        <Route path="/admin/mas" element={admin(<AdminMas />)} />
        <Route path="/admin/*" element={admin(<Navigate to={ADMIN_HOME} replace />)} />
        {/* /home es la pantalla de inicio del asistente (5 oct 2026). La
            pantalla anterior (pages/Inicio.tsx) ya no se muestra: /inicio
            redirige aquí para no romper enlaces o marcadores guardados. */}
        <Route path="/inicio" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={shell(<Home />)} />
        <Route path="/homev2" element={shell(<Suspense fallback={null}><HomeV2 /></Suspense>)} />
        {/* "Ver todo" de la vitrina de Mercancía (4 oct 2026): página propia,
            no un modal/hoja -- ver nota en MerchCarousel.tsx. */}
        <Route path="/home/mercancia" element={shell(<MerchGallery />)} />
        {/* Propuesta visual aislada del Menú de alimentos (3 oct 2026): NO
            reemplaza /comida todavía, ni está enlazada en el nav. Ver
            data/menuPreview.ts y docs/CLAUDE_HANDOFF.md. */}
        <Route path="/menu-preview" element={shell(<MenuPreview />)} />
        <Route path="/programa" element={shell(<Programa />)} />
        <Route path="/beneficios" element={shell(<Beneficios />)} />
        <Route path="/comida" element={shell(<Comida />)} />
        <Route path="/instantaneas" element={shell(<Instantaneas />)} />
        <Route path="/recursos" element={shell(<Recursos />)} />
        <Route path="/mas" element={shell(<Mas />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
