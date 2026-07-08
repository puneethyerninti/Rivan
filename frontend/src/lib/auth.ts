const BACKEND_URL =
  import.meta.env.EXPO_PUBLIC_BACKEND_URL ||
  "https://rivan.onrender.com";

const SESSION_KEY = "rivan_session";

export function getBackendUrl() {
  return BACKEND_URL.replace(/\/$/, "");
}

export function getWebSocketUrl(token) {
  const base = getBackendUrl().replace(/^http/, "ws");
  return `${base}/ws/live?token=${encodeURIComponent(token || "")}`;
}

let liveUpdatesCapabilityPromise = null;

export async function supportsLiveUpdates() {
  if (!liveUpdatesCapabilityPromise) {
    liveUpdatesCapabilityPromise = fetch(`${getBackendUrl()}/api/health`, {
      credentials: "include",
    })
      .then(async (response) => {
        if (!response.ok) return false;
        const data = await response.json().catch(() => ({}));
        return data?.live_updates_enabled === true;
      })
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

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function handle401(response) {
  if (response.status === 401) {
    clearSession();
    // Only redirect if we're not already on the login page to avoid loops
    if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
      window.location.href = '/login';
    }
    return true;
  }
  return false;
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export async function requestJson(path, options = {}, token) {
  const { method = "GET", body } = options;
  const response = await fetch(`${getBackendUrl()}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (handle401(response)) {
    throw new Error("Session expired");
  }

  const data = await response.json().catch(() => ({}));
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
  return requestJson(path, { method: "GET" }, token);
}

export async function putJson(path, body, token) {
  return requestJson(path, { method: "PUT", body }, token);
}
