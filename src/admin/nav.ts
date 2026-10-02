import { Boxes, ClipboardList, CupSoda, Images, LayoutDashboard, Package, UserCog, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Secciones del panel de Admin. `stage` = etapa del plan en la que se
 * construye; mientras no esté lista se muestra deshabilitada con su etapa
 * (no hay pantallas falsas ni datos de ejemplo en el panel real).
 *
 * Plan oficial (1 oct 2026). El Dashboard va a propósito al final: se construye
 * cuando Lotes, Asistentes, Paquetes y Canje de bebidas ya tengan datos reales.
 *
 *   1 Base/Autenticacion  COMPLETADA      6 Canje de bebidas   PENDIENTE (motor listo)
 *   2 Usuarios            COMPLETADA      7 Dashboard         COMPLETADA (v1, 1 oct 2026)
 *   3 Lotes               COMPLETADA      8 Auditoria         PENDIENTE
 *   4 Asistentes          COMPLETADA      9 Instantaneas      PENDIENTE
 *   5 Paquetes            PENDIENTE
 *
 * Etapa 6 (Canje de bebidas), parte Admin -- COMPLETADA (1 oct 2026): listado
 * con filtros/paginación y anulación con motivo en `/admin/canjes`. El motor
 * de canje en sí (`/api/staff/redeem`) ya existía.
 *
 * `ADMIN_HOME` usa `.find(s => s.ready)` (el primero LISTO del array). Desde
 * la Etapa 7 el Dashboard (`/admin/dashboard`, antes `/admin/resumen` hasta
 * el 2 oct 2026) es el primero listo, así que `/admin`, el login de Admin y
 * cualquier ruta /admin/* desconocida llegan al Dashboard (pedido del
 * usuario: "el Dashboard de /admin"). Antes llegaban a Lotes. Si se quiere
 * otra pantalla de inicio, cambiar `ready` u ADMIN_HOME.
 */
export type AdminSection = {
  to: string;
  label: string;
  Icon: LucideIcon;
  ready: boolean;
  stage?: string;
  /** true = aparece en la barra inferior del celular; si no, va en "Más". */
  primary?: boolean;
};

export const ADMIN_SECTIONS: AdminSection[] = [
  { to: '/admin/dashboard', label: 'Dashboard', Icon: LayoutDashboard, ready: true, primary: true },
  { to: '/admin/lotes', label: 'Lotes', Icon: Boxes, ready: true, primary: true },
  { to: '/admin/asistentes', label: 'Asistentes', Icon: Users, ready: true, primary: true },
  { to: '/admin/paquetes', label: 'Kits', Icon: Package, ready: false, stage: 'Etapa 5' },
  { to: '/admin/canjes', label: 'Canjes', Icon: CupSoda, ready: true },
  { to: '/admin/usuarios', label: 'Usuarios', Icon: UserCog, ready: true },
  { to: '/admin/auditoria', label: 'Auditoría', Icon: ClipboardList, ready: false, stage: 'Etapa 8' },
  { to: '/admin/instantaneas', label: 'Instantáneas', Icon: Images, ready: false, stage: 'Etapa 9' },
];

/** Primera sección construida: a donde llega Admin al iniciar sesión. */
export const ADMIN_HOME = ADMIN_SECTIONS.find((s) => s.ready)!.to;
