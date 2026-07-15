const BACKEND_URL =
  import.meta.env.EXPO_PUBLIC_BACKEND_URL ||
  "https://rivan.onrender.com";

const SESSION_KEY = "rivan_session";
let refreshPromise = null;
const ACCESS_TOKEN_REFRESH_SKEW_SECONDS = 90;

export function getBackendUrl() {
  return BACKEND_URL.replace(/\/$/, "");
}

export function getWebSocketUrl(token) {
  const base = getBackendUrl().replace(/^http/, "ws");
  return `${base}/ws/live?token=${encodeURIComponent(token || "")}`;
}

let liveUpdatesCapabilityPromise = null;

export async function supportsLiveUpdates() {
  if (import.meta.env.VITE_ENABLE_WEBSOCKETS !== "true") {
    return false;
  }
  if (!liveUpdatesCapabilityPromise) {
    liveUpdatesCapabilityPromise = fetch(`${getBackendUrl()}/api/health?_t=${Date.now()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((data) => Boolean(data?.live_updates_enabled && data?.live_updates_path))
      .catch(() => false);
  }
  return liveUpdatesCapabilityPromise;
}

export function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function decodeJwtPayload(token) {
  try {
    const payload = String(token || "").split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function isAccessTokenFresh(token) {
  const payload = decodeJwtPayload(token);
  const exp = Number(payload?.exp || 0);
  if (!exp) return false;
  return exp - Math.floor(Date.now() / 1000) > ACCESS_TOKEN_REFRESH_SKEW_SECONDS;
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function redirectToLogin() {
  if (typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
    window.location.href = "/login";
  }
}

function invalidateSession() {
  clearSession();
  redirectToLogin();
}

export async function logoutSession() {
  const session = loadSession();
  const refreshToken = session?.refresh_token;
  try {
    if (refreshToken) {
      await fetch(`${getBackendUrl()}/api/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    }
  } catch {
    // Best-effort logout; clear local session even if the network is unavailable.
  } finally {
    clearSession();
  }
}

export async function refreshStoredSession() {
  const current = loadSession();
  const refreshToken = current?.refresh_token;
  if (!refreshToken) {
    invalidateSession();
    throw new Error("Missing refresh token");
  }

  if (!refreshPromise) {
    refreshPromise = fetch(`${getBackendUrl()}/api/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.access_token) {
          throw new ApiError(
            data.detail?.message || data.detail || "Unable to restore session",
            response.status,
            data,
          );
        }
        saveSession(data);
        return data;
      })
      .catch((error) => {
        if (error instanceof ApiError && [400, 401, 403].includes(error.status)) {
          invalidateSession();
        }
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export async function restoreSession() {
  const session = loadSession();
  if (!session?.refresh_token) return null;
  if (session?.access_token && isAccessTokenFresh(session.access_token)) return session;
  return refreshStoredSession();
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function shouldRetryRequest(method, status) {
  return method === "GET" && [408, 429, 500, 502, 503, 504].includes(status);
}

async function performJsonRequest(path, options = {}, token, attempt = 0) {
  const { method = "GET", body } = options;
  try {
    const response = await fetch(`${getBackendUrl()}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: "include",
      ...(method === "GET" ? { cache: "no-store" } : {}),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json().catch(() => ({}));
    if (attempt < 2 && shouldRetryRequest(method, response.status)) {
      await wait(350 * (attempt + 1));
      return performJsonRequest(path, options, token, attempt + 1);
    }
    return { response, data };
  } catch (error) {
    if (attempt < 2 && method === "GET") {
      await wait(350 * (attempt + 1));
      return performJsonRequest(path, options, token, attempt + 1);
    }
    throw error;
  }
}

export async function requestJson(path, options = {}, token) {
  let activeToken = token;
  let { response, data } = await performJsonRequest(path, options, activeToken);

  if (response.status === 401) {
    const storedSession = loadSession();
    if (storedSession?.refresh_token) {
      try {
        const refreshedSession = await refreshStoredSession();
        activeToken = refreshedSession?.access_token || activeToken;
        ({ response, data } = await performJsonRequest(path, options, activeToken));
      } catch (error) {
        if (error instanceof ApiError && [400, 401, 403].includes(error.status)) {
          throw error;
        }
        throw new ApiError("Session refresh is temporarily unavailable. Please try again.", 503, { cause: error?.message });
      }
    }
  }

  if (response.status === 401) {
    invalidateSession();
    throw new Error("Session expired");
  }

  if (!response.ok) {
    throw new ApiError(
      data.detail?.message || data.detail || "Request failed",
      response.status,
      data,
    );
  }
  return data;
}

export async function postJson(path, body, token) {
  return requestJson(path, { method: "POST", body }, token);
}
export async function getJson(path, token) {
  const separator = path.includes('?') ? '&' : '?';
  const noCachePath = `${path}${separator}_t=${Date.now()}`;
  return requestJson(noCachePath, { method: "GET" }, token);
}

export async function putJson(path, body, token) {
  return requestJson(path, { method: "PUT", body }, token);
}
