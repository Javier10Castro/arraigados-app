import type { AdminAuditFilters, AdminAuditResponse } from '../../shared/audit';
import type {
  AdminAnnouncementFilters,
  AdminAnnouncementsResponse,
  CreateAnnouncementRequest,
  CreateAnnouncementResponse,
  NotificationsResponse,
  RetireAnnouncementResponse,
} from '../../shared/notifications';
import {
  PULSE_TOKEN_HEADER,
  type ApiError,
  type Church,
  type ClaimRequest,
  type ClaimResponse,
  type MeResponse,
  type PackageSummary,
  type PulseStatusResponse,
  type AdminAttendeeDetail,
  type AdminAttendeeFilters,
  type AdminAttendeesCatalog,
  type AdminAttendeesResponse,
  type UpdateAttendeeRequest,
  type ReassignRequest,
  type ReassignResponse,
  type RedeemRequest,
  type RedeemResponse,
  type StaffPulseResponse,
  type StaffSearchResult,
  type StaffUser,
  type AdminUserRow,
  type ChangePasswordRequest,
  type CreateUserRequest,
  type UpdateUserRequest,
  type AdminBatchDetail,
  type BatchPulseFilters,
  type AdminBatchesResponse,
  type CreateBatchRequest,
  type CreateBatchResponse,
  type PaperSize,
  type DashboardFilters,
  type AppSettings,
  type UpdateSettingsRequest,
  type DashboardResponse,
  type AdminRedemptionFilters,
  type AdminRedemptionsCatalog,
  type AdminRedemptionsResponse,
  type VoidRedemptionRequest,
  type VoidRedemptionResponse,
  type StaffHistoryResponse,
  type CreateNoteRequest,
  type CreateNoteResponse,
  type MyNotesResponse,
  type NotesFeedResponse,
  type RemoveNoteResponse,
  type AdminNoteFilters,
  type AdminNotesResponse,
  type AddBlockedWordResponse,
  type BlockedWordsResponse,
  type AdminChurchesResponse,
  type ChurchInput,
  type RetireNoteRequest,
  type RetireNoteResponse,
  type NoteLikersResponse,
  type ToggleNoteLikeResponse,
  type AdminDishesResponse,
  type AdminDishResponse,
  type PublicMenuResponse,
  type AutoImageSearchResponse,
  type AdminMerchResponse,
  type AdminMerchResponseSingle,
  type PublicMerchResponse,
  type MerchReorderRequest,
} from '../../shared/api';

