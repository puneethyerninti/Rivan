// API client for Rivan Reality
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { NativeModules, Platform } from "react-native";

import { storage } from "@/src/utils/storage";

function normalizePublicEnv(value?: string) {
  return (value || "").trim().replace(/^['"]|['"]$/g, "");
}

const ENV_BACKEND_URL = normalizePublicEnv(process.env.EXPO_PUBLIC_BACKEND_URL);
const HOSTED_PRODUCTION_BACKEND_URL = "https://rivan.onrender.com";
const TOKEN_KEY = "rivan_token";
const GET_CACHE_TTL_MS = 120000;
const REQUEST_TIMEOUT_MS = 20000;
const BACKEND_WAKE_TIMEOUT_MS = 45000;
const BACKEND_WAKE_POLL_MS = 3000;
const PERSISTED_CACHE_PREFIX = "rivan_get_cache:";
const responseCache = new Map<string, { expiresAt: number; value: unknown }>();
const warmedBaseUrls = new Set<string>();
const backendWarmupPromises = new Map<string, Promise<void>>();

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: any;
  auth?: boolean;
  query?: Record<string, string | number | undefined | null>;
};

function parseHost(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const normalized = trimmed.includes("://") ? trimmed : `http://${trimmed}`;
    const url = new URL(normalized);
    if (url.hostname) return url.hostname;
  } catch {
    // Fall back to lightweight parsing below.
  }

  const withoutScheme = trimmed.replace(/^[a-z]+:\/\//i, "");
  const withoutPath = withoutScheme.split("/")[0];
  const withoutExpoSuffix = withoutPath.split("--")[0];
  const host = withoutExpoSuffix.split(":")[0];
  return host || null;
}

function inferBackendUrl() {
  if (typeof window !== "undefined" && window.location?.hostname && Platform.OS === "web") {
    const host = window.location.hostname;
    if (window.location.protocol === "https:") return "";
    return `http://${host}:8000`;
  }

  const scriptURL = (NativeModules as any)?.SourceCode?.scriptURL;
  const hostCandidates = [
    (Constants.expoConfig as any)?.hostUri,
    (Constants as any)?.expoGoConfig?.debuggerHost,
    (Constants as any)?.manifest2?.extra?.expoClient?.hostUri,
    (Constants as any)?.manifest?.debuggerHost,
    Linking.createURL("/"),
    scriptURL,
  ];

  for (const candidate of hostCandidates) {
    const host = parseHost(candidate);
    if (host) return `http://${host}:8000`;
  }

  return "http://127.0.0.1:8000";
}

function normalizeBaseUrl(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/, "");
}

function isEphemeralBackendUrl(value: string) {
  return /trycloudflare\.com|preview\.emergentagent\.com/i.test(value);
}

function isLocalBackendUrl(value: string) {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(value);
}

function isHostedHttpsWeb() {
  return (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    !["localhost", "127.0.0.1"].includes(window.location.hostname)
  );
}

function canUseBackendCandidate(value: string, source: "env" | "override" | "inferred") {
  if (!value) return false;
  if (!isHostedHttpsWeb()) return true;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (source === "env" && isEphemeralBackendUrl(value)) return false;
    if (isLocalBackendUrl(value)) return false;
    return true;
  } catch {
    return false;
  }
}

function shouldPreferNativeInference(envBackendUrl: string, inferredUrl: string) {
  if (Platform.OS === "web") return false;
  if (!inferredUrl) return false;
  if (!envBackendUrl) return true;
  return isLocalBackendUrl(envBackendUrl) || isEphemeralBackendUrl(envBackendUrl);
}

function getWebBackendOverride() {
  if (typeof window === "undefined" || Platform.OS !== "web") return "";

  try {
    const params = new URLSearchParams(window.location.search);
    const queryValue = params.get("backendUrl")?.trim() || "";
    if (queryValue) {
      window.localStorage.setItem("rivan_backend_url", queryValue);
      return queryValue;
    }

    return window.localStorage.getItem("rivan_backend_url")?.trim() || "";
  } catch {
    return "";
  }
}

