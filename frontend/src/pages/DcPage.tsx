import React, { useEffect, useRef, useState } from "react";
import * as ReactDOMClient from "react-dom/client";
import { loadSession, getJson } from "../lib/auth";
import { useNavigate } from "react-router-dom";

declare global {
  interface Window {
    React?: typeof React;
    ReactDOM?: {
      createRoot: (container: Element | DocumentFragment) => unknown;
    };
    __dcBoot?: () => void;
  }
}

const RUNTIME_SCRIPT_ID = "dc-runtime-script";

const routeRewrites: Array<[RegExp, string]> = [
  [/Rivan%20Login\.dc\.html/g, "/login"],
  [/Rivan%20App\.dc\.html/g, "/app"],
  [/Rivan%20My%20Lands\.dc\.html/g, "/my-lands"],
  [/Rivan%20Visits\.dc\.html/g, "/visits"],
  [/Rivan%20Agent%20Dashboard\.dc\.html/g, "/agent-dashboard"],
  [/Rivan%20Admin%20Dashboard\.dc\.html/g, "/admin-dashboard"],
];

let runtimePromise: Promise<void> | null = null;

function rewriteNavigation(html: string) {
  let next = html;
  for (const [pattern, replacement] of routeRewrites) {
    next = next.replace(pattern, replacement);
  }
  return next;
}

function ensureRuntime() {
  if (window.__dcBoot) {
    return Promise.resolve();
  }
  if (runtimePromise) {
    return runtimePromise;
  }

  window.React = React;
  window.ReactDOM = {
    createRoot: ReactDOMClient.createRoot,
  };

  runtimePromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(RUNTIME_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (window.__dcBoot || existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load dc runtime")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.id = RUNTIME_SCRIPT_ID;
    script.src = "/support.js";
    script.async = false;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load dc runtime"));
    document.head.appendChild(script);
  });

  return runtimePromise;
}

function formatPhoneForUi(rawPhone: unknown) {
  const digits = String(rawPhone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("91") && digits.length === 12) {
    return `+91 ${digits.slice(2)}`;
  }
  if (digits.length === 10) {
    return `+91 ${digits}`;
  }
  return String(rawPhone || "").trim();
}

function replaceExactText(host: HTMLDivElement, matcher: (value: string) => boolean, nextValue: string) {
  if (!nextValue && nextValue !== "") return;
  host.querySelectorAll("*").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const text = node.textContent?.trim() || "";
    if (!text || !matcher(text)) return;
    node.textContent = nextValue;
  });
}

function replaceInputValue(host: HTMLDivElement, predicate: (value: string) => boolean, nextValue: string) {
  host.querySelectorAll("input, textarea").forEach((node) => {
    if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) return;
    const currentValue = String(node.value || "").trim();
    if (!predicate(currentValue)) return;
    node.value = nextValue;
    node.setAttribute("value", nextValue);
  });
}

function formatUiDate(value?: string | Date | null) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatUiDayLabel(value?: string | Date | null) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return `Today, ${new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date)}`;
}

function replaceContainsText(host: HTMLDivElement, matcher: (value: string) => boolean, nextValue: string) {
  host.querySelectorAll("*").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const text = node.textContent?.trim() || "";
    if (!text || !matcher(text)) return;
    node.textContent = nextValue;
  });
}