/** Error de la API con el código HTTP y, si aplica, el estado de la pulsera. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    public httpStatus: number,
    public pulseStatus?: PulseStatusResponse['status'],
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: 'same-origin', ...init });
  } catch {
    throw new ApiRequestError('No hay conexión. Revisa tu internet e inténtalo de nuevo.', 0);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Respuesta que no es JSON (p. ej. la app corriendo sin el servidor de funciones).
  }
  if (!res.ok || body === null) {
    const err = (body ?? {}) as Partial<ApiError>;
    const message =
      err.error ??
      (body === null
        ? 'El servidor no respondió. Si estás en desarrollo, corre la app con `netlify dev`.'
        : 'Ocurrió un error. Intenta de nuevo.');
    throw new ApiRequestError(message, res.status, err.status);
  }
  return body as T;
}

export const api = {
  churches: () => request<Church[]>('/api/churches'),
  packages: () => request<PackageSummary[]>('/api/packages'),
  pulseStatus: (token: string) => request<PulseStatusResponse>(`/api/pulse/${encodeURIComponent(token)}`),
  claim: (body: ClaimRequest) =>
    request<ClaimResponse>('/api/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  me: (token: string) => request<MeResponse>('/api/me', { headers: { [PULSE_TOKEN_HEADER]: token } }),

  // Notas (experiencia /home)
  myNotes: (token: string) => request<MyNotesResponse>('/api/notes', { headers: { [PULSE_TOKEN_HEADER]: token } }),
  createNote: (token: string, body: CreateNoteRequest) =>
    request<CreateNoteResponse>('/api/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', [PULSE_TOKEN_HEADER]: token },
      body: JSON.stringify(body),
    }),
  removeMyNote: (token: string) =>
    request<RemoveNoteResponse>('/api/notes', { method: 'DELETE', headers: { [PULSE_TOKEN_HEADER]: token } }),
  notesFeed: (token: string) => request<NotesFeedResponse>('/api/notes/feed', { headers: { [PULSE_TOKEN_HEADER]: token } }),
  noteLikers: (token: string) => request<NoteLikersResponse>('/api/notes/likers', { headers: { [PULSE_TOKEN_HEADER]: token } }),
  toggleNoteLike: (token: string, noteId: string) =>
    request<ToggleNoteLikeResponse>(`/api/notes/${encodeURIComponent(noteId)}/like`, {
      method: 'POST',
      headers: { [PULSE_TOKEN_HEADER]: token },
    }),

  // Staff / Admin (sesión por cookie httpOnly)
  login: (body: { email: string; password: string }) => postJson<StaffUser>('/api/auth/login', body),
  logout: () => postJson<{ ok: true }>('/api/auth/logout', {}),
  staffMe: () => request<StaffUser>('/api/auth/me'),
  changePassword: (body: ChangePasswordRequest) => postJson<StaffUser>('/api/auth/password', body),
  staffPulse: (by: { token: string } | { code: string }) =>
    request<StaffPulseResponse>(
      'token' in by ? `/api/staff/pulse?token=${encodeURIComponent(by.token)}` : `/api/staff/pulse?code=${encodeURIComponent(by.code)}`,
    ),
  staffSearch: (q: string, churchId: string) =>
    request<StaffSearchResult[]>(`/api/staff/search?q=${encodeURIComponent(q)}&churchId=${encodeURIComponent(churchId)}`),
  redeem: (body: RedeemRequest) => postJson<RedeemResponse>('/api/staff/redeem', body),
  reassign: (body: ReassignRequest) => postJson<ReassignResponse>('/api/staff/reassign', body),
  staffHistory: () => request<StaffHistoryResponse>('/api/staff/history'),

  // Admin -> Canjes (Etapa 6, parte Admin)
  adminRedemptions: (f: AdminRedemptionFilters) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '' && v !== 0) qs.set(k, String(v));
    const s = qs.toString();
    return request<AdminRedemptionsResponse>(`/api/admin/redemptions${s ? `?${s}` : ''}`);
  },
  redemptionsCatalog: () => request<AdminRedemptionsCatalog>('/api/admin/redemptions/catalog'),
  voidRedemption: (id: string, body: VoidRedemptionRequest) =>
    postJson<VoidRedemptionResponse>(`/api/admin/redemptions/${encodeURIComponent(id)}/void`, body),

  // Admin -> Notas (solo lectura)
  adminNotes: (f: AdminNoteFilters) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '' && v !== 0) qs.set(k, String(v));
    const s = qs.toString();
    return request<AdminNotesResponse>(`/api/admin/notes${s ? `?${s}` : ''}`);
  },

  // Admin -> Auditoría (solo lectura)
  adminAudit: (f: AdminAuditFilters) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '' && v !== 0) qs.set(k, String(v));
    const s = qs.toString();
    return request<AdminAuditResponse>(`/api/admin/audit${s ? `?${s}` : ''}`);
  },
  retireNote: (id: string, body: RetireNoteRequest) =>
    postJson<RetireNoteResponse>(`/api/admin/notes/${encodeURIComponent(id)}/retire`, body),
  notifications: (token: string) =>
    request<NotificationsResponse>('/api/notifications', { headers: { [PULSE_TOKEN_HEADER]: token } }),
  notificationsSeen: (token: string) =>
    request<{ ok: true }>('/api/notifications/seen', { method: 'POST', headers: { [PULSE_TOKEN_HEADER]: token } }),
  adminAnnouncements: (f: AdminAnnouncementFilters) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '' && v !== 0) qs.set(k, String(v));
    const s = qs.toString();
    return request<AdminAnnouncementsResponse>(`/api/admin/announcements${s ? `?${s}` : ''}`);
  },
  createAnnouncement: (body: CreateAnnouncementRequest) =>
    postJson<CreateAnnouncementResponse>('/api/admin/announcements', body),
  retireAnnouncement: (id: string) =>
    postJson<RetireAnnouncementResponse>(`/api/admin/announcements/${encodeURIComponent(id)}/retire`, {}),
  blockedWords: () => request<BlockedWordsResponse>('/api/admin/blocked-words'),
  addBlockedWord: (word: string) => postJson<AddBlockedWordResponse>('/api/admin/blocked-words', { word }),
  updateBlockedWord: (id: string, word: string) =>
    request<{ outcome: 'ok'; word: string }>(`/api/admin/blocked-words/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ word }),
    }),
  removeBlockedWord: (id: string) =>
    request<{ outcome: 'ok' }>(`/api/admin/blocked-words/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Admin -> Iglesias (CRUD; presbiterios y zonas son de solo lectura)
  adminChurches: () => request<AdminChurchesResponse>('/api/admin/churches'),
  createChurch: (body: ChurchInput) => postJson<{ id: string }>('/api/admin/churches', body),
  updateChurch: (id: string, body: ChurchInput) =>
    request<{ ok: true }>(`/api/admin/churches/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteChurch: (id: string) =>
    request<{ ok: true }>(`/api/admin/churches/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Admin -> Usuarios
  adminUsers: () => request<AdminUserRow[]>('/api/admin/users'),
  createUser: (body: CreateUserRequest) => postJson<{ id: string }>('/api/admin/users', body),
  updateUser: (id: string, body: UpdateUserRequest) =>
    request<{ ok: true }>(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  resetUserPassword: (id: string, temporaryPassword: string) =>
    postJson<{ ok: true }>(`/api/admin/users/${encodeURIComponent(id)}/password`, { temporaryPassword }),

  // Admin -> Menú (3 oct 2026). Crear/editar van por FormData (multipart),
  // no JSON, porque pueden llevar el archivo de la foto -- ver shared/api.ts.
  adminDishes: () => request<AdminDishesResponse>('/api/admin/dishes'),
  adminCreateDish: (form: FormData) => postForm<AdminDishResponse>('/api/admin/dishes', form),
  adminUpdateDish: (id: string, form: FormData) => patchForm<AdminDishResponse>(`/api/admin/dishes/${encodeURIComponent(id)}`, form),
  adminDeleteDish: (id: string) => request<{ ok: true }>(`/api/admin/dishes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  adminSearchDishImage: (searchQuery: string, exclude: string[] = []) =>
    postJson<AutoImageSearchResponse>('/api/admin/dish-image-search', { query: searchQuery, exclude }),
  // Pública -- lista aquí para cuando el carrusel de /home la conecte (siguiente fase).
  menu: () => request<PublicMenuResponse>('/api/menu'),

  // Admin -> Mercancía (3 oct 2026). Igual patrón que Menú: crear/editar van
  // por FormData porque pueden llevar fotos (varias, a diferencia de Menú) --
  // ver shared/api.ts.
  adminMerch: () => request<AdminMerchResponse>('/api/admin/merch'),
  adminCreateMerch: (form: FormData) => postForm<AdminMerchResponseSingle>('/api/admin/merch', form),
  adminUpdateMerch: (id: string, form: FormData) => patchForm<AdminMerchResponseSingle>(`/api/admin/merch/${encodeURIComponent(id)}`, form),
  adminDeleteMerch: (id: string) => request<{ ok: true }>(`/api/admin/merch/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  adminReorderMerch: (id: string, dir: MerchReorderRequest['dir']) =>
    postJson<{ ok: true }>(`/api/admin/merch/${encodeURIComponent(id)}/reorder`, { dir }),
  // Pública -- la consume la vitrina de Merch en /home (MerchCarousel.tsx).
  merch: () => request<PublicMerchResponse>('/api/merch'),

  // Admin -> Lotes (Etapa 3)
  adminBatches: () => request<AdminBatchesResponse>('/api/admin/batches'),
  nextBatchCode: () => request<{ code: string; min: number; max: number }>('/api/admin/batches/next-code'),
  createBatch: (body: CreateBatchRequest) => postJson<CreateBatchResponse>('/api/admin/batches', body),
  adminBatch: (id: string, f: BatchPulseFilters = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '' && v !== 0) qs.set(k, String(v));
    const s = qs.toString();
    return request<AdminBatchDetail>(`/api/admin/batches/${encodeURIComponent(id)}${s ? `?${s}` : ''}`);
  },

  // Admin -> Asistentes (Etapa 4)
  adminAttendees: (f: AdminAttendeeFilters) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '' && v !== 0) qs.set(k, String(v));
    const s = qs.toString();
    return request<AdminAttendeesResponse>(`/api/admin/attendees${s ? `?${s}` : ''}`);
  },
  // Configuración global (lectura pública; cambio solo ADMIN)
  settings: () => request<AppSettings>('/api/settings'),
  updateSettings: (body: UpdateSettingsRequest) =>
    request<AppSettings>('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),

  // Admin -> Dashboard (Etapa 7)
  dashboard: (f: DashboardFilters) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v && !(k === 'period' && v === 'all')) qs.set(k, String(v));
    const s = qs.toString();
    return request<DashboardResponse>(`/api/admin/dashboard${s ? `?${s}` : ''}`);
  },
  attendeesCatalog: () => request<AdminAttendeesCatalog>('/api/admin/attendees/catalog'),
  adminAttendee: (id: string) => request<AdminAttendeeDetail>(`/api/admin/attendees/${encodeURIComponent(id)}`),
  updateAttendee: (id: string, body: UpdateAttendeeRequest) =>
    request<{ changed: boolean }>(`/api/admin/attendees/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
};

/** Rutas binarias: se piden con fetch porque devuelven PDF/PNG, no JSON. */
export const batchFileUrls = {
  pdf: (id: string, size: PaperSize) =>
    `/api/admin/batches/${encodeURIComponent(id)}/pdf?size=${encodeURIComponent(size)}`,
  qr: (id: string, pulseId: string) =>
    `/api/admin/batches/${encodeURIComponent(id)}/pulses/${encodeURIComponent(pulseId)}/qr`,
};