function buildCandidateBaseUrls() {
  const candidates = new Set<string>();
  const normalizedEnv = normalizeBaseUrl(ENV_BACKEND_URL);
  const normalizedWebOverride = normalizeBaseUrl(getWebBackendOverride());
  const normalizedInferred = normalizeBaseUrl(inferBackendUrl());
  const normalizedHostedFallback = normalizeBaseUrl(isHostedHttpsWeb() ? HOSTED_PRODUCTION_BACKEND_URL : "");

  if (canUseBackendCandidate(normalizedWebOverride, "override")) candidates.add(normalizedWebOverride);

  if (shouldPreferNativeInference(normalizedEnv, normalizedInferred)) {
    if (canUseBackendCandidate(normalizedInferred, "inferred")) candidates.add(normalizedInferred);
    if (canUseBackendCandidate(normalizedEnv, "env")) candidates.add(normalizedEnv);
  } else {
    if (canUseBackendCandidate(normalizedEnv, "env")) candidates.add(normalizedEnv);
    if (canUseBackendCandidate(normalizedInferred, "inferred")) candidates.add(normalizedInferred);
  }

  if (canUseBackendCandidate(normalizedHostedFallback, "env")) candidates.add(normalizedHostedFallback);

  if (!candidates.size && !isHostedHttpsWeb()) candidates.add("http://127.0.0.1:8000");
  return Array.from(candidates);
}

const BASE_URL_CANDIDATES = buildCandidateBaseUrls();
const BASE_URL = BASE_URL_CANDIDATES[0] || "";