function applyDashboardShellTweaks(host: HTMLDivElement, title: string) {
  const styleId = "dc-page-runtime-style";
  document.getElementById(styleId)?.remove();
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    .dc-react-page, .dc-react-host { min-height: 100vh; background: #eef2ec; }
    @media (max-width: 860px) {
      .dc-react-host main, .dc-react-host > div, .dc-react-host > section { min-width: 0 !important; }
    }
    @media (max-width: 640px) {
      .dc-react-host header { padding-left: 14px !important; padding-right: 14px !important; }
      .dc-react-host [class*="crm-side"], .dc-react-host [class*="ad-side"] { width: 260px !important; }
      .dc-react-host button, .dc-react-host a { -webkit-tap-highlight-color: transparent; }
    }
  `;
  document.head.appendChild(style);

  if (title.includes("Agent")) {
    replaceContainsText(
      host,
      (text) => text.includes("Track leads & follow-ups in one glance."),
      "Manage customer enquiries, visits, bookings, and follow-ups in one place.",
    );
  }

  if (title.includes("Admin")) {
    replaceContainsText(
      host,
      (text) => text.includes("System Settings"),
      "Settings",
    );
  }
}

function personalizeRenderedPage(host: HTMLDivElement, title: string, liveMe?: Record<string, any> | null) {
  const session = loadSession();
  const user = liveMe || session?.user || {};
  const userName =
    String(user.name || user.full_name || user.display_name || "").trim() ||
    "Rivan User";
  const userRole = String(user.role || "").trim().toLowerCase();
  const userEmail = String(user.email || "").trim();
  const userLocation = String(user.location || user.city || user.address || "").trim();
  const userPhone = formatPhoneForUi(user.phone || user.phone_number || user.mobile);
  const initials = userName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase() || "")
    .join("") || "RU";
  const todayLabel = formatUiDayLabel(user.updated_at || new Date());
  const shortDate = formatUiDate(new Date());

  applyDashboardShellTweaks(host, title);

  if (title.includes("Agent")) {
    replaceExactText(host, (text) => ["Ananya Sharma", "Arjun Reddy"].includes(text), userName);
    replaceExactText(host, (text) => text === "Super Agent", "Agent");
    replaceExactText(host, (text) => ["SK", "AR", "AS"].includes(text), initials);
    replaceExactText(host, (text) => text === "Today, 22 May 2025", todayLabel);
    replaceExactText(host, (text) => text === "Refreshing automatically", "Syncing live updates");
    replaceExactText(host, (text) => text === "Welcome, Arjun Reddy", `Welcome, ${userName}`);
    replaceContainsText(host, (text) => text.includes("Incoming enquiries awaiting first contact"), "Live customer enquiries and conversions");
    if (userPhone) {
      replaceExactText(host, (text) => text === "+91 9052644345" || text === "+91 90000 12345", userPhone);
      replaceInputValue(host, (value) => value === "+91 9052644345" || value === "+91 90000 12345", userPhone);
    }
    if (userEmail) {
      replaceExactText(host, (text) => text === "agent@rivaan.com", userEmail);
      replaceInputValue(host, (value) => value === "agent@rivaan.com", userEmail);
    }
    if (userLocation) {
      replaceExactText(host, (text) => text === "Visakhapatnam", userLocation);
      replaceInputValue(host, (value) => value === "Visakhapatnam", userLocation);
    }
  }

  if (title.includes("Admin")) {
    replaceExactText(host, (text) => ["Admin User", "Kollu Sravani", "Sravani Kollu"].includes(text), userName);
    replaceExactText(host, (text) => text === "Super Admin", userRole === "admin" ? "Admin" : text);
    replaceExactText(host, (text) => ["SK", "KS"].includes(text), initials);
    replaceExactText(host, (text) => text === "22 May 2025", shortDate);
    replaceContainsText(host, (text) => text.includes("Role:") && text.includes("full platform control"), "Role: Admin");
    if (userPhone) {
      replaceExactText(host, (text) => text === "+91 90000 12345" || text === "+91+919491348973" || text === "+91 9491348973", userPhone);
      replaceInputValue(host, (value) => value === "+91 90000 12345" || value === "+91+919491348973" || value === "+91 9491348973", userPhone);
    }
    if (userEmail) {
      replaceExactText(host, (text) => text === "admin@rivanrealty.com", userEmail);
      replaceInputValue(host, (value) => value === "admin@rivanrealty.com", userEmail);
    }
    if (userLocation) {
      replaceExactText(host, (text) => text === "Head Office, Vizag" || text === "Rivan HQ", userLocation);
      replaceInputValue(host, (value) => value === "Head Office, Vizag" || value === "Rivan HQ", userLocation);
    }
  }
}

type DcPageProps = {
  sourcePath: string;
  title: string;
};

export function DcPage({ sourcePath, title }: DcPageProps) {
  const navigate = useNavigate();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const managedHeadRef = useRef<HTMLElement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  
  useEffect(() => {
    const session = loadSession();
    const requiredRole = title.includes("Admin") ? "admin" : title.includes("Agent") ? "agent" : null;
    if (!session?.access_token || (requiredRole && session.user.role !== requiredRole)) {
      navigate("/login", { replace: true });
    }
  }, [navigate, title]);

  useEffect(() => {
    const interval = window.setInterval(() => setTick((value) => value + 1), 30000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function renderPage() {
      setError(null);
      document.title = title;

      const host = hostRef.current;
      if (!host) return;

      managedHeadRef.current.forEach((node) => node.remove());
      managedHeadRef.current = [];
      host.innerHTML = "";

      await ensureRuntime();

      const response = await fetch(sourcePath, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Unable to load ${sourcePath}`);
      }

      const html = rewriteNavigation(await response.text());
      if (cancelled) return;

      
      let agentDataStr = "";
      let liveMe: Record<string, any> | null = null;
      if (title.includes("Agent")) {
        try {
          const session = loadSession();
          if (session?.access_token) {
            const [me, dashboard, leads, bookings, visits] = await Promise.all([
              getJson("/api/auth/me", session.access_token).catch(() => null),
              getJson('/api/agent/dashboard', session.access_token).catch(()=>null),
              getJson('/api/crm/leads', session.access_token).catch(()=>[]),
              getJson('/api/agent/bookings', session.access_token).catch(()=>[]),
              getJson('/api/agent/site-visits', session.access_token).catch(()=>[]),
            ]);
            liveMe = me;
            agentDataStr = `<script>
              window.__AGENT_DATA = {
                me: ${JSON.stringify(me)},
                dashboard: ${JSON.stringify(dashboard)},
                leads: ${JSON.stringify(leads)},
                bookings: ${JSON.stringify(bookings)},
                visits: ${JSON.stringify(visits)}
              };
            </script>`;
          }
        } catch (e) { console.error("Agent fetch err", e); }
      } else if (title.includes("Admin")) {
        try {
          const session = loadSession();
          if (session?.access_token) {
            liveMe = await getJson("/api/auth/me", session.access_token).catch(() => null);
          }
        } catch (e) { console.error("Admin fetch err", e); }
      }

      const sourceDoc = new DOMParser().parseFromString(html, "text/html");
      const bodyMarkup = sourceDoc.body.innerHTML;
      const headBefore = new Set(Array.from(document.head.children));

      host.innerHTML = agentDataStr + bodyMarkup;
      window.__dcBoot?.();
      personalizeRenderedPage(host, title, liveMe);

      requestAnimationFrame(() => {
        if (cancelled) return;
        managedHeadRef.current = Array.from(document.head.children).filter(
          (node) => !headBefore.has(node),
        ) as HTMLElement[];
      });
    }

    renderPage().catch((err: unknown) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : "Failed to render page");
    });

    return () => {
      cancelled = true;
      managedHeadRef.current.forEach((node) => node.remove());
      managedHeadRef.current = [];
      if (hostRef.current) {
        hostRef.current.innerHTML = "";
      }
    };
  }, [sourcePath, tick, title]);

  if (error) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "radial-gradient(140% 100% at 50% 0%, #eef4ea 0%, #e0ece0 55%, #d4e8d4 100%)",
          color: "#4f8f61",
          fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: "520px",
            width: "100%",
            padding: "28px",
            borderRadius: "24px",
            background: "#ffffff",
            boxShadow: "0 20px 40px rgba(18,53,29,.12)",
          }}
        >
          <h1 style={{ margin: "0 0 8px", fontSize: "24px" }}>Page render failed</h1>
          <p style={{ margin: 0, lineHeight: 1.5 }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <main className="dc-react-page">
      <div ref={hostRef} className="dc-react-host" />
    </main>
  );
}
