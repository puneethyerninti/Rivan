import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import { api, clearToken, getRefreshToken, getToken, setRefreshToken, setToken } from "@/lib/api";
import { storage } from "@/lib/storage";

export type UserRecord = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  role?: string;
  portal_role?: string;
  approval_status?: string;
  kyc_status?: string;
  is_admin?: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
};

type AuthContextValue = {
  user: UserRecord | null;
  isLoading: boolean;
  isAuthed: boolean;
  role: "customer" | "agent" | "admin" | "guest";
  signIn: (token: string, user: UserRecord, refreshToken?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  updateUser: (user: UserRecord) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const USER_CACHE_KEY = "rivan_user_cache";
const ADMIN_DISPLAY_NAME = "Kollu Sravani";

function normalizeUser(user: UserRecord | null | undefined): UserRecord | null {
  if (!user) return null;
  const rawRole = String(user.portal_role || user.role || "").toLowerCase();
  if (["admin", "manager", "super_admin"].includes(rawRole)) {
    return {
      ...user,
      name: String(user.name || "").trim().toLowerCase() === "rivan admin" || !String(user.name || "").trim() ? ADMIN_DISPLAY_NAME : user.name,
      role: "admin",
      portal_role: "admin",
      is_admin: true,
    };
  }
  if (["agent", "sub_agent"].includes(rawRole) && String(user.approval_status || "").toLowerCase() === "approved") {
    return { ...user, role: "agent", portal_role: "agent", is_admin: false };
  }
  return { ...user, role: "customer", portal_role: "customer", is_admin: false };
}

function getRole(user: UserRecord | null): "customer" | "agent" | "admin" | "guest" {
  if (!user) return "guest";
  const normalized = String(user.portal_role || user.role || "").toLowerCase();
  if (normalized === "admin") return "admin";
  if (normalized === "agent") return "agent";
  return "customer";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function loadFromServer() {
    const token = await getToken();
    const refreshToken = await getRefreshToken();
    const cached = storage.get(USER_CACHE_KEY);
    try {
      if (cached) {
        try {
          setUser(normalizeUser(JSON.parse(cached)));
        } catch {
          storage.remove(USER_CACHE_KEY);
        }
      }

      if (!token && !refreshToken && !cached) {
        storage.remove(USER_CACHE_KEY);
        setUser(null);
        return;
      }

      const nextUser = normalizeUser((await api.me()) as UserRecord);
      setUser(nextUser);
      if (nextUser) storage.set(USER_CACHE_KEY, JSON.stringify(nextUser));
    } catch {
      await clearToken();
      storage.remove(USER_CACHE_KEY);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadFromServer();
  }, []);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        void loadFromServer();
      }
    }

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
      return () => document.removeEventListener("visibilitychange", handleVisibility);
    }
    return undefined;
  }, []);

  async function signIn(token: string, nextUser: UserRecord, refreshToken?: string) {
    const normalized = normalizeUser(nextUser);
    await setToken(token);
    if (refreshToken) await setRefreshToken(refreshToken);
    if (normalized) storage.set(USER_CACHE_KEY, JSON.stringify(normalized));
    setUser(normalized);
    setIsLoading(false);
  }

  async function signOut() {
    const refreshToken = await getRefreshToken();
    if (refreshToken) {
      try {
        await api.logoutAuth(refreshToken);
      } catch {
        // best effort
      }
    }
    await clearToken();
    storage.remove(USER_CACHE_KEY);
    setUser(null);
  }

  async function updateUser(nextUser: UserRecord) {
    const normalized = normalizeUser(nextUser);
    if (normalized) storage.set(USER_CACHE_KEY, JSON.stringify(normalized));
    setUser(normalized);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthed: Boolean(user),
      role: getRole(user),
      signIn,
      signOut,
      refresh: loadFromServer,
      updateUser,
    }),
    [isLoading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
