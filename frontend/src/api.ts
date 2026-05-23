// API client for Rivan Reality
import { storage } from "@/src/utils/storage";

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "";
const TOKEN_KEY = "rivan_token";

export async function getToken(): Promise<string | null> {
  const t = await storage.secureGet(TOKEN_KEY, "");
  return t && typeof t === "string" ? t : null;
}

export async function setToken(token: string) {
  await storage.secureSet(TOKEN_KEY, token);
}

export async function clearToken() {
  await storage.secureRemove(TOKEN_KEY);
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: any;
  auth?: boolean;
  query?: Record<string, string | number | undefined | null>;
};

export async function apiRequest<T = any>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, query } = opts;
  let url = `${BASE_URL}/api${path}`;
  if (query) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") params.append(k, String(v));
    });
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = await getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    let detail = errText;
    try {
      const j = JSON.parse(errText);
      detail = j.detail || j.message || errText;
    } catch (_e) { /* keep raw */ }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as any;
  return (await res.json()) as T;
}

export const api = {
  // Auth
  sendOtp: (phone: string) => apiRequest("/auth/send-otp", { method: "POST", body: { phone }, auth: false }),
  verifyOtp: (phone: string, otp: string, name?: string) =>
    apiRequest<{ access_token: string; user: any }>("/auth/verify-otp", { method: "POST", body: { phone, otp, name }, auth: false }),
  me: () => apiRequest("/auth/me"),
  updateProfile: (data: any) => apiRequest("/auth/profile", { method: "PUT", body: data }),

  // Properties
  listProperties: (filters?: any) => apiRequest("/properties", { auth: false, query: filters }),
  featured: () => apiRequest("/properties/featured", { auth: false }),
  getProperty: (id: string) => apiRequest(`/properties/${id}`, { auth: false }),
  getPropertyPlots: (id: string) => apiRequest(`/properties/${id}/plots`, { auth: false }),
  getPlot: (id: string) => apiRequest(`/plots/${id}`, { auth: false }),

  // Bookings
  createBooking: (body: any) => apiRequest("/bookings", { method: "POST", body }),
  myBookings: () => apiRequest("/bookings/mine"),

  // My Land
  myLand: () => apiRequest("/myland"),
  canRequestServices: () => apiRequest("/myland/can-request-services"),

  // Payments
  paymentsSummary: () => apiRequest("/payments/summary"),
  installments: () => apiRequest("/payments/installments"),
  paymentHistory: () => apiRequest("/payments/history"),
  payInstallment: (id: string) => apiRequest("/payments/pay", { method: "POST", body: { installment_id: id } }),

  // Documents
  documents: () => apiRequest("/documents"),

  // Services
  servicesCatalog: () => apiRequest("/services/catalog", { auth: false }),
  requestService: (body: any) => apiRequest("/services/request", { method: "POST", body }),
  myServices: () => apiRequest("/services/mine"),

  // Centres & Visits
  centres: () => apiRequest("/centres", { auth: false }),
  getCentre: (id: string) => apiRequest(`/centres/${id}`, { auth: false }),
  bookCentreVisit: (body: any) => apiRequest("/visits/centre", { method: "POST", body }),
  bookSiteVisit: (body: any) => apiRequest("/visits/site", { method: "POST", body }),
  myVisits: () => apiRequest("/visits/mine"),

  // Wishlist
  toggleWishlist: (property_id: string) => apiRequest("/wishlist/toggle", { method: "POST", body: { property_id } }),
  wishlist: () => apiRequest("/wishlist"),

  // Notifications
  notifications: () => apiRequest("/notifications"),
  readNotification: (id: string) => apiRequest(`/notifications/${id}/read`, { method: "POST" }),
  readAllNotifications: () => apiRequest("/notifications/read-all", { method: "POST" }),

  // Admin
  adminStats: () => apiRequest("/admin/stats"),
  adminUsers: () => apiRequest("/admin/users"),
  adminBookings: () => apiRequest("/admin/bookings"),
  adminConfirmBooking: (id: string) => apiRequest(`/admin/bookings/${id}/confirm`, { method: "POST" }),
  adminServices: () => apiRequest("/admin/service-requests"),
  adminUpdateService: (id: string, status_val: string) =>
    apiRequest(`/admin/service-requests/${id}/status`, { method: "POST", query: { status_val } }),
};