/**
 * Etapa 4 -> URL de exportación del Dashboard (PDF o Excel). Respeta siempre
 * los filtros activos: mismos query params que `api.dashboard(f)`.
 */
export function dashboardExportUrl(format: 'pdf' | 'xlsx', f: DashboardFilters): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v && !(k === 'period' && v === 'all')) qs.set(k, String(v));
  qs.set('format', format);
  return `/api/admin/dashboard/export?${qs.toString()}`;
}

/**
 * Descarga un archivo binario (PDF / PNG) de una ruta protegida.
 *
 * NO se usa un <a href download> directo: si el servidor responde con error
 * (sesión vencida, falta de dominio, etc.) el navegador guardaría ese JSON de
 * error como si fuera el archivo. Aquí se revisa la respuesta: si no es el tipo
 * esperado se lanza el mensaje del servidor y no se descarga nada.
 */
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function downloadFile(
  path: string,
  expectedType: 'application/pdf' | 'image/png' | typeof XLSX_MIME,
  fallbackName: string,
) {
  let res: Response;
  try {
    res = await fetch(path, { credentials: 'same-origin' });
  } catch {
    throw new ApiRequestError('No hay conexión. Revisa tu internet e inténtalo de nuevo.', 0);
  }
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.startsWith(expectedType)) {
    let message = 'No se pudo generar el archivo. Intenta de nuevo.';
    try {
      const body = (await res.json()) as Partial<ApiError>;
      if (body.error) message = body.error;
    } catch {
      // no era JSON: se queda el mensaje genérico
    }
    throw new ApiRequestError(message, res.status);
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Como postJson, pero con un FormData (crear/editar platillo -- puede llevar un archivo). Sin header content-type: fetch lo arma solo con el boundary correcto. */
function postForm<T>(path: string, form: FormData) {
  return request<T>(path, { method: 'POST', body: form });
}
function patchForm<T>(path: string, form: FormData) {
  return request<T>(path, { method: 'PATCH', body: form });
}

function postJson<T>(path: string, body: unknown) {
  return request<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
