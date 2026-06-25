import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, clearToken, getRefreshToken, getToken, setRefreshToken, setToken, warmBackendReady } from "@/src/api";
import { storage } from "@/src/utils/storage";

type User = {
  id: string;
  phone?: string;
  name: string;
  email?: string;
  role?: string;
  occupation?: string;
  age?: number;
  aadhaar_number?: string;
  bank_details?: string;
  manager_name?: string;
  manager_id?: string;
  agent_brand_name?: string;
  sub_agent_ids?: string[];
  approval_status?: string;
  approved_by_manager?: string;
  review_notes?: string;
  reviewed_by_manager?: string;
  application_notes?: string;
  address?: string;
  kyc_status?: string;
  is_admin?: boolean;
  google_sub?: string;
  auth_methods?: string[];
  created_at?: string;
  updated_at?: string;
  portal_role?: string;
};

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  isSessionRefreshing: boolean;
  isAuthed: boolean;
  signIn: (token: string, user: User, refreshToken?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const USER_CACHE_KEY = "rivan_user_cache";
const AGENT_DASHBOARD_CACHE_KEY = "rivan_agent_dashboard_cache";

function userHasApprovedAgentAccess(user: User | null | undefined) {
  const role = String(user?.portal_role || user?.role || "").toLowerCase();
  return ["agent", "sub_agent"].includes(role) && String(user?.approval_status || "").toLowerCase() === "approved";
}

function normalizeUserSession(user: User | null | undefined): User | null {
  if (!user) return null;
  const normalizedRole = String(user.portal_role || user.role || "").toLowerCase();
  if (["admin", "manager", "super_admin"].includes(normalizedRole)) {
    return { ...user, role: "admin", portal_role: "admin", is_admin: true };
  }
  if (["agent", "sub_agent"].includes(normalizedRole) && String(user.approval_status || "").toLowerCase() === "approved") {
    return { ...user, role: normalizedRole as User["role"], portal_role: "agent" };
  }
  return { ...user, role: "customer", portal_role: "customer", is_admin: false };
}

async function clearRoleScopedCaches(user: User | null | undefined) {
  if (!userHasApprovedAgentAccess(user)) {
    await storage.removeItem(AGENT_DASHBOARD_CACHE_KEY);
  }
}

function isTemporaryBackendError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();
  return (
    message.includes("unable to reach the rivan backend") ||
    message.includes("temporary_backend_unavailable") ||
    message.includes("failed to fetch") ||
    message.includes("network request failed") ||
    message.includes("abort")
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSessionRefreshing, setIsSessionRefreshing] = useState(false);

  async function load() {
    let usedCachedUser = false;
    try {
      warmBackendReady();
      const token = await getToken();
      if (!token) {
        await storage.secureRemove(USER_CACHE_KEY);
        await clearRoleScopedCaches(null);
        setUser(null);
        setIsSessionRefreshing(false);
        return;
      }
      setIsSessionRefreshing(true);
      const cachedUserRaw = await storage.secureGet(USER_CACHE_KEY, "");
      if (cachedUserRaw && typeof cachedUserRaw === "string") {
        try {
          const cachedUser = normalizeUserSession(JSON.parse(cachedUserRaw) as User);
          setUser(cachedUser);
          usedCachedUser = true;
        } catch {
          // ignore malformed cache and continue with live fetch
        }
      }
      const u = normalizeUserSession((await api.me()) as User);
      setUser(u);
      await storage.secureSet(USER_CACHE_KEY, JSON.stringify(u));
      await clearRoleScopedCaches(u);
    } catch (error) {
      if (usedCachedUser && isTemporaryBackendError(error)) {
        return;
      }
      await clearToken();
      await storage.secureRemove(USER_CACHE_KEY);
      await clearRoleScopedCaches(null);
      setUser(null);
    } finally {
      setIsSessionRefreshing(false);
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") return;

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        void load();
      }
    }

    window.addEventListener("pageshow", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.removeEventListener("pageshow", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  async function signIn(token: string, u: User, refreshToken?: string) {
    const normalizedUser = normalizeUserSession(u);
    await setToken(token);
    if (refreshToken) {
      await setRefreshToken(refreshToken);
    }
    await storage.secureSet(USER_CACHE_KEY, JSON.stringify(normalizedUser));
    await clearRoleScopedCaches(normalizedUser);
    setUser(normalizedUser);
    setIsSessionRefreshing(false);
    setIsLoading(false);
  }

  async function signOut() {
    const refreshToken = await getRefreshToken();
    if (refreshToken) {
      try {
        await api.logoutAuth(refreshToken);
      } catch {
        // best-effort session revoke
      }
    }
    await clearToken();
    await storage.secureRemove(USER_CACHE_KEY);
    await clearRoleScopedCaches(null);
    setUser(null);
    setIsSessionRefreshing(false);
  }

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isSessionRefreshing, isAuthed: !!user, signIn, signOut, refresh: load }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
