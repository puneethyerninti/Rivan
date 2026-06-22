import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, clearToken, getToken, setToken, warmBackendReady } from "@/src/api";
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
};

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  isSessionRefreshing: boolean;
  isAuthed: boolean;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const USER_CACHE_KEY = "rivan_user_cache";

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
        setUser(null);
        setIsSessionRefreshing(false);
        return;
      }
      setIsSessionRefreshing(true);
      const cachedUserRaw = await storage.secureGet(USER_CACHE_KEY, "");
      if (cachedUserRaw && typeof cachedUserRaw === "string") {
        try {
          const cachedUser = JSON.parse(cachedUserRaw) as User;
          setUser(cachedUser);
          usedCachedUser = true;
        } catch {
          // ignore malformed cache and continue with live fetch
        }
      }
      const u = await api.me();
      setUser(u as User);
      await storage.secureSet(USER_CACHE_KEY, JSON.stringify(u));
    } catch (error) {
      if (usedCachedUser && isTemporaryBackendError(error)) {
        return;
      }
      await clearToken();
      await storage.secureRemove(USER_CACHE_KEY);
      setUser(null);
    } finally {
      setIsSessionRefreshing(false);
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function signIn(token: string, u: User) {
    await setToken(token);
    await storage.secureSet(USER_CACHE_KEY, JSON.stringify(u));
    setUser(u);
    setIsSessionRefreshing(false);
    setIsLoading(false);
  }

  async function signOut() {
    await clearToken();
    await storage.secureRemove(USER_CACHE_KEY);
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
