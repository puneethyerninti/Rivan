const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const COOKIE_KEYS = new Set(["rivan_token", "rivan_refresh_token", "rivan_user_cache", "rivan_last_phone"]);

function readCookie(key: string) {
  if (typeof document === "undefined") return null;
  const encodedKey = encodeURIComponent(key);
  const match = document.cookie.split("; ").find((entry) => entry.startsWith(`${encodedKey}=`));
  return match ? decodeURIComponent(match.slice(encodedKey.length + 1)) : null;
}

function writeCookie(key: string, value: string) {
  if (typeof document === "undefined") return;
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
}

function deleteCookie(key: string) {
  if (typeof document === "undefined") return;
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${encodeURIComponent(key)}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
}

export const storage = {
  get(key: string) {
    try {
      if (COOKIE_KEYS.has(key)) {
        const cookieValue = readCookie(key);
        if (cookieValue !== null) return cookieValue;
      }
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      if (COOKIE_KEYS.has(key)) writeCookie(key, value);
      window.localStorage.setItem(key, value);
    } catch {
      // noop
    }
  },
  remove(key: string) {
    try {
      if (COOKIE_KEYS.has(key)) deleteCookie(key);
      window.localStorage.removeItem(key);
    } catch {
      // noop
    }
  },
};