function isReachabilityError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("network request failed") ||
    message.includes("load failed") ||
    message.includes("networkerror") ||
    message.includes("abort") ||
    message.includes("temporary_backend_unavailable")
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBackendReady(baseUrl: string) {
  if (!baseUrl || warmedBaseUrls.has(baseUrl)) return;
  const existingWarmup = backendWarmupPromises.get(baseUrl);
  if (existingWarmup) return existingWarmup;

  const warmup = (async () => {
    const deadline = Date.now() + BACKEND_WAKE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${baseUrl}/api/health`, { method: "GET" });
        if (response.ok) {
          warmedBaseUrls.add(baseUrl);
          return;
        }
      } catch {
        // Keep polling until the backend wakes up or the deadline expires.
      }

      await sleep(BACKEND_WAKE_POLL_MS);
    }
  })().finally(() => {
    backendWarmupPromises.delete(baseUrl);
  });

  backendWarmupPromises.set(baseUrl, warmup);
  return warmup;
}

export function warmBackendReady() {
  if (!BASE_URL_CANDIDATES.length) return;

  for (const baseUrl of BASE_URL_CANDIDATES) {
    if (!baseUrl.startsWith("https://") && isHostedHttpsWeb()) continue;
    void waitForBackendReady(baseUrl);
  }
}

async function getPersistedCache<T>(url: string): Promise<T | null> {
  const raw = await storage.getItem(`${PERSISTED_CACHE_PREFIX}${url}`, "");
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as { expiresAt?: number; value?: T };
    if (!parsed?.expiresAt || parsed.expiresAt <= Date.now()) return null;
    return (parsed.value ?? null) as T | null;
  } catch {
    return null;
  }
}

async function setPersistedCache<T>(url: string, value: T) {
  await storage.setItem(
    `${PERSISTED_CACHE_PREFIX}${url}`,
    JSON.stringify({ expiresAt: Date.now() + GET_CACHE_TTL_MS, value })
  );
}

export async function getToken(): Promise<string | null> {
  const token = await storage.secureGet(TOKEN_KEY, "");
  return token && typeof token === "string" ? token : null;
}

export async function setToken(token: string) {
  await storage.secureSet(TOKEN_KEY, token);
}

export async function clearToken() {
  await storage.secureRemove(TOKEN_KEY);
}

export async function apiRequest<T = any>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, query } = opts;

  if (!BASE_URL_CANDIDATES.length) {
    throw new Error(
      "Production backend URL is not configured. Set EXPO_PUBLIC_BACKEND_URL to the deployed HTTPS API origin, then rebuild and redeploy the app."
    );
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const urlForBase = (baseUrl: string) => {
    let url = `${baseUrl}/api${path}`;
    if (query) {
      const params = new URLSearchParams();
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") params.append(key, String(value));
      });
      const queryString = params.toString();
      if (queryString) url += `?${queryString}`;
    }
    return url;
  };

  const isGet = method === "GET";
  const shouldCacheGet =
    isGet &&
    !(path.startsWith("/crm/") || path.startsWith("/agent/") || path.startsWith("/admin/") || path === "/auth/me");
  const primaryUrl = urlForBase(BASE_URL);

  if (shouldCacheGet) {
    const cached = responseCache.get(primaryUrl);
    if (cached && cached.expiresAt > Date.now()) return cached.value as T;

    const persisted = await getPersistedCache<T>(primaryUrl);
    if (persisted !== null) {
      responseCache.set(primaryUrl, { expiresAt: Date.now() + GET_CACHE_TTL_MS, value: persisted });
      return persisted;
    }
  }

  let lastError: unknown = null;
  for (const baseUrl of BASE_URL_CANDIDATES) {
    const url = urlForBase(baseUrl);
    let attemptedWarmup = false;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timeout = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;

      try {
        const res = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller?.signal,
        });
        if (timeout) clearTimeout(timeout);

        if (!res.ok) {
          if ([502, 503, 504, 522, 524].includes(res.status)) {
            throw new Error(`temporary_backend_unavailable:${res.status}`);
          }

          const errText = await res.text().catch(() => "");
          let detail = errText;
          try {
            const parsed = JSON.parse(errText);
            detail = parsed.detail || parsed.message || errText;
          } catch {
            // Keep raw response text.
          }
          throw new Error(detail || `HTTP ${res.status}`);
        }

        if (res.status === 204) return undefined as T;
        const data = (await res.json()) as T;
        warmedBaseUrls.add(baseUrl);
        if (shouldCacheGet) {
          responseCache.set(url, { expiresAt: Date.now() + GET_CACHE_TTL_MS, value: data });
          await setPersistedCache(url, data);
        } else {
          responseCache.clear();
        }
        return data;
      } catch (error: any) {
        if (timeout) clearTimeout(timeout);
        lastError = error;
        if (__DEV__) {
          console.warn(`Rivan API request failed for ${method} ${url}:`, error?.message || error);
        }
        if (!isReachabilityError(error)) throw error;

        const shouldWarmHostedBackend =
          !attemptedWarmup &&
          isHostedHttpsWeb() &&
          baseUrl.startsWith("https://") &&
          attempt === 0;

        if (shouldWarmHostedBackend) {
          attemptedWarmup = true;
          await waitForBackendReady(baseUrl);
          continue;
        }
      }
    }
  }

  throw new Error(
    `Unable to reach the Rivan backend. Tried: ${BASE_URL_CANDIDATES.join(", ")}. Check that the API server is deployed, healthy at /api/health, and allowed by CORS.`
  );
}

export const api = {
  health: () => apiRequest("/health", { auth: false }),

  login: (email: string, password: string) =>
    apiRequest<{ access_token: string; user: any }>("/auth/login", { method: "POST", body: { email, password }, auth: false }),
  adminLogin: (phone: string, password: string) =>
    apiRequest<{ access_token: string; user: any }>("/auth/admin/login", { method: "POST", body: { phone, password }, auth: false }),
  adminDemoAccess: () =>
    apiRequest<{ access_token: string; user: any }>("/auth/admin/demo-access", { method: "POST", auth: false }),
  googleAuth: (id_token: string) =>
    apiRequest<{ access_token: string; user: any }>("/auth/google", { method: "POST", body: { id_token }, auth: false }),
  firebaseAuth: (id_token: string, phone: string, name?: string) =>
    apiRequest<{ access_token: string; user: any }>("/auth/firebase", { method: "POST", body: { id_token, phone, name }, auth: false }),
  agentFirebaseAuth: (id_token: string, phone: string) =>
    apiRequest<{ access_token: string; user: any }>("/auth/agent/firebase", { method: "POST", body: { id_token, phone }, auth: false }),
  agentApply: (body: any) =>
    apiRequest<{ success: boolean; already_approved?: boolean; message: string; agent: any }>("/auth/agent/apply", {
      method: "POST",
      body,
      auth: false,
    }),
  agentAccessStatus: (phone: string) =>
    apiRequest<{
      phone: string;
      exists: boolean;
      role: string | null;
      approval_status: string | null;
      can_login: boolean;
      message: string;
      agent?: any;
    }>("/auth/agent/status", { method: "POST", body: { phone }, auth: false }),
  sendOtp: (phone: string) =>
    apiRequest<{ success: boolean; phone: string; message: string }>("/auth/send-otp", { method: "POST", body: { phone }, auth: false }),
  verifyOtp: (phone: string, otp: string, name?: string) =>
    apiRequest<{ access_token: string; user: any }>("/auth/verify-otp", { method: "POST", body: { phone, otp, name }, auth: false }),
  me: () => apiRequest("/auth/me"),
  protected: () => apiRequest("/auth/protected"),
  customerRelationship: () => apiRequest("/crm/customer-relationship"),
  updateProfile: (data: any) => apiRequest("/auth/profile", { method: "PUT", body: data }),

  listProperties: (filters?: any) => apiRequest("/properties", { auth: false, query: filters }),
  featured: () => apiRequest("/properties/featured", { auth: false }),
  getProperty: (id: string) => apiRequest(`/properties/${id}`, { auth: false }),
  getPropertyPlots: (id: string) => apiRequest(`/properties/${id}/plots`, { auth: false }),
  getPlot: (id: string) => apiRequest(`/plots/${id}`, { auth: false }),

  createBooking: (body: any) => apiRequest("/bookings", { method: "POST", body }),
  myBookings: () => apiRequest("/bookings/mine"),
  myLand: () => apiRequest("/myland"),
  canRequestServices: () => apiRequest("/myland/can-request-services"),

  paymentsSummary: () => apiRequest("/payments/summary"),
  installments: () => apiRequest("/payments/installments"),
  paymentHistory: () => apiRequest("/payments/history"),
  payInstallment: (id: string) => apiRequest("/payments/pay", { method: "POST", body: { installment_id: id } }),

  documents: () => apiRequest("/documents"),
  servicesCatalog: () => apiRequest("/services/catalog", { auth: false }),
  requestService: (body: any) => apiRequest("/services/request", { method: "POST", body }),
  myServices: () => apiRequest("/services/mine"),

  centres: () => apiRequest("/centres", { auth: false }),
  getCentre: (id: string) => apiRequest(`/centres/${id}`, { auth: false }),
  bookCentreVisit: (body: any) => apiRequest("/visits/centre", { method: "POST", body }),
  bookSiteVisit: (body: any) => apiRequest("/visits/site", { method: "POST", body }),
  myVisits: () => apiRequest("/visits/mine"),

  toggleWishlist: (property_id: string) => apiRequest("/wishlist/toggle", { method: "POST", body: { property_id } }),
  wishlist: () => apiRequest("/wishlist"),
  notifications: () => apiRequest("/notifications"),
  readNotification: (id: string) => apiRequest(`/notifications/${id}/read`, { method: "POST" }),
  readAllNotifications: () => apiRequest("/notifications/read-all", { method: "POST" }),

  adminStats: () => apiRequest("/admin/stats"),
  adminUsers: () => apiRequest("/admin/users"),
  adminBookings: () => apiRequest("/admin/bookings"),
  adminConfirmBooking: (id: string) => apiRequest(`/admin/bookings/${id}/confirm`, { method: "POST" }),
  adminAgents: () => apiRequest("/admin/agents"),
  adminOverview: () => apiRequest("/admin/overview"),
  adminApproveAgent: (id: string) => apiRequest(`/admin/agents/${id}/approve`, { method: "POST" }),
  adminUpdateAgentStatus: (id: string, approval_status: string, review_notes?: string) =>
    apiRequest(`/admin/agents/${id}/status`, { method: "POST", body: { approval_status, review_notes } }),
  adminServices: () => apiRequest("/admin/service-requests"),
  adminUpdateService: (id: string, status_val: string) =>
    apiRequest(`/admin/service-requests/${id}/status`, { method: "POST", query: { status_val } }),

  agentDashboard: () => apiRequest("/agent/dashboard"),
  agentCreateBooking: (body: any) => apiRequest("/agent/bookings", { method: "POST", body }),
  agentUpdateBookingStatus: (id: string, status: string) =>
    apiRequest(`/agent/bookings/${id}/status`, { method: "PUT", body: { status } }),
  agentCloseBooking: (id: string) => apiRequest(`/agent/bookings/${id}/close`, { method: "POST" }),
  agentCreateSubAgent: (body: any) => apiRequest("/agent/agents", { method: "POST", body }),
  agentUpdateSubAgent: (id: string, body: any) => apiRequest(`/agent/agents/${id}`, { method: "PUT", body }),
  agentUpdateSubAgentStatus: (id: string, status: string) =>
    apiRequest(`/agent/agents/${id}/status`, { method: "PUT", body: { status } }),
  agentAssignProperties: (id: string, plot_ids: string[]) =>
    apiRequest(`/agent/agents/${id}/assign`, { method: "POST", body: { plot_ids } }),
  agentSiteVisits: () => apiRequest("/agent/site-visits"),
  agentCreateSiteVisit: (body: any) => apiRequest("/agent/site-visits", { method: "POST", body }),
  agentUpdateSiteVisit: (id: string, body: any) => apiRequest(`/agent/site-visits/${id}`, { method: "PUT", body }),

  crmLeads: (query?: any) => apiRequest("/crm/leads", { query }),
  crmLead: (id: string) => apiRequest(`/crm/leads/${id}`),
  createLead: (body: any) => apiRequest("/crm/leads", { method: "POST", body }),
  updateLead: (id: string, body: any) => apiRequest(`/crm/leads/${id}`, { method: "PUT", body }),
  mergeLead: (id: string, body: any) => apiRequest(`/crm/leads/${id}/merge`, { method: "POST", body }),
  crmOpportunities: (query?: any) => apiRequest("/crm/opportunities", { query }),
  crmOpportunity: (id: string) => apiRequest(`/crm/opportunities/${id}`),
  createOpportunity: (body: any) => apiRequest("/crm/opportunities", { method: "POST", body }),
  updateOpportunity: (id: string, body: any) => apiRequest(`/crm/opportunities/${id}`, { method: "PUT", body }),
  updateOpportunityStage: (id: string, body: any) => apiRequest(`/crm/opportunities/${id}/stage`, { method: "POST", body }),
  crmTasks: (query?: any) => apiRequest("/crm/tasks", { query }),
  crmTask: (id: string) => apiRequest(`/crm/tasks/${id}`),
  createTask: (body: any) => apiRequest("/crm/tasks", { method: "POST", body }),
  updateTask: (id: string, body: any) => apiRequest(`/crm/tasks/${id}`, { method: "PUT", body }),
  completeTask: (id: string, body?: any) => apiRequest(`/crm/tasks/${id}/complete`, { method: "POST", body: body || {} }),
  crmActivities: (query?: any) => apiRequest("/crm/activities", { query }),
  crmAgentDashboard: () => apiRequest("/crm/dashboard/agent"),
  crmAdminDashboard: () => apiRequest("/crm/dashboard/admin"),
  crmReassign: (body: any) => apiRequest("/crm/reassign", { method: "POST", body }),
};
