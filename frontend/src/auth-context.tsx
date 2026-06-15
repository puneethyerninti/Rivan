import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, clearToken, getToken, setToken } from "@/src/api";
import { storage } from "@/src/utils/storage";

type User = {
  id: string;
  phone?: string;
  name: string;
  email?: string;
  role?: string;
  age?: number;
  aadhaar_number?: string;
  bank_details?: string;
  manager_name?: string;
  manager_id?: string;
  agent_brand_name?: string;
  sub_agent_ids?: string[];
  approval_status?: string;
  approved_by_manager?: string;
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
  isAuthed: boolean;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const USER_CACHE_KEY = "rivan_user_cache";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    try {
      const token = await getToken();
      if (!token) {
        setUser(null);
        return;
      }
      const cachedUserRaw = await storage.secureGet(USER_CACHE_KEY, "");
      if (cachedUserRaw && typeof cachedUserRaw === "string") {
        try {
          const cachedUser = JSON.parse(cachedUserRaw) as User;
          setUser(cachedUser);
          setIsLoading(false);
        } catch {
          // ignore malformed cache and continue with live fetch
        }
      }
      const u = await api.me();
      setUser(u as User);
      await storage.secureSet(USER_CACHE_KEY, JSON.stringify(u));
    } catch (_e) {
      await clearToken();
      await storage.secureRemove(USER_CACHE_KEY);
      setUser(null);
    } finally {
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
  }

  async function signOut() {
    await clearToken();
    await storage.secureRemove(USER_CACHE_KEY);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthed: !!user, signIn, signOut, refresh: load }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
