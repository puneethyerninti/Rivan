import { storage } from "@/lib/storage";

const TOKEN_KEY = "rivan_token";
const REFRESH_TOKEN_KEY = "rivan_refresh_token";

function env(name: string) {
  return String(import.meta.env[name] || "").trim().replace(/^['"]|['"]$/g, "");
}

const BASE_URL = (env("EXPO_PUBLIC_BACKEND_URL") || "https://rivan.onrender.com").replace(/\/+$/, "");

export async function getToken() {
  return storage.get(TOKEN_KEY);
}

export async function setToken(token: string) {
  storage.set(TOKEN_KEY, token);
}

export async function getRefreshToken() {
  return storage.get(REFRESH_TOKEN_KEY);
}

export async function setRefreshToken(token: string) {
  storage.set(REFRESH_TOKEN_KEY, token);
}

export async function clearToken() {
  storage.remove(TOKEN_KEY);
  storage.remove(REFRESH_TOKEN_KEY);
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: any;
  auth?: boolean;
  query?: Record<string, string | number | undefined | null>;
  allowRefresh?: boolean;
};

async function refreshAuthSession() {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;
  try {
    const response = await apiRequest<{ access_token: string; refresh_token: string }>("/auth/refresh", {
      method: "POST",
      body: { refresh_token: refreshToken },
      auth: false,
      allowRefresh: false,
    });
    await setToken(response.access_token);
    await setRefreshToken(response.refresh_token);
    return response.access_token;
  } catch {
    await clearToken();
    return null;
  }
}

export async function apiRequest<T = any>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, query, allowRefresh = true } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let url = `${BASE_URL}/api${path}`;
  if (query) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") params.append(key, String(value));
    });
    const q = params.toString();
    if (q) url += `?${q}`;
  }

  const response = await fetch(url, {
    method,
    credentials: "include",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    if (response.status === 401 && auth && allowRefresh && path !== "/auth/refresh") {
      const nextToken = await refreshAuthSession();
      if (nextToken) return apiRequest<T>(path, { ...opts, allowRefresh: false });
    }
    const text = await response.text().catch(() => "");
    try {
      const parsed = JSON.parse(text);
      throw new Error(parsed.detail || parsed.message || text || `HTTP ${response.status}`);
    } catch {
      throw new Error(text || `HTTP ${response.status}`);
    }
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  health: () => apiRequest("/health", { auth: false }),
  me: () => apiRequest("/auth/me"),
  updateProfile: (data: any) => apiRequest("/auth/profile", { method: "PUT", body: data }),
  firebaseAuth: (id_token: string, phone: string, name?: string) =>
    apiRequest<{ access_token: string; refresh_token: string; user: any }>("/auth/firebase", {
      method: "POST",
      body: { id_token, phone, name },
      auth: false,
    }),
  agentFirebaseAuth: (id_token: string, phone: string) =>
    apiRequest<{ access_token: string; refresh_token: string; user: any }>("/auth/agent/firebase", {
      method: "POST",
      body: { id_token, phone },
      auth: false,
    }),
  adminFirebaseAuth: (id_token: string, phone: string) =>
    apiRequest<{ access_token: string; refresh_token: string; user: any }>("/auth/admin/firebase", {
      method: "POST",
      body: { id_token, phone },
      auth: false,
    }),
  agentAccessStatus: (phone: string) =>
    apiRequest<any>("/auth/agent/status", { method: "POST", body: { phone }, auth: false }),
  adminAccessStatus: (phone: string) =>
    apiRequest<any>("/auth/admin/status", { method: "POST", body: { phone }, auth: false }),
  agentApply: (body: any) => apiRequest<any>("/auth/agent/apply", { method: "POST", body, auth: false }),
  logoutAuth: (refresh_token: string) =>
    apiRequest("/auth/logout", { method: "POST", body: { refresh_token }, auth: false, allowRefresh: false }),

  listProperties: (filters?: any) => apiRequest("/properties", { auth: false, query: filters }),
  featured: () => apiRequest("/properties/featured", { auth: false }),
  getProperty: (id: string) => apiRequest(`/properties/${id}`, { auth: false }),
  getPropertyPlots: (id: string) => apiRequest(`/properties/${id}/plots`, { auth: false }),
  getPlot: (id: string) => apiRequest(`/plots/${id}`, { auth: false }),

  centres: () => apiRequest("/centres", { auth: false }),
  getCentre: (id: string) => apiRequest(`/centres/${id}`, { auth: false }),
  bookCentreVisit: (body: any) => apiRequest("/visits/centre", { method: "POST", body }),
  bookSiteVisit: (body: any) => apiRequest("/visits/site", { method: "POST", body }),
  myVisits: () => apiRequest("/visits/mine"),

  createBooking: (body: any) => apiRequest("/bookings", { method: "POST", body }),
  myBookings: () => apiRequest("/bookings/mine"),
  myLand: () => apiRequest("/myland"),
  paymentsSummary: () => apiRequest("/payments/summary"),
  installments: () => apiRequest("/payments/installments"),
  paymentHistory: () => apiRequest("/payments/history"),
  documents: () => apiRequest("/documents"),
  wishlist: () => apiRequest("/wishlist"),
  toggleWishlist: (property_id: string) => apiRequest("/wishlist/toggle", { method: "POST", body: { property_id } }),
  notifications: () => apiRequest("/notifications"),
  readNotification: (id: string) => apiRequest(`/notifications/${id}/read`, { method: "POST" }),
  readAllNotifications: () => apiRequest("/notifications/read-all", { method: "POST" }),
  servicesCatalog: () => apiRequest("/services/catalog", { auth: false }),
  requestService: (body: any) => apiRequest("/services/request", { method: "POST", body }),
  myServices: () => apiRequest("/services/mine"),

  adminOverview: () => apiRequest("/admin/overview"),
  adminStats: () => apiRequest("/admin/stats"),
  adminUsers: () => apiRequest("/admin/users"),
  adminBookings: () => apiRequest("/admin/bookings"),
  adminAgents: () => apiRequest("/admin/agents"),
  adminServiceRequests: () => apiRequest("/admin/service-requests"),
  adminCrmDashboard: () => apiRequest("/crm/dashboard/admin"),
  adminConfirmBooking: (id: string) => apiRequest(`/admin/bookings/${id}/confirm`, { method: "POST" }),
  adminApproveAgent: (id: string) => apiRequest(`/admin/agents/${id}/approve`, { method: "POST" }),
  adminUpdateAgentStatus: (id: string, approval_status: string, review_notes?: string) =>
    apiRequest(`/admin/agents/${id}/status`, { method: "POST", body: { approval_status, review_notes } }),
  adminUpdateVisitStatus: (id: string, status: string, review_notes?: string) =>
    apiRequest(`/admin/visits/${id}/status`, { method: "POST", body: { status, review_notes } }),
  adminUpdateServiceRequestStatus: (id: string, status: string) =>
    apiRequest(`/admin/service-requests/${id}/status`, { method: "POST", query: { status_val: status } }),

  agentDashboard: () => apiRequest("/agent/dashboard"),
  agentSiteVisits: () => apiRequest("/agent/site-visits"),
  agentCreateBooking: (body: any) => apiRequest("/agent/bookings", { method: "POST", body }),
  customerRelationship: () => apiRequest("/crm/customer-relationship"),
};
