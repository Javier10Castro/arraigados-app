import { Boxes, Church, Gift, ClipboardList, CupSoda, LayoutDashboard, Megaphone, Package, ShoppingBag, StickyNote, UserCog, Users, UtensilsCrossed } from 'lucide-react';
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
 *   (8 Auditoria: COMPLETADA el 5 oct 2026, solo lectura -- ver abajo)
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
  /* Beneficios (6 oct 2026): lo que incluye cada kit (lista "Incluye" del asistente), administrable. Las aguas frescas siguen siendo del kit. */
  { to: '/admin/beneficios', label: 'Beneficios', Icon: Gift, ready: true },
  { to: '/admin/canjes', label: 'Canjes', Icon: CupSoda, ready: true },
  { to: '/admin/menu', label: 'Menú', Icon: UtensilsCrossed, ready: true },
  /* Mercancía (3 oct 2026, conectada a datos reales el mismo día): CRUD
     completo de la vitrina de /home, mismo patrón que "Menú" -- Neon +
     Netlify Blobs (ver migrations/004_merch.sql y server/merch.ts). */
  { to: '/admin/merch', label: 'Mercancía', Icon: ShoppingBag, ready: true },
  /* Notas (5 oct 2026): revisión de solo lectura de las notas de /home. */
  { to: '/admin/notas', label: 'Notas', Icon: StickyNote, ready: true },
  /* Avisos (5 oct 2026): mensajes del equipo que salen en la campana de /home (Fase 1 de notificaciones). */
  { to: '/admin/avisos', label: 'Avisos', Icon: Megaphone, ready: true },
  /* Iglesias (6 oct 2026): CRUD de iglesias; presbiterios y zonas fijos. */
  { to: '/admin/iglesias', label: 'Iglesias', Icon: Church, ready: true },
  { to: '/admin/usuarios', label: 'Usuarios', Icon: UserCog, ready: true },
  /* Auditoría (Etapa 8, 5 oct 2026): bitácora de solo lectura sobre "AuditLog". */
  { to: '/admin/auditoria', label: 'Auditoría', Icon: ClipboardList, ready: true },
  /* Instantáneas OCULTO (6 oct 2026; Etapa 9 sin construir). Para volver a mostrarlo: importar `Images` de lucide-react y descomentar:
  { to: '/admin/instantaneas', label: 'Instantáneas', Icon: Images, ready: false, stage: 'Etapa 9' }, */
];

/** Primera sección construida: a donde llega Admin al iniciar sesión. */
export const ADMIN_HOME = ADMIN_SECTIONS.find((s) => s.ready)!.to;
