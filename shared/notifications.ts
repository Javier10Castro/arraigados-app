import type { PageSize } from './api';

/**
 * Notificaciones (5 oct 2026) -- tipos compartidos servidor/cliente.
 * Fase 1: avisos del equipo (/admin/avisos) y campana de /home. Ver docs/PLAN_PENDIENTES.md §10.
 */

export const ANNOUNCEMENT_TITLE_MAX = 60;
export const ANNOUNCEMENT_BODY_MAX = 280;
/** La campana muestra como máximo las últimas N notificaciones. */
export const NOTIFICATIONS_MAX = 30;

/** 'ALL' = todos. La sede del domingo sale de la zona (Zona 1 -> 21ra, Zona 2 -> 12va). */
export type AnnouncementAudience = 'ALL' | 'Zona 1' | 'Zona 2';
export const ANNOUNCEMENT_AUDIENCES: AnnouncementAudience[] = ['ALL', 'Zona 1', 'Zona 2'];

/** Misma regla que data/program.ts resolveZoneForDisplay: un dato faltante cuenta como Zona 1. */
export const zoneAudienceOf = (zoneName: string | null | undefined): 'Zona 1' | 'Zona 2' =>
  zoneName === 'Zona 2' ? 'Zona 2' : 'Zona 1';

export type AnnouncementStatus = 'PROGRAMADO' | 'PUBLICADO' | 'RETIRADO';

/* ---- Campana del asistente ---- */

export type AppNotification =
  | {
      id: string;
      kind: 'announcement';
      title: string;
      body: string;
      /** Etiqueta roja "EN VIVO" (la marca el Admin al crear el aviso). */
      live: boolean;
      /** Hora de publicación (ISO UTC). */
      at: string;
      /** true si llegó después de la última vez que abrió la campana. */
      unread: boolean;
    }
  | {
      /** id = id de la nota que recibió los likes (una fila por nota, agrupada). */
      id: string;
      kind: 'like';
      /** Primer nombre y id de quien dio el like MÁS RECIENTE (para el avatar; nunca más datos). */
      likerAttendeeId: string;
      likerFirstName: string;
      /** Total de likes de esa nota (la fila dice "Ana y N más"). */
      count: number;
      /** Hora del like más reciente. */
      at: string;
      unread: boolean;
    };
/** GET /api/notifications (x-pulse-token) */
export type NotificationsResponse = { items: AppNotification[]; unread: number };

/* ---- Admin ---- */

export type AdminAnnouncementFilters = { status?: AnnouncementStatus | ''; page?: number; pageSize?: PageSize };

export type AdminAnnouncementRow = {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  publishAt: string;
  retiredAt: string | null;
  createdAt: string;
  createdByName: string | null;
  live: boolean;
  status: AnnouncementStatus;
};

export type AdminAnnouncementsResponse = {
  total: number;
  page: number;
  pageSize: number;
  rows: AdminAnnouncementRow[];
  /** Totales de TODOS los avisos, sin filtro. */
  summary: { published: number; scheduled: number; retired: number };
};

/** POST /api/admin/announcements. `publishAt` ISO UTC; vacío = publicar ahora. */
export type CreateAnnouncementRequest = {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  /** Mostrar la etiqueta "EN VIVO". */
  live?: boolean;
  publishAt?: string;
};
export type CreateAnnouncementResponse = { id: string; status: AnnouncementStatus };
export type RetireAnnouncementResponse = { outcome: 'ok' | 'already_retired' };
