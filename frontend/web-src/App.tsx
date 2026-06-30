import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import { useAuth, type UserRecord } from "@/context/auth";
import { api } from "@/lib/api";
import { createRecaptchaVerifier, firebaseConfigError, getFirebaseAuth, hasFirebaseConfig, signInWithPhoneNumber } from "@/lib/firebase";
import { enrichProperty, enrichPropertyCollection, getFallbackProperty, isSiripuramProperty, type NormalizedProperty, type PropertyMapBlock } from "@/lib/data";
import { storage } from "@/lib/storage";
import rivanLogo from "../assets/images/rivan-logo.png";
import propertyImageOne from "../assets/images/properties/property-image-1.jpeg";
import propertyImageTwo from "../assets/images/properties/property-image-2.jpeg";
import propertyMapImage from "../assets/images/properties/map.jpeg";

type ModalType = "customer" | "agent" | "admin" | "apply" | null;
type VisitStatus = "pending" | "confirmed" | "completed" | "cancelled";
const HOME_PATH = "/home";
const ONBOARDING_STEPS = [
  {
    id: "discover",
    title: "Discover dream properties",
    body: "Explore verified properties, premium visuals, and location-first browsing in one calm experience.",
    accent: "Browse. Compare. Own with confidence.",
  },
  {
    id: "layout",
    title: "Interactive layouts and maps",
    body: "Open Siripuram Gardens layouts, inspect plot options, and understand the site plan before booking a visit.",
    accent: "Layout clarity with live navigation.",
  },
  {
    id: "visit",
    title: "Schedule, pay, and stay updated",
    body: "Book site visits, track approvals, follow customer progress, and continue the same journey with OTP access.",
    accent: "One flow for visits, bookings, and support.",
  },
] as const;

const HOME_QUICK_LINKS = [
  { label: "Home", href: `${HOME_PATH}#top` },
  { label: "My Properties", to: "/myland" },
  { label: "Property Types", href: `${HOME_PATH}#property-types` },
  { label: "Site Visits", to: "/visits" },
  { label: "Bookings", to: "/bookings" },
  { label: "Support", to: "/services" },
] as const;

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function formatCurrency(value?: number | null) {
  if (!value) return "Price on request";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) return "Not scheduled";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function adminEmailDisplay(email?: string | null) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized || normalized === "admin@rivanreality.com") return "Manager account email";
  return String(email || "").trim();
}

function normalizePhoneDigits(value: string) {
  return value.replace(/\D/g, "").slice(-10);
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function arrayOf<T = any>(value: any): T[] {
  return Array.isArray(value) ? value : [];
}

function isLegacyMockUiRecord(item: any) {
  const values = [
    item?.name,
    item?.title,
    item?.property_name,
    item?.project_name,
    item?.location,
    item?.body,
    item?.message,
    item?.url,
    item?.created_at,
    item?.visit_date,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  return (
    values.includes("rivan greens") ||
    values.includes("shadnagar") ||
    values.includes("sample.pdf") ||
    values.includes("26 jun 2005") ||
    values.includes("26 jun 2001") ||
    values.includes("2005-") ||
    values.includes("2001-")
  );
}

function normalizePlotBlocks(payload: any): PropertyMapBlock[] {
  const rawList = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.plots)
        ? payload.plots
        : [];

  return rawList
    .map((plot: any, index: number) => {
      const price =
        typeof plot?.price === "number"
          ? plot.price
          : Number(String(plot?.price || "").replace(/[^\d.]/g, "")) || 0;
      const row = Number.isFinite(Number(plot?.row)) ? Number(plot.row) : Math.floor(index / 6);
      const col = Number.isFinite(Number(plot?.col)) ? Number(plot.col) : index % 6;
      const sizeLabel = firstString(plot?.size, plot?.size_sqy ? `${plot.size_sqy} sq yards` : "");
      const sizeSqYd = Number.isFinite(Number(plot?.size_sqy))
        ? Number(plot.size_sqy)
        : Number(String(sizeLabel).replace(/[^\d.]/g, "")) || 0;
      const status = String(plot?.status || "available").toLowerCase();
      return {
        id: firstString(plot?.id, plot?._id, `plot-${index + 1}`),
        label: firstString(plot?.plot_number, plot?.flat_number, plot?.villa_type, `Plot ${index + 1}`),
        sizeSqYd,
        size: sizeLabel || "Size on request",
        facing: firstString(plot?.facing, "Facing on request"),
        status: ["available", "reserved", "booked", "sold"].includes(status) ? (status as PropertyMapBlock["status"]) : "available",
        price,
        x: 6 + col * 15,
        y: 8 + row * 12,
        w: 12,
        h: 8,
      } satisfies PropertyMapBlock;
    })
    .filter((block: PropertyMapBlock) => Boolean(block.id));
}

function roleLabel(user: UserRecord | null) {
  const role = String(user?.portal_role || user?.role || "customer").toLowerCase();
  if (role === "admin") return "Admin";
  if (role === "agent") return "Agent";
  return "Customer";
}

function formatStatusLabel(status?: string | null) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "closed") return "Completed";
  if (normalized === "in_progress") return "In progress";
  if (normalized === "closed_won") return "Closed won";
  if (normalized === "closed_lost") return "Closed lost";
  if (normalized === "pending_agent_approval") return "Pending agent approval";
  if (normalized === "agent_approved") return "Agent approved";
  if (normalized === "admin_approved") return "Admin approved";
  return firstString(status, "Pending");
}

function statusClass(status?: string | null) {
  const normalized = String(status || "").toLowerCase();
  if (["approved", "agent_approved", "admin_approved", "reserved", "completed", "paid", "closed", "closed_won", "active"].includes(normalized)) return "is-success";
  if (["pending", "pending_agent_approval", "review", "scheduled", "rescheduled"].includes(normalized)) return "is-warning";
  if (["rejected", "cancelled", "failed"].includes(normalized)) return "is-danger";
  return "is-neutral";
}

function StatusPill({ status }: { status?: string | null }) {
  return <span className={cn("status-pill", statusClass(status))}>{formatStatusLabel(status)}</span>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function ScrollToTop() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  return null;
}

function useHomeData() {
  const [properties, setProperties] = useState<NormalizedProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const featuredResult = await Promise.allSettled([api.featured()]);

        if (!active) return;

        const featuredPayload = featuredResult[0].status === "fulfilled" ? featuredResult[0].value : [];
        let normalized = enrichPropertyCollection(normalizeProperties(featuredPayload));
        normalized = normalized.filter(isSiripuramProperty);

        if (!normalized.length) {
          try {
            const listingPayload = await api.listProperties();
            normalized = enrichPropertyCollection(normalizeProperties(listingPayload));
            normalized = normalized.filter(isSiripuramProperty);
          } catch {
            // preserve the live error state below
          }
        }

        setProperties(normalized);
        setError(normalized.length ? "" : "Siripuram Gardens inventory is not available right now.");
      } catch (loadError: any) {
        if (!active) return;
        setProperties([]);
        setError(loadError?.message || "Unable to load properties.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return { properties, loading, error };
}

function normalizeProperties(payload: any) {
  const rawList = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.properties)
        ? payload.properties
        : [];

  return rawList
    .map((item: any) =>
      enrichProperty({
        id: firstString(item?.id, item?._id, item?.property_id),
        name: firstString(item?.name, item?.title, item?.property_name),
        category: firstString(item?.category, item?.type, item?.property_type, "Property"),
        location: firstString(item?.location, item?.city, item?.address),
        startingPrice:
          typeof item?.starting_price === "number"
            ? item.starting_price
            : typeof item?.price === "number"
              ? item.price
              : Number(String(item?.starting_price || item?.price || "").replace(/[^\d.]/g, "")) || undefined,
        size: firstString(item?.size, item?.area, item?.plot_size),
        image: firstString(item?.image, item?.hero_image, arrayOf(item?.images)[0]?.url, arrayOf(item?.images)[0]),
        images: arrayOf(item?.images)
          .map((image: any) => (typeof image === "string" ? image : firstString(image?.url)))
          .filter(Boolean),
        videoUrl: firstString(item?.video_url),
        description: firstString(item?.description, item?.summary),
        facing: firstString(item?.facing, item?.orientation),
        roadWidth: firstString(item?.road_width),
        availability: firstString(item?.availability, item?.inventory_summary),
        featured: Boolean(item?.featured),
        amenities: arrayOf(item?.amenities).filter(Boolean),
        approvals: arrayOf(item?.approvals).filter(Boolean),
        nearby: arrayOf(item?.nearby).filter(Boolean),
        highlights: firstString(item?.highlights, item?.hero_highlight),
        layoutPlans: arrayOf(item?.layout_plans).map((plan: any, index) => ({
          id: firstString(plan?.id, plan?._id, `plan-${index + 1}`),
          title: firstString(plan?.title, plan?.name, `Plan ${index + 1}`),
          image: firstString(plan?.image, plan?.url),
          description: firstString(plan?.description),
        })),
        featuresImage: firstString(item?.features_image),
      } as NormalizedProperty),
    )
    .filter((item: NormalizedProperty | null): item is NormalizedProperty => Boolean(item && item.id && item.name));
}

function ProfileDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user, signOut, updateUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(isPlaceholderEmail(user?.email) ? "" : String(user?.email || ""));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setName(user?.name || "");
    setEmail(isPlaceholderEmail(user?.email) ? "" : String(user?.email || ""));
  }, [user]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload: Record<string, any> = { name: name.trim() || user?.name };
      if (email.trim()) payload.email = email.trim();
      const nextUser = await api.updateProfile(payload);
      await updateUser(nextUser);
      setEditing(false);
      setMessage("Profile details saved.");
    } catch (saveError: any) {
      setError(saveError?.message || "Unable to save profile details right now.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn("drawer-backdrop", open && "is-open")} onClick={onClose} aria-hidden={!open}>
      <aside className={cn("profile-drawer", open && "is-open")} onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <span className="section-label">Account</span>
            <h2>Profile</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close profile">
            ×
          </button>
        </div>

        <section className="drawer-card drawer-user-card">
          <div className="avatar-lg">{(user?.name || "R").slice(0, 1).toUpperCase()}</div>
          <div className="drawer-user-copy">
            <h3>{user?.name || "Customer"}</h3>
            <p>{user?.phone || "Add your mobile number"}</p>
            <p>{isPlaceholderEmail(user?.email) ? "Enter your email" : user?.email || "Enter your email"}</p>
            <div className="drawer-meta">
              <StatusPill status={user?.kyc_status || "Pending"} />
              <StatusPill status={roleLabel(user)} />
            </div>
          </div>
        </section>

        <section className="drawer-card">
          <div className="drawer-section-head">
            <h3>Edit profile</h3>
            <button className="text-link" onClick={() => setEditing((value) => !value)}>
              {editing ? "Close" : "Edit"}
            </button>
          </div>
          {editing ? (
            <form className="stack-sm" onSubmit={handleSave}>
              <label className="field">
                <span>Name</span>
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter your name" />
              </label>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Enter your email"
                />
              </label>
              {error ? <div className="banner danger">{error}</div> : null}
              {message ? <div className="banner success">{message}</div> : null}
              <div className="button-row">
                <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Saving..." : "Save profile"}
                </button>
              </div>
            </form>
          ) : (
            <div className="stack-xs">
              <p>Keep your details current so your visits, enquiries, and documents stay in sync.</p>
            </div>
          )}
        </section>

        <section className="drawer-card">
          <div className="drawer-links">
            <Link to="/bookings" className="drawer-link" onClick={onClose}>
              My Bookings
            </Link>
            <Link to="/wishlist" className="drawer-link" onClick={onClose}>
              Saved Properties
            </Link>
            <Link to="/visits" className="drawer-link" onClick={onClose}>
              Site Visits
            </Link>
            <Link to="/myland" className="drawer-link" onClick={onClose}>
              My Land
            </Link>
            <Link to="/payments" className="drawer-link" onClick={onClose}>
              Payments
            </Link>
            <Link to="/relationship" className="drawer-link" onClick={onClose}>
              Relationship Desk
            </Link>
            <Link to="/documents" className="drawer-link" onClick={onClose}>
              Documents
            </Link>
            <Link to="/notifications" className="drawer-link" onClick={onClose}>
              Notifications
            </Link>
            <Link to="/services" className="drawer-link" onClick={onClose}>
              Help &amp; Support
            </Link>
          </div>
        </section>

        <button
          className="btn-secondary drawer-logout"
          onClick={async () => {
            await signOut();
            onClose();
          }}
        >
          Logout
        </button>
      </aside>
    </div>
  );
}

function isPlaceholderEmail(email?: string | null) {
  const value = String(email || "").trim().toLowerCase();
  return !value || value.includes("pendingagent@") || value.endsWith("@rivaan.com");
}

function Navbar({
  onOpenModal,
  onOpenProfile,
}: {
  onOpenModal: (modal: ModalType) => void;
  onOpenProfile: () => void;
}) {
  const { user, isAuthed } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <header className="site-header">
      <div className="container nav-inner">
        <Link to={HOME_PATH} className="brandmark">
          <img src={rivanLogo} alt="Rivan Reality" />
          <div>
            <strong>Rivan Reality</strong>
            <span>Achutapuram · Premium Plots</span>
          </div>
        </Link>

        <nav className={cn("nav-links", mobileOpen && "is-open")}>
          <a href={`${HOME_PATH}#properties`}>Properties</a>
          <a href={`${HOME_PATH}#workflow`}>Workflow</a>
          <a href={`${HOME_PATH}#about`}>Why choose us</a>
          <a href={`${HOME_PATH}#visits`}>Site Visits</a>
          <a href={`${HOME_PATH}#contact`}>Contact</a>
          {isAuthed ? (
            <button className="profile-chip" onClick={onOpenProfile}>
              <span className="avatar-sm">{(user?.name || "R").slice(0, 1).toUpperCase()}</span>
              <span>
                <strong>{user?.name || "Customer"}</strong>
                <small>{roleLabel(user)}</small>
              </span>
            </button>
          ) : (
            <>
              <button className="ghost-pill" onClick={() => onOpenModal("customer")}>
                Sign In
              </button>
              <button className="primary-pill" onClick={() => onOpenModal("customer")}>
                Get Started
              </button>
            </>
          )}
          <button className="mini-pill" onClick={() => onOpenModal("agent")}>
            Agent
          </button>
          <button className="mini-pill" onClick={() => onOpenModal("admin")}>
            Admin
          </button>
        </nav>

        <button className="mobile-trigger" onClick={() => setMobileOpen((value) => !value)} aria-label="Toggle menu">
          <span />
          <span />
          <span />
        </button>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer" id="contact">
      <div className="container footer-grid">
        <div>
          <div className="brandmark brandmark-footer">
          <img src={rivanLogo} alt="Rivan Reality" />
            <div>
                <strong>Rivan Reality</strong>
                <span>REAL-TIME PROPERTY PLATFORM</span>
            </div>
          </div>
            <p>Rivan Reality unifies property browsing, live layout access, OTP login, site visits, bookings, approvals, and CRM follow-up in one production-ready app.</p>
        </div>
        <div>
            <span className="section-label footer-label">Customer flow</span>
            <ul className="footer-links">
              <li>
                <a href={`${HOME_PATH}#properties`}>Properties</a>
              </li>
              <li>
                <a href={`${HOME_PATH}#layouts`}>Layouts</a>
              </li>
              <li>
                <a href={`${HOME_PATH}#visits`}>Site visits</a>
              </li>
            </ul>
        </div>
        <div>
            <span className="section-label footer-label">Operations</span>
            <ul className="footer-links">
              <li>
              <Link to="/agent">Agent access</Link>
            </li>
            <li>
              <Link to="/admin">Admin access</Link>
            </li>
            <li>
              <Link to="/notifications">Notifications</Link>
            </li>
          </ul>
        </div>
        <div>
            <span className="section-label footer-label">Platform highlights</span>
            <p>Live dashboards for visits and bookings, manager-only admin access, approval-based agent onboarding, and customer progress tracking from enquiry to conversion.</p>
        </div>
      </div>
    </footer>
  );
}

function SubpageHeader({ label, title, body }: { label: string; title: string; body: string }) {
  const navigate = useNavigate();

  return (
    <section className="subpage-hero">
      <div className="container page-head-wrap">
        <div className="subpage-hero-card">
          <div className="page-top-actions">
            <Link className="page-home-link" to={HOME_PATH}>
              Home
            </Link>
          <button
            type="button"
            className="page-back-button"
            onClick={() => {
              if (window.history.length > 1) navigate(-1);
              else navigate(HOME_PATH);
            }}
          >
            ← Go Back
          </button>
          </div>
          <span className="section-label">{label}</span>
          <h1>{title}</h1>
          <p>{body}</p>
        </div>
      </div>
    </section>
  );
}

const accountNavItems = [
  { to: "/bookings", label: "My Bookings" },
  { to: "/wishlist", label: "Saved Properties" },
  { to: "/visits", label: "Site Visits" },
  { to: "/myland", label: "My Land" },
  { to: "/payments", label: "Payments" },
  { to: "/relationship", label: "Relationship Desk" },
  { to: "/documents", label: "Documents" },
  { to: "/notifications", label: "Notifications" },
  { to: "/services", label: "Help & Support" },
];

function AccountQuickNav() {
  const location = useLocation();

  return (
    <div className="account-quick-nav" aria-label="Account sections">
      {accountNavItems.map((item) => (
        <Link key={item.to} to={item.to} className={cn("account-quick-link", location.pathname === item.to && "is-active")}>
          {item.label}
        </Link>
      ))}
    </div>
  );
}

function AccountShell({
  label,
  title,
  body,
  children,
}: {
  label: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();

  return (
    <section className="account-page-shell">
      <section className="account-hero section-green">
        <div className="container account-hero-grid">
          <div className="account-hero-copy">
            <div className="page-top-actions">
              <Link className="page-home-link page-home-link-light" to={HOME_PATH}>
                Home
              </Link>
            <button
              type="button"
              className="page-back-button page-back-button-light"
              onClick={() => {
                if (window.history.length > 1) navigate(-1);
                else navigate(HOME_PATH);
              }}
            >
              ← Go Back
            </button>
            </div>
            <div className="hero-eyebrow">
              <span className="hero-eyebrow-line" />
              <span>{label}</span>
            </div>
            <h1 className="editorial-title">
              {title}
              <br />
              <em>with the same clear</em>
              <br />
              <strong>Rivan Reality journey</strong>
            </h1>
            <p className="editorial-body">{body}</p>
          </div>
          <div className="account-hero-art" aria-hidden="true">
            <div className="account-art-orbit account-art-orbit-one" />
            <div className="account-art-orbit account-art-orbit-two" />
            <div className="account-art-card">
              <span className="section-label">Rivan Reality</span>
              <strong>{title}</strong>
              <em>Premium customer experience</em>
            </div>
          </div>
        </div>
      </section>
      <section className="account-content section-block section-white">
        <div className="container stack-lg">
          <div className="account-nav-shell">
            <AccountQuickNav />
          </div>
          {children}
        </div>
      </section>
    </section>
  );
}

function ModalShell({
  open,
  title,
  subtitle,
  variant = "default",
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  variant?: "default" | "admin";
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div
        className={`modal-box ${variant === "admin" ? "modal-box-admin" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <button className="icon-button modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function CustomerLoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signIn } = useAuth();
  const [phone, setPhone] = useState(() => storage.get("rivan_last_phone") || "");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"form" | "otp">("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const confirmationRef = useRef<any>(null);
  const recaptchaId = "customer-recaptcha";

  useEffect(() => {
    if (!open) return;
    setStep("form");
    setOtp("");
    setError("");
    setPhone(storage.get("rivan_last_phone") || "");
  }, [open]);

  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    const digits = normalizePhoneDigits(phone);
    if (digits.length !== 10) return setError("Enter a valid 10-digit mobile number.");
    if (!hasFirebaseConfig) return setError(firebaseConfigError);
    setError("");
    setLoading(true);
    try {
      storage.set("rivan_last_phone", digits);
      const auth = await getFirebaseAuth();
      const verifier = await createRecaptchaVerifier(recaptchaId);
      confirmationRef.current = await signInWithPhoneNumber(auth, `+91${digits}`, verifier);
      setStep("otp");
    } catch (requestError: any) {
      setError(requestError?.message || "Unable to send OTP right now.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    const digits = normalizePhoneDigits(phone);
    if (!confirmationRef.current) return setError("Request a new OTP and try again.");
    setError("");
    setLoading(true);
    try {
      const credential = await confirmationRef.current.confirm(otp.trim());
      const idToken = await credential.user.getIdToken();
      storage.set("rivan_last_phone", digits);
      const session = await api.firebaseAuth(idToken, `+91${digits}`);
      await signIn(session.access_token, session.user, session.refresh_token);
      onClose();
    } catch (verifyError: any) {
      setError(verifyError?.message || "OTP verification failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell open={open} title="Customer sign in" subtitle="Phone access" onClose={onClose}>
      <div className="stack-sm auth-panel">
        <div className="modal-header modal-header-inline">
          <div className="modal-header-left">
            <div className="modal-badge">Customer access</div>
            <h2 className="modal-title">Sign in</h2>
            <p className="modal-subtitle">Use your mobile number to continue.</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            x
          </button>
        </div>
        <form className="stack-sm" onSubmit={step === "form" ? requestOtp : verifyOtp}>
        <label className="field">
          <span>Phone number</span>
          <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Enter 10-digit mobile number" />
        </label>
        {step === "otp" ? (
          <label className="field">
            <span>OTP</span>
            <input value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="Enter the OTP sent to your phone" />
          </label>
        ) : null}
        <div id={recaptchaId} />
        {error ? <div className="banner danger">{error}</div> : null}
        <button className="btn-primary btn-block" type="submit" disabled={loading}>
          {loading ? "Please wait..." : step === "form" ? "Send OTP" : "Verify OTP"}
        </button>
        </form>
      </div>
    </ModalShell>
  );
}

function AgentApplyModal({
  open,
  onClose,
  initialPhone = "",
}: {
  open: boolean;
  onClose: () => void;
  initialPhone?: string;
}) {
  const [form, setForm] = useState({
    name: "",
    phone: initialPhone,
    email: "",
    occupation: "Property Advisor",
    address: "",
    aadhaar_number: "",
    bank_details: "",
    agent_brand_name: "",
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    setForm((current) => ({ ...current, phone: initialPhone || current.phone }));
  }, [initialPhone]);

  function updateField(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const phoneDigits = normalizePhoneDigits(form.phone);
    if (!form.name.trim() || phoneDigits.length !== 10 || !form.email.trim() || !form.address.trim()) {
      setError("Fill the required details before submitting the application.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccessMessage("");
    try {
      const response = await api.agentApply({
        name: form.name.trim(),
        phone: `+91${phoneDigits}`,
        email: form.email.trim(),
        occupation: form.occupation.trim() || undefined,
        address: form.address.trim(),
        aadhaar_number: form.aadhaar_number.trim() || undefined,
        bank_details: form.bank_details.trim() || undefined,
        agent_brand_name: form.agent_brand_name.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      setSuccessMessage(
        response?.message ||
          "Application submitted successfully. Awaiting manager approval. Use the same phone number again after approval.",
      );
    } catch (submitError: any) {
      setError(submitError?.message || "Unable to submit the application right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell open={open} title="Agent application" subtitle="Onboarding" onClose={onClose}>
      {successMessage ? (
        <div className="stack-sm auth-panel">
          <div className="modal-header modal-header-inline">
            <div className="modal-header-left">
              <div className="modal-badge">Agent application</div>
              <h2 className="modal-title">Apply</h2>
              <p className="modal-subtitle">Share your details for manager approval.</p>
            </div>
            <button className="modal-close" onClick={onClose} aria-label="Close">
              x
            </button>
          </div>
          <div className="banner success">{successMessage}</div>
          <button className="btn-primary btn-block" onClick={onClose}>
            Back to home
          </button>
        </div>
      ) : (
        <div className="stack-sm auth-panel">
          <div className="modal-header modal-header-inline">
            <div className="modal-header-left">
              <div className="modal-badge">Agent application</div>
              <h2 className="modal-title">Apply</h2>
              <p className="modal-subtitle">Share your details for manager approval.</p>
            </div>
            <button className="modal-close" onClick={onClose} aria-label="Close">
              x
            </button>
          </div>
          <form className="stack-sm" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="field">
              <span>Full name</span>
              <input value={form.name} onChange={(event) => updateField("name", event.target.value)} placeholder="Enter your full name" />
            </label>
            <label className="field">
              <span>Mobile number</span>
              <input value={form.phone} onChange={(event) => updateField("phone", event.target.value)} placeholder="Enter approved login number" />
            </label>
            <label className="field">
              <span>Email</span>
              <input type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} placeholder="Enter your email" />
            </label>
            <label className="field">
              <span>Occupation</span>
              <input value={form.occupation} onChange={(event) => updateField("occupation", event.target.value)} placeholder="Property Advisor" />
            </label>
            <label className="field field-full">
              <span>Address</span>
              <input value={form.address} onChange={(event) => updateField("address", event.target.value)} placeholder="Enter your working address" />
            </label>
            <label className="field">
              <span>Aadhaar number</span>
              <input value={form.aadhaar_number} onChange={(event) => updateField("aadhaar_number", event.target.value)} placeholder="Optional" />
            </label>
            <label className="field">
              <span>Bank details</span>
              <input value={form.bank_details} onChange={(event) => updateField("bank_details", event.target.value)} placeholder="Optional" />
            </label>
            <label className="field field-full">
              <span>Brand / agency name</span>
              <input value={form.agent_brand_name} onChange={(event) => updateField("agent_brand_name", event.target.value)} placeholder="Your agency or brand" />
            </label>
            <label className="field field-full">
              <span>Notes</span>
              <textarea value={form.notes} onChange={(event) => updateField("notes", event.target.value)} placeholder="Anything the manager should know" rows={4} />
            </label>
          </div>
          {error ? <div className="banner danger">{error}</div> : null}
          <button className="btn-primary btn-block" type="submit" disabled={loading}>
            {loading ? "Submitting..." : "Submit for manager approval"}
          </button>
          </form>
        </div>
      )}
    </ModalShell>
  );
}

function AgentLoginModal({
  open,
  onClose,
  onOpenApply,
}: {
  open: boolean;
  onClose: () => void;
  onOpenApply: (phone?: string) => void;
}) {
  const { signIn } = useAuth();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"form" | "otp" | "status">("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [actionMode, setActionMode] = useState<"apply" | "wait" | "rejected" | "otp" | null>(null);
  const confirmationRef = useRef<any>(null);
  const recaptchaId = "agent-recaptcha";

  useEffect(() => {
    if (!open) return;
    setPhone(storage.get("rivan_last_phone") || "");
    setOtp("");
    setStep("form");
    setError("");
    setStatusMessage("");
    setActionMode(null);
  }, [open]);

  async function handleContinue(event: FormEvent) {
    event.preventDefault();
    const digits = normalizePhoneDigits(phone);
    if (digits.length !== 10) return setError("Enter a valid 10-digit mobile number.");
    if (!hasFirebaseConfig) return setError(firebaseConfigError);
    setLoading(true);
    setError("");
    try {
      storage.set("rivan_last_phone", digits);
      const access = await api.agentAccessStatus(`+91${digits}`);
      const approvalStatus = String(access?.approval_status || access?.status || "").toLowerCase();
      if (approvalStatus === "approved" || access?.can_login) {
        const auth = await getFirebaseAuth();
        const verifier = await createRecaptchaVerifier(recaptchaId);
        confirmationRef.current = await signInWithPhoneNumber(auth, `+91${digits}`, verifier);
        setActionMode("otp");
        setStep("otp");
        return;
      }
      if (approvalStatus === "pending" || approvalStatus === "review") {
        setActionMode("wait");
        setStatusMessage(access?.message || "Your agent application is under review. Use the same phone number after approval.");
        setStep("status");
        return;
      }
      if (approvalStatus === "rejected") {
        setActionMode("rejected");
        setStatusMessage(access?.message || "This application needs an updated submission before access can be granted.");
        setStep("status");
        return;
      }
      setActionMode("apply");
      setStatusMessage(access?.message || "This number is not registered as an approved agent. Complete the application to continue.");
      setStep("status");
    } catch (continueError: any) {
      setError(continueError?.message || "Unable to check agent access right now.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    const digits = normalizePhoneDigits(phone);
    if (!confirmationRef.current) return setError("Request a new OTP and try again.");
    setLoading(true);
    setError("");
    try {
      const credential = await confirmationRef.current.confirm(otp.trim());
      const idToken = await credential.user.getIdToken();
      storage.set("rivan_last_phone", digits);
      const session = await api.agentFirebaseAuth(idToken, `+91${digits}`);
      await signIn(session.access_token, session.user, session.refresh_token);
      onClose();
    } catch (verifyError: any) {
      setError(verifyError?.message || "Agent OTP verification failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell open={open} title="Agent sign in" subtitle="Approved agents" onClose={onClose}>
      {step === "status" ? (
        <div className="stack-sm auth-panel">
          <div className="modal-header modal-header-inline">
            <div className="modal-header-left">
              <div className="modal-badge">Approved agents</div>
              <h2 className="modal-title">Agent sign in</h2>
              <p className="modal-subtitle">Use the number linked to your approval.</p>
            </div>
            <button className="modal-close" onClick={onClose} aria-label="Close">
              x
            </button>
          </div>
          <div className="banner warning">{statusMessage}</div>
          {actionMode === "apply" || actionMode === "rejected" ? (
            <button className="btn-primary btn-block" onClick={() => onOpenApply(phone)}>
              Complete agent application
            </button>
          ) : null}
          {actionMode === "wait" ? <div className="helper-copy">Await manager approval, then use the same phone number here.</div> : null}
        </div>
      ) : (
        <div className="stack-sm auth-panel">
          <div className="modal-header modal-header-inline">
            <div className="modal-header-left">
              <div className="modal-badge">Approved agents</div>
              <h2 className="modal-title">Agent sign in</h2>
              <p className="modal-subtitle">Use the number linked to your approval.</p>
            </div>
            <button className="modal-close" onClick={onClose} aria-label="Close">
              x
            </button>
          </div>
          <form className="stack-sm" onSubmit={step === "form" ? handleContinue : verifyOtp}>
            <label className="field">
              <span>Registered mobile number</span>
              <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Enter approved login number" />
            </label>
            {step === "otp" ? (
              <label className="field">
                <span>OTP</span>
                <input value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="Enter the OTP sent to your phone" />
              </label>
            ) : (
              <div className="helper-copy">Use the mobile number submitted for your agent approval.</div>
            )}
            <div id={recaptchaId} />
            {error ? <div className="banner danger">{error}</div> : null}
            <button className="btn-primary btn-block" type="submit" disabled={loading}>
              {loading ? "Please wait..." : step === "form" ? "Continue" : "Verify OTP"}
            </button>
            {step === "form" ? (
              <button className="btn-secondary btn-block" type="button" onClick={() => onOpenApply(phone)}>
                New agent? Apply first
              </button>
            ) : null}
          </form>
        </div>
      )}
    </ModalShell>
  );
}

function AdminLoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"form" | "otp">("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const confirmationRef = useRef<any>(null);
  const recaptchaId = "admin-recaptcha";

  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    const digits = normalizePhoneDigits(phone);
    if (digits.length !== 10) return setError("Enter a valid manager or admin mobile number.");
    setLoading(true);
    setError("");
    try {
      const access = await api.adminAccessStatus(`+91${digits}`);
      if (!(access?.can_login || ["approved", "active", "admin"].includes(String(access?.status || access?.approval_status || "").toLowerCase()))) {
        throw new Error(access?.message || "This phone number is not authorized for admin access.");
      }
      const auth = await getFirebaseAuth();
      const verifier = await createRecaptchaVerifier(recaptchaId);
      confirmationRef.current = await signInWithPhoneNumber(auth, `+91${digits}`, verifier);
      setStep("otp");
    } catch (requestError: any) {
      setError(requestError?.message || "Unable to send admin OTP right now.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    const digits = normalizePhoneDigits(phone);
    if (!confirmationRef.current) return setError("Request a new OTP and try again.");
    setLoading(true);
    setError("");
    try {
      const credential = await confirmationRef.current.confirm(otp.trim());
      const idToken = await credential.user.getIdToken();
      const session = await api.adminFirebaseAuth(idToken, `+91${digits}`);
      await signIn(session.access_token, session.user, session.refresh_token);
      navigate("/admin");
    } catch (verifyError: any) {
      setError(verifyError?.message || "Admin OTP verification failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell open={open} title="Admin sign in" subtitle="Authorized access" variant="admin" onClose={onClose}>
      <div className="stack-sm auth-panel auth-panel-admin">
        <div className="admin-modal-header admin-modal-header-inline">
          <div>
            <span className="admin-modal-badge">Authorized access</span>
            <h2 className="admin-modal-title">Admin sign in</h2>
          </div>
          <button className="admin-close" onClick={onClose} aria-label="Close">
            x
          </button>
        </div>
        <form className="stack-sm" onSubmit={step === "form" ? requestOtp : verifyOtp}>
        <label className="field">
          <span>Authorized mobile number</span>
          <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Enter admin or manager number" />
        </label>
        {step === "otp" ? (
          <label className="field">
            <span>OTP</span>
            <input value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="Enter the OTP sent to your phone" />
          </label>
        ) : (
          <div className="helper-copy">Only approved admin or manager numbers can continue here.</div>
        )}
        <div id={recaptchaId} />
        {error ? <div className="banner danger">{error}</div> : null}
        <button className="btn-primary btn-block" type="submit" disabled={loading}>
          {loading ? "Please wait..." : step === "form" ? "Send OTP" : "Verify OTP"}
        </button>
        </form>
      </div>
    </ModalShell>
  );
}

function PropertyCard({ property }: { property: NormalizedProperty }) {
  return (
    <article className="property-card">
      <Link to={`/property/${property.id}`} className="property-card-media">
        {property.image ? <img src={property.image} alt={property.name} /> : <div className="property-image-placeholder" />}
      </Link>
      <div className="property-card-body">
        <div className="property-card-row">
          <span className="eyebrow">{property.category}</span>
          <StatusPill status={property.availability || "Available"} />
        </div>
        <h3>{property.name}</h3>
        <p>{property.location}</p>
        <div className="property-card-row property-card-meta">
          <strong>{formatCurrency(property.startingPrice)}</strong>
          <span>{property.size || "Available now"}</span>
        </div>
        <div className="button-row">
          <Link className="btn-primary" to={`/property/${property.id}`}>
            View property
          </Link>
          <Link className="btn-secondary" to={`/layout/${property.id}`}>
            Layout
          </Link>
        </div>
      </div>
    </article>
  );
}

function SearchRibbon({ properties }: { properties: NormalizedProperty[] }) {
  const navigate = useNavigate();
  const [location, setLocation] = useState("Siripuram Gardens");
  const [category, setCategory] = useState("Plots");

  const locations = useMemo(() => {
    const values = new Set(["Siripuram Gardens", "Achutapuram"]);
    properties.forEach((property) => {
      if (property.location) values.add(property.location);
    });
    return Array.from(values);
  }, [properties]);

  const categories = ["Plots", "Independent House", "Layout Plans"];

  return (
    <form
      className="search-ribbon"
      onSubmit={(event) => {
        event.preventDefault();
        navigate(`${HOME_PATH}#properties`);
      }}
    >
      <label className="search-field">
        <span>Location</span>
        <select value={location} onChange={(event) => setLocation(event.target.value)}>
          {locations.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <label className="search-field">
        <span>Property type</span>
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          {categories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <button className="search-button" type="submit" aria-label="Search">
        Search
      </button>
    </form>
  );
}

function OnboardingArt({ step }: { step: number }) {
  if (step === 0) {
    return (
      <div className="onboarding-art onboarding-art-hero">
        <div className="onboarding-leaf leaf-a" />
        <div className="onboarding-leaf leaf-b" />
        <div className="onboarding-mark onboarding-mark-logo">
          <img src={rivanLogo} alt="Rivan Reality" />
        </div>
        <div className="onboarding-art-copy">
          <strong>Rivan Reality</strong>
          <span>Find. Explore.</span>
          <em>Own your future.</em>
          <p>Your journey to the perfect Siripuram Gardens home starts here.</p>
        </div>
        <img className="onboarding-hero-image" src={propertyImageOne} alt="Siripuram Gardens exterior" />
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="onboarding-art onboarding-art-card">
        <div className="onboarding-step-logo">
          <img src={rivanLogo} alt="Rivan Reality" />
        </div>
        <div className="onboarding-search">
          <span>Search property, location...</span>
          <div className="onboarding-search-icon" />
        </div>
        <div className="onboarding-property-preview">
          <img className="onboarding-property-image" src={propertyImageTwo} alt="Siripuram Gardens property" />
          <div className="onboarding-favorite favorite-a" />
          <div className="onboarding-favorite favorite-b" />
        </div>
        <div className="onboarding-property-card">
          <strong>Siripuram Estate</strong>
          <span>Achutapuram</span>
          <em>₹4,500 / sq.yd</em>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding-art onboarding-art-layout">
      <div className="onboarding-step-logo">
        <img src={rivanLogo} alt="Rivan Reality" />
      </div>
      <div className="onboarding-layout-map">
        <img className="onboarding-layout-image" src={propertyMapImage} alt="Siripuram Gardens layout map" />
        <div className="layout-pin">A-120</div>
      </div>
      <div className="onboarding-layout-toolbar">
        <div><span className="toolbar-dot" />Layout</div>
        <div><span className="toolbar-dot" />360° View</div>
        <div><span className="toolbar-dot" />Amenities</div>
        <div><span className="toolbar-dot" />Nearby</div>
      </div>
    </div>
  );
}

function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const isLastStep = step === ONBOARDING_STEPS.length - 1;

  function goHome() {
    navigate(HOME_PATH);
  }

  function goNext() {
    if (isLastStep) {
      navigate("/login");
      return;
    }
    setStep((value) => Math.min(value + 1, ONBOARDING_STEPS.length - 1));
  }

  const current = ONBOARDING_STEPS[step];

  return (
    <section className="onboarding-page">
      <div className="container onboarding-shell onboarding-shell-single">
        <div className="onboarding-stage">
          <div className="onboarding-phone">
            <div className="onboarding-topbar">
              <span>Rivan</span>
              <button className="onboarding-skip" onClick={goHome}>
                Skip
              </button>
            </div>
            <OnboardingArt step={step} />
            <div className="onboarding-copy">
              <div className="onboarding-icon-wrap">{step + 1}</div>
              <h1>{current.title}</h1>
              <p>{current.body}</p>
              <small>{current.accent}</small>
            </div>
            <div className="onboarding-progress">
              {ONBOARDING_STEPS.map((item, index) => (
                <button
                  key={item.id}
                  className={cn("onboarding-dot", index === step && "is-active")}
                  onClick={() => setStep(index)}
                  aria-label={`Go to step ${index + 1}`}
                />
              ))}
            </div>
            <div className="onboarding-actions">
              <button className="onboarding-secondary" onClick={goHome}>
                Explore as Guest
              </button>
              <button className="onboarding-primary" onClick={goNext}>
                <span>{isLastStep ? "Let's Get Started" : step === 0 ? "Get Started" : "Next"}</span>
                <span className="onboarding-arrow">→</span>
              </button>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}

function CustomerLoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState(() => storage.get("rivan_last_phone") || "");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"form" | "otp">("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const confirmationRef = useRef<any>(null);
  const recaptchaId = "customer-login-page-recaptcha";

  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    const digits = normalizePhoneDigits(phone);
    if (digits.length !== 10) return setError("Enter a valid 10-digit mobile number.");
    if (!hasFirebaseConfig) return setError(firebaseConfigError);
    setError("");
    setLoading(true);
    try {
      storage.set("rivan_last_phone", digits);
      const auth = await getFirebaseAuth();
      const verifier = await createRecaptchaVerifier(recaptchaId);
      confirmationRef.current = await signInWithPhoneNumber(auth, `+91${digits}`, verifier);
      setStep("otp");
    } catch (requestError: any) {
      setError(requestError?.message || "Unable to send OTP right now.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    const digits = normalizePhoneDigits(phone);
    if (!confirmationRef.current) return setError("Request a new OTP and try again.");
    setError("");
    setLoading(true);
    try {
      const credential = await confirmationRef.current.confirm(otp.trim());
      const idToken = await credential.user.getIdToken();
      const session = await api.firebaseAuth(idToken, `+91${digits}`);
      await signIn(session.access_token, session.user, session.refresh_token);
      navigate(HOME_PATH);
    } catch (verifyError: any) {
      setError(verifyError?.message || "OTP verification failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="login-page">
      <div className="container login-shell">
        <div className="login-preview-card">
          <div className="login-preview-top">
            <button className="login-back" onClick={() => navigate(-1)} aria-label="Go back">
              ←
            </button>
            <button className="onboarding-skip" onClick={() => navigate(HOME_PATH)}>
              Skip
            </button>
          </div>
          <div className="login-preview-hero">
            <img className="login-preview-image" src={propertyImageOne} alt="Rivan Reality property" />
          </div>
        </div>

        <div className="login-form-card">
          <div className="login-form-head">
            <span className="section-label">Customer sign in</span>
            <h2>Welcome Back</h2>
            <p>Sign in to continue with your customer account.</p>
          </div>
          <form className="login-form-stack" onSubmit={step === "form" ? requestOtp : verifyOtp}>
            <label className="field">
              <span>Mobile Number</span>
              <div className="login-input-shell">
                <div className="login-input-prefix">+91</div>
                <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Enter mobile number" />
              </div>
            </label>
            {step === "otp" ? (
              <label className="field">
                <span>OTP</span>
                <input value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="Enter the OTP sent to your phone" />
              </label>
            ) : null}
            <div id={recaptchaId} />
            {error ? <div className="banner danger">{error}</div> : null}
            <button className="login-submit" type="submit" disabled={loading}>
              {loading ? "Please wait..." : step === "form" ? "Send OTP" : "Login"}
            </button>
          </form>
          <div className="login-divider"><span>or continue with</span></div>
          <div className="login-shortcuts">
            <button className="login-shortcut" onClick={() => navigate("/agent-login")}>Agent</button>
            <button className="login-shortcut" onClick={() => navigate("/admin-login")}>Admin</button>
            <button className="login-shortcut" onClick={() => navigate(HOME_PATH)}>Guest</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function AuthPreviewCard({
  onBack,
  title,
  subtitle,
}: {
  onBack: () => void;
  title: string;
  subtitle: string;
}) {
  const navigate = useNavigate();

  return (
    <div className="login-preview-card">
      <div className="login-preview-top">
        <button className="login-back" onClick={onBack} aria-label="Go back">
          ←
        </button>
        <button className="onboarding-skip" onClick={() => navigate(HOME_PATH)}>
          Skip
        </button>
      </div>
      <div className="login-preview-hero">
        <img className="login-preview-image" src={propertyImageOne} alt="Rivan Reality property" />
        <div className="login-preview-copy">
          <span className="section-label">{subtitle}</span>
          <h1>{title}</h1>
        </div>
      </div>
    </div>
  );
}

function AgentLoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState(() => storage.get("rivan_last_phone") || "");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"form" | "otp" | "status">("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [actionMode, setActionMode] = useState<"apply" | "wait" | "rejected" | "otp" | null>(null);
  const confirmationRef = useRef<any>(null);
  const recaptchaId = "agent-login-page-recaptcha";

  async function handleContinue(event: FormEvent) {
    event.preventDefault();
    const digits = normalizePhoneDigits(phone);
    if (digits.length !== 10) return setError("Enter a valid 10-digit mobile number.");
    if (!hasFirebaseConfig) return setError(firebaseConfigError);
    setLoading(true);
    setError("");
    try {
      storage.set("rivan_last_phone", digits);
      const access = await api.agentAccessStatus(`+91${digits}`);
      const approvalStatus = String(access?.approval_status || access?.status || "").toLowerCase();
      if (approvalStatus === "approved" || access?.can_login) {
        const auth = await getFirebaseAuth();
        const verifier = await createRecaptchaVerifier(recaptchaId);
        confirmationRef.current = await signInWithPhoneNumber(auth, `+91${digits}`, verifier);
        setActionMode("otp");
        setStep("otp");
        return;
      }
      if (approvalStatus === "pending" || approvalStatus === "review") {
        setActionMode("wait");
        setStatusMessage(access?.message || "Your application is under review. Please use the same number after approval.");
        setStep("status");
        return;
      }
      if (approvalStatus === "rejected") {
        setActionMode("rejected");
        setStatusMessage(access?.message || "This application needs an updated submission before access can be granted.");
        setStep("status");
        return;
      }
      setActionMode("apply");
      setStatusMessage(access?.message || "This number is not registered as an approved agent. Complete the application to continue.");
      setStep("status");
    } catch (continueError: any) {
      setError(continueError?.message || "Unable to check agent access right now.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    const digits = normalizePhoneDigits(phone);
    if (!confirmationRef.current) return setError("Request a new OTP and try again.");
    setLoading(true);
    setError("");
    try {
      const credential = await confirmationRef.current.confirm(otp.trim());
      const idToken = await credential.user.getIdToken();
      storage.set("rivan_last_phone", digits);
      const session = await api.agentFirebaseAuth(idToken, `+91${digits}`);
      await signIn(session.access_token, session.user, session.refresh_token);
      navigate(HOME_PATH);
    } catch (verifyError: any) {
      setError(verifyError?.message || "Agent OTP verification failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="login-page">
      <div className="container login-shell">
        <AuthPreviewCard onBack={() => navigate(-1)} title="Agent Access" subtitle="Approved agents only" />

        <div className="login-form-card">
          <div className="login-form-head">
            <span className="section-label">Agent sign in</span>
            <h2>Continue with approval</h2>
            <p>Use the same phone number that was submitted for your agent approval.</p>
          </div>

          {step === "status" ? (
            <div className="login-form-stack">
              <div className={cn("banner", actionMode === "wait" ? "warning" : "danger")}>{statusMessage}</div>
              {(actionMode === "apply" || actionMode === "rejected") ? (
                <button className="login-submit" type="button" onClick={() => navigate("/agent-apply")}>
                  Complete agent application
                </button>
              ) : null}
              {actionMode === "wait" ? <div className="helper-copy">Wait for manager approval, then come back here with the same phone number.</div> : null}
              <button className="btn-secondary btn-block" type="button" onClick={() => setStep("form")}>
                Use another number
              </button>
            </div>
          ) : (
            <form className="login-form-stack" onSubmit={step === "form" ? handleContinue : verifyOtp}>
              <label className="field">
                <span>Registered mobile number</span>
                <div className="login-input-shell">
                  <div className="login-input-prefix">+91</div>
                  <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Enter approved login number" />
                </div>
              </label>
              {step === "otp" ? (
                <label className="field">
                  <span>OTP</span>
                  <input value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="Enter the OTP sent to your phone" />
                </label>
              ) : (
                <div className="helper-copy">New agents must apply first and wait for approval before entering the dashboard.</div>
              )}
              <div id={recaptchaId} />
              {error ? <div className="banner danger">{error}</div> : null}
              <button className="login-submit" type="submit" disabled={loading}>
                {loading ? "Please wait..." : step === "form" ? "Continue" : "Verify OTP"}
              </button>
              {step === "form" ? (
                <button className="btn-secondary btn-block" type="button" onClick={() => navigate("/agent-apply")}>
                  New agent? Apply first
                </button>
              ) : null}
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function AdminLoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState(() => storage.get("rivan_last_phone") || "");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"form" | "otp">("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const confirmationRef = useRef<any>(null);
  const recaptchaId = "admin-login-page-recaptcha";

  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    const digits = normalizePhoneDigits(phone);
    if (digits.length !== 10) return setError("Enter a valid manager or admin mobile number.");
    if (!hasFirebaseConfig) return setError(firebaseConfigError);
    setLoading(true);
    setError("");
    try {
      storage.set("rivan_last_phone", digits);
      const access = await api.adminAccessStatus(`+91${digits}`);
      if (!(access?.can_login || ["approved", "active", "admin"].includes(String(access?.status || access?.approval_status || "").toLowerCase()))) {
        throw new Error(access?.message || "This phone number is not authorized for admin access.");
      }
      const auth = await getFirebaseAuth();
      const verifier = await createRecaptchaVerifier(recaptchaId);
      confirmationRef.current = await signInWithPhoneNumber(auth, `+91${digits}`, verifier);
      setStep("otp");
    } catch (requestError: any) {
      setError(requestError?.message || "Unable to send admin OTP right now.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    const digits = normalizePhoneDigits(phone);
    if (!confirmationRef.current) return setError("Request a new OTP and try again.");
    setLoading(true);
    setError("");
    try {
      const credential = await confirmationRef.current.confirm(otp.trim());
      const idToken = await credential.user.getIdToken();
      const session = await api.adminFirebaseAuth(idToken, `+91${digits}`);
      await signIn(session.access_token, session.user, session.refresh_token);
      navigate("/admin");
    } catch (verifyError: any) {
      setError(verifyError?.message || "Admin OTP verification failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="login-page">
      <div className="container login-shell">
        <AuthPreviewCard onBack={() => navigate(-1)} title="Admin Access" subtitle="Authorized numbers only" />

        <div className="login-form-card">
          <div className="login-form-head">
            <span className="section-label">Admin sign in</span>
            <h2>Manager verification</h2>
            <p>Only approved admin or manager numbers can continue here.</p>
          </div>
          <form className="login-form-stack" onSubmit={step === "form" ? requestOtp : verifyOtp}>
            <label className="field">
              <span>Authorized mobile number</span>
              <div className="login-input-shell">
                <div className="login-input-prefix">+91</div>
                <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Enter admin or manager number" />
              </div>
            </label>
            {step === "otp" ? (
              <label className="field">
                <span>OTP</span>
                <input value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="Enter the OTP sent to your phone" />
              </label>
            ) : (
              <div className="helper-copy">This access is restricted to the manager and approved admin numbers only.</div>
            )}
            <div id={recaptchaId} />
            {error ? <div className="banner danger">{error}</div> : null}
            <button className="login-submit" type="submit" disabled={loading}>
              {loading ? "Please wait..." : step === "form" ? "Send OTP" : "Verify OTP"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

function HomePage({
  forcedModal = null,
  profileOpen = false,
}: {
  forcedModal?: ModalType;
  profileOpen?: boolean;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeModal, setActiveModal] = useState<ModalType>(forcedModal);
  const [drawerOpen, setDrawerOpen] = useState(profileOpen);
  const [applyPhone, setApplyPhone] = useState("");
  const { properties, loading, error } = useHomeData();
  const flagship = properties.find((item) => isSiripuramProperty(item)) || getFallbackProperty("prop-1");
  const propertyTypes = useMemo(() => {
    const unique = new Set<string>();
    properties.forEach((property) => {
      const label = firstString(property.category, "Plots");
      if (label) unique.add(label);
    });
    return Array.from(unique).slice(0, 5);
  }, [properties]);

  useEffect(() => {
    setActiveModal(forcedModal);
  }, [forcedModal]);

  useEffect(() => {
    setDrawerOpen(profileOpen);
  }, [profileOpen]);

  useEffect(() => {
    if (user && forcedModal) {
      setActiveModal(null);
    }
  }, [forcedModal, user]);

  useEffect(() => {
    if (roleLabel(user) === "Admin" && window.location.pathname !== "/admin") {
      navigate("/admin");
    }
  }, [navigate, user]);

  function openModal(modal: ModalType) {
    setActiveModal(modal);
    if (modal === "customer") navigate("/login");
    if (modal === "agent") navigate("/agent-login");
    if (modal === "admin") navigate("/admin-login");
    if (modal === "apply") navigate("/agent-apply");
  }

  function closeModal() {
    setActiveModal(null);
    if (window.location.pathname !== HOME_PATH) {
      navigate(HOME_PATH);
    }
  }

  return (
    <div className="page-shell">
      <Navbar
        onOpenModal={(modal) => openModal(modal)}
        onOpenProfile={() => {
          setDrawerOpen(true);
          navigate("/profile");
        }}
      />

      <main>
        <section className="hero-section section-green" id="top">
          <div className="editorial-hero editorial-hero-split">
            <div className="editorial-left">
              <div className="editorial-copy">
                <div className="hero-eyebrow">
                  <span className="hero-eyebrow-line" />
                  <span>Approved layout · Achutapuram</span>
                </div>
                <h1 className="editorial-title">
                  Rivan Reality
                  <br />
                  <em>property journeys</em>
                  <br />
                  <strong>made clear, warm, and trackable</strong>
                </h1>
                <p className="editorial-body">Rivan Reality helps customers discover Siripuram Gardens, understand the layout, request visits, and continue into bookings from one calm place that also keeps agents and admins aligned.</p>
                <div className="button-row editorial-actions">
                  <a className="btn-primary" href={`${HOME_PATH}#properties`}>
                    Explore Properties
                  </a>
                  <a className="btn-secondary" href={`${HOME_PATH}#visits`}>
                    Book a Site Visit
                  </a>
                </div>
                <div className="account-quick-nav home-quick-nav">
                  {HOME_QUICK_LINKS.map((item) =>
                    "to" in item ? (
                      <Link key={item.label} className="account-quick-link" to={item.to}>
                        {item.label}
                      </Link>
                    ) : (
                      <a key={item.label} className="account-quick-link" href={item.href}>
                        {item.label}
                      </a>
                    )
                  )}
                </div>
                <div className="hero-note-grid">
                  <article className="hero-note-card">
                    <span className="section-label">Clarity</span>
                    <h3>Everything important, in one place</h3>
                    <p>Property details, layouts, visits, and follow-up stay connected instead of scattered.</p>
                  </article>
                  <article className="hero-note-card">
                    <span className="section-label">Progress</span>
                    <h3>Better next steps for every role</h3>
                    <p>Customers browse, agents guide, and admins review live actions with less friction.</p>
                  </article>
                </div>
                <div className="hero-stats editorial-stats">
                  <div>
                    <strong>{properties.length || 0}</strong>
                    <span>Listings</span>
                  </div>
                  <div>
                    <strong>1</strong>
                    <span>Flagship layout</span>
                  </div>
                  <div>
                    <strong>OTP</strong>
                    <span>Secure access</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="editorial-right">
              <div className="hero-video-shell">
                <video className="hero-video" autoPlay muted loop playsInline preload="metadata">
                  <source src="https://res.cloudinary.com/dzisksq78/video/upload/v1780939161/villa_1_ltxt2q.mp4" type="video/mp4" />
                </video>
                <div className="hero-video-overlay" />
                <div className="hero-video-caption">
                  <span>Siripuram Gardens</span>
                  <strong>See the project before the visit</strong>
                </div>
              </div>
            </div>
          </div>
          <div className="container ribbon-wrap editorial-ribbon-wrap">
            <SearchRibbon properties={properties} />
          </div>
          <div className="container hero-trust-strip">
            <div className="hero-trust-card">
              <span className="section-label">Why this feels easier</span>
              <div className="hero-trust-points">
                <p>Siripuram Gardens stays as the main project journey</p>
                <p>Visits, bookings, and approvals stay connected</p>
                <p>Customers, agents, and admin all move in one flow</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section-block section-white" id="workflow">
          <div className="container">
            <div className="section-head">
              <div>
                <span className="section-label">How it works</span>
                <h2 className="section-title">A guided real-estate flow that stays easy to understand.</h2>
              </div>
              <p className="section-subtitle">Every important action stays visible and connected, so people can move from discovery to follow-up without confusion.</p>
            </div>
            <div className="workflow-grid">
              <article className="workflow-card">
                <span className="workflow-step">01</span>
                <h3>Explore with confidence</h3>
                <p>Browse the project, compare details, and understand the property before making the next move.</p>
              </article>
              <article className="workflow-card">
                <span className="workflow-step">02</span>
                <h3>Sign in with OTP</h3>
                <p>Customers, agents, and admins all enter with secure phone access tailored to their role.</p>
              </article>
              <article className="workflow-card">
                <span className="workflow-step">03</span>
                <h3>Request visits and bookings</h3>
                <p>Visits, plot enquiries, and support actions move straight into the live admin and CRM flow.</p>
              </article>
              <article className="workflow-card">
                <span className="workflow-step">04</span>
                <h3>Track and continue</h3>
                <p>Approvals, CRM activity, and customer updates stay aligned so follow-up feels faster and more reliable.</p>
              </article>
            </div>
          </div>
        </section>

          <section className="section-block section-white" id="properties">
            <div className="container">
              <div className="section-head">
                <div>
                  <span className="section-label">Properties</span>
                  <h2 className="section-title">Explore the project through a calmer property view.</h2>
                </div>
                <p className="section-subtitle">The cards are designed to help people decide faster: what it is, where it is, how much it starts at, and what to do next.</p>
              </div>
              <div className="account-quick-nav property-type-nav" id="property-types">
                <a className="account-quick-link is-active" href={`${HOME_PATH}#properties`}>
                  All Properties
                </a>
                {propertyTypes.map((type) => (
                  <a key={type} className="account-quick-link" href={`${HOME_PATH}#properties`}>
                    {type}
                  </a>
                ))}
              </div>
              <div className="highlight-grid">
                <article className="highlight-card">
                  <span className="section-label">Availability</span>
                  <h3>Live property visibility</h3>
                  <p>Open the listing, enter the layout, and continue to the next step without losing context.</p>
                </article>
                <article className="highlight-card">
                  <span className="section-label">Layout ready</span>
                  <h3>Plot-first decision making</h3>
                  <p>Let users understand the project visually before they request a visit or booking.</p>
                </article>
                <article className="highlight-card">
                  <span className="section-label">Support flow</span>
                  <h3>Connected next steps</h3>
                  <p>Visits, enquiries, and approvals all remain tied to the same property journey.</p>
                </article>
              </div>
            {loading ? (
              <div className="card-grid">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div className="skeleton-card" key={index} />
                ))}
              </div>
            ) : properties.length ? (
              <div className="card-grid">
                {properties.map((property) => (
                  <PropertyCard key={property.id} property={property} />
                ))}
              </div>
            ) : (
              <EmptyState title="Siripuram Gardens is unavailable" body={error || "Please check back in a moment."} />
            )}
          </div>
        </section>

        <section className="section-block split-section" id="visits">
          <div className="container split-grid">
            <div className="surface-card visit-form-card">
              <span className="section-label">Schedule a visit</span>
              <h2 className="section-title">Book a visit without friction.</h2>
              <VisitBookingPanel property={flagship} />
            </div>
            <div className="surface-card visit-info-card">
              <span className="section-label">Visit readiness</span>
              <h2 className="section-title">Everything a customer should understand before arriving.</h2>
              <div className="visit-readiness-list">
                <article className="visit-readiness-item">
                  <strong>Property context</strong>
                  <p>{flagship?.name || "Siripuram Gardens"} stays as the main project reference across the visit journey.</p>
                </article>
                <article className="visit-readiness-item">
                  <strong>Location clarity</strong>
                  <p>{flagship?.location || "Achutapuram"} stays visible so the visit, enquiry, and admin queue remain aligned.</p>
                </article>
                <article className="visit-readiness-item">
                  <strong>Next action</strong>
                  <p>After the request, the same account can continue with updates, approvals, support, and bookings.</p>
                </article>
              </div>
              {flagship ? (
                <Link className="text-link visit-link" to={`/property/${flagship.id}`}>
                  Open property details
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        <section className="section-block section-white">
          <div className="container">
            <div className="section-head">
              <div>
                <span className="section-label">Experience</span>
                <h2 className="section-title">A home experience that feels calmer, clearer, and more modern.</h2>
              </div>
              <p className="section-subtitle">The home journey now uses quieter cards, softer structure, and clearer actions inspired by the onboarding style.</p>
            </div>
            <div className="experience-grid">
              <article className="experience-card">
                <span className="workflow-step">A</span>
                <h3>Less clutter</h3>
                <p>Important actions are surfaced first, while secondary details stay easy to discover without overwhelming the screen.</p>
              </article>
              <article className="experience-card">
                <span className="workflow-step">B</span>
                <h3>Role-aware journeys</h3>
                <p>Customers browse and book, agents guide and apply, and admins review live activity from a cleaner information hierarchy.</p>
              </article>
              <article className="experience-card">
                <span className="workflow-step">C</span>
                <h3>Responsive by default</h3>
                <p>The same design language now scales more gracefully on phones, tablets, and desktops for a more polished feel.</p>
              </article>
            </div>
          </div>
        </section>
      </main>

      <Footer />

      <CustomerLoginModal open={activeModal === "customer"} onClose={closeModal} />
      <AgentLoginModal
        open={activeModal === "agent"}
        onClose={closeModal}
        onOpenApply={(phone) => {
          setApplyPhone(phone || "");
          setActiveModal("apply");
          navigate("/agent-apply");
        }}
      />
      <AdminLoginModal open={activeModal === "admin"} onClose={closeModal} />
      <AgentApplyModal
        open={activeModal === "apply"}
        initialPhone={applyPhone}
        onClose={() => {
          closeModal();
          setApplyPhone("");
        }}
      />
      <ProfileDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          if (window.location.pathname === "/profile") navigate(HOME_PATH);
        }}
      />
    </div>
  );
}

function VisitBookingPanel({ property }: { property: NormalizedProperty | null }) {
  const { user, isAuthed } = useAuth();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [date, setDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setName(user?.name || "");
    setMobile(String(user?.phone || "").replace(/^\+91/, ""));
  }, [user]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isAuthed) {
      setError("Sign in with your phone number to schedule a visit.");
      return;
    }
    if (!name.trim() || normalizePhoneDigits(mobile).length !== 10 || !date) {
      setError("Enter your name, mobile number, and preferred visit date.");
      return;
    }
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      if (!property) throw new Error("Property details are not available.");
      const targetPropertyId = isSiripuramProperty(property) ? property.id : "prop-1";
      await api.bookSiteVisit({
        property_id: targetPropertyId,
        visit_date: date,
        name: name.trim(),
        mobile: normalizePhoneDigits(mobile),
      });
      setMessage("Site visit requested. Your assigned agent will review it first, then the admin team will schedule it.");
    } catch (submitError: any) {
      setError(submitError?.message || "Unable to schedule the visit right now.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="stack-sm" onSubmit={submit}>
      <div className="helper-copy">Choose your preferred date and request a guided Siripuram Gardens visit.</div>
      <div className="form-grid">
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter your name" />
        </label>
        <label className="field">
          <span>Mobile</span>
          <input value={mobile} onChange={(event) => setMobile(event.target.value)} placeholder="Enter your phone number" />
        </label>
        <label className="field">
          <span>Visit date</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
      </div>
      {message ? <div className="banner success">{message}</div> : null}
      {error ? <div className="banner danger">{error}</div> : null}
      <button className="btn-primary" type="submit" disabled={submitting}>
        {submitting ? "Submitting..." : "Schedule visit"}
      </button>
    </form>
  );
}

function AppFrame({
  children,
  openModal,
  openProfile,
  drawerOpen,
  closeProfile,
  forcedModal = null,
}: {
  children: React.ReactNode;
  openModal: (modal: ModalType) => void;
  openProfile: () => void;
  drawerOpen: boolean;
  closeProfile: () => void;
  forcedModal?: ModalType;
}) {
  const { role } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (role === "admin" && window.location.pathname !== "/admin") {
      navigate("/admin", { replace: true });
    }
  }, [navigate, role]);

  return (
    <div className="page-shell">
      <main className="subpage-main">{children}</main>
      <CustomerLoginModal open={forcedModal === "customer"} onClose={() => openModal(null)} />
      <AgentLoginModal open={forcedModal === "agent"} onClose={() => openModal(null)} onOpenApply={() => openModal("apply")} />
      <AdminLoginModal open={forcedModal === "admin"} onClose={() => openModal(null)} />
      <AgentApplyModal open={forcedModal === "apply"} onClose={() => openModal(null)} />
      <ProfileDrawer open={drawerOpen} onClose={closeProfile} />
    </div>
  );
}

function PropertyPage() {
  const { id = "" } = useParams();
  const [property, setProperty] = useState<NormalizedProperty | null>(() => getFallbackProperty(id));
  const [plotCtaId, setPlotCtaId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.allSettled([api.getProperty(id), api.getPropertyPlots(id)])
      .then(([propertyResult, plotsResult]) => {
        if (!active) return;
        if (propertyResult.status === "fulfilled") {
          const item = enrichProperty(normalizeProperties([propertyResult.value])[0] || null);
          setProperty(item);
        } else {
          setProperty(null);
          setError(propertyResult.reason?.message || "Unable to load the property.");
        }

        if (plotsResult.status === "fulfilled") {
          const blocks = normalizePlotBlocks(plotsResult.value);
          const preferred = blocks.find((block) => block.status === "available") || blocks[0] || null;
          setPlotCtaId(preferred?.id || "");
        } else {
          setPlotCtaId("");
        }
      })
      .catch((loadError: any) => {
        if (active) setError(loadError?.message || "Unable to load the property.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (!property || !isSiripuramProperty(property)) return <PageSection title="Property unavailable" body={error || "Siripuram Gardens details are not available right now."} />;

  return (
    <section className="page-section">
      <SubpageHeader label="Property details" title={property.name} body="Review pricing, facing, approvals, and visit options for Siripuram Gardens." />
      <div className="container property-detail-grid">
        <div className="property-gallery">
          <div className="gallery-hero">
            <img src={property.images[0] || property.image} alt={property.name} />
          </div>
          <div className="gallery-strip">
            {property.images.slice(1).map((image, index) => (
              <img key={`${image}-${index}`} src={image} alt={`${property.name} ${index + 2}`} />
            ))}
          </div>
        </div>
        <div className="property-summary inner-panel">
          <span className="section-label">{property.category}</span>
          <h1>{property.name}</h1>
          <p>{property.location}</p>
          <div className="price-lockup">
            <strong>{formatCurrency(property.startingPrice)}</strong>
            <span>{property.size || property.availability || "Available now"}</span>
          </div>
          <p className="property-description">{property.description}</p>
          <div className="detail-list compact">
            <div>
              <span>Facing</span>
              <strong>{property.facing || "Available on request"}</strong>
            </div>
            <div>
              <span>Road width</span>
              <strong>{property.roadWidth || "Available on request"}</strong>
            </div>
            <div>
              <span>Availability</span>
              <strong>{property.availability || "Available now"}</strong>
            </div>
          </div>
          <div className="button-row">
            <Link className="btn-primary" to={`/layout/${property.id}`}>
              View layout
            </Link>
            {plotCtaId ? (
              <Link className="btn-secondary" to={`/booking/${plotCtaId}`}>
                Book enquiry
              </Link>
            ) : null}
          </div>
        </div>
      </div>
      {property.layoutPlans.length ? (
        <div className="container layout-preview-grid">
          {property.layoutPlans.slice(0, 2).map((plan) => (
            <article className="surface-card surface-card-soft layout-preview-card" key={plan.id}>
              <span className="section-label">{plan.title}</span>
              {plan.image ? <img className="layout-preview-image" src={plan.image} alt={plan.title} /> : null}
              <p>{plan.description || "Layout preview available."}</p>
            </article>
          ))}
        </div>
      ) : null}
      <div className="container property-meta-grid">
        <section className="surface-card surface-card-soft">
          <span className="section-label">Amenities</span>
          <div className="chips-wrap">
            {property.amenities.map((item) => (
              <span key={item} className="meta-chip">
                {item}
              </span>
            ))}
          </div>
        </section>
        <section className="surface-card surface-card-green">
          <span className="section-label">Approvals</span>
          <div className="chips-wrap">
            {property.approvals.map((item) => (
              <span key={item} className="meta-chip">
                {item}
              </span>
            ))}
          </div>
        </section>
        <section className="surface-card surface-card-soft">
          <span className="section-label">Nearby</span>
          <div className="stack-xs">
            {property.nearby.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function LayoutPage() {
  const { id = "" } = useParams();
  const [property, setProperty] = useState<NormalizedProperty | null>(() => getFallbackProperty(id));
  const [plotBlocks, setPlotBlocks] = useState<PropertyMapBlock[]>(() => getFallbackProperty(id)?.mapBlocks || []);
  const [selected, setSelected] = useState<PropertyMapBlock | null>(() => {
    const blocks = getFallbackProperty(id)?.mapBlocks || [];
    return blocks.find((block: PropertyMapBlock) => block.status === "available") || blocks[0] || null;
  });

  useEffect(() => {
    let active = true;
    Promise.allSettled([api.getProperty(id), api.getPropertyPlots(id)]).then(([propertyResult, plotsResult]) => {
      if (!active) return;

      if (propertyResult.status === "fulfilled") {
        const nextProperty = enrichProperty(normalizeProperties([propertyResult.value])[0] || null);
        setProperty(nextProperty);
      } else {
        setProperty(null);
      }

      const nextBlocks: PropertyMapBlock[] =
        plotsResult.status === "fulfilled"
          ? normalizePlotBlocks(plotsResult.value)
          : [];

      setPlotBlocks(nextBlocks);
      setSelected(nextBlocks.find((block) => block.status === "available") || nextBlocks[0] || null);
    }).catch(() => {
      setProperty(null);
      setPlotBlocks([]);
      setSelected(null);
    });
    return () => {
      active = false;
    };
  }, [id]);

  if (!property || !isSiripuramProperty(property)) return <PageSection title="Layout view" body="Siripuram Gardens layout details are not available right now." />;

  return (
    <section className="page-section">
      <SubpageHeader label="Layout" title="Siripuram Gardens layout" body="Pick a plot to review size, facing, and current availability." />
      <div className="container layout-grid-page">
        <div className="surface-card surface-card-soft">
          <span className="section-label">Layout explorer</span>
          <h1>{property.name}</h1>
          <p>{property.location}</p>
          <div className="legend-row">
            <span className="legend-item"><i className="dot available" /> Available</span>
            <span className="legend-item"><i className="dot reserved" /> Reserved</span>
            <span className="legend-item"><i className="dot booked" /> Booked</span>
            <span className="legend-item"><i className="dot sold" /> Sold</span>
          </div>
          <div className="layout-block-grid">
            {plotBlocks.map((block) => (
              <button
                type="button"
                key={block.id}
                className={cn("plot-block", block.status, selected?.id === block.id && "is-selected")}
                onClick={() => setSelected(block)}
              >
                <strong>{block.label}</strong>
                <span>{block.sizeSqYd}</span>
              </button>
            ))}
          </div>
        </div>
        <aside className="surface-card surface-card-green plot-sidebar">
          <span className="section-label">Selected plot</span>
          {selected ? (
            <div className="stack-sm">
              <h2>{selected.label}</h2>
              <StatusPill status={selected.status} />
              <div className="detail-list compact">
                <div>
                  <span>Area</span>
                  <strong>{selected.size}</strong>
                </div>
                <div>
                  <span>Facing</span>
                  <strong>{selected.facing}</strong>
                </div>
                <div>
                  <span>Indicative price</span>
                  <strong>{formatCurrency(selected.price)}</strong>
                </div>
              </div>
              <Link className="btn-primary btn-block" to={`/booking/${selected.id}`}>
                Continue to booking
              </Link>
            </div>
          ) : (
            <EmptyState title="Choose a plot" body="Live plot availability will appear here when the backend inventory loads." />
          )}
        </aside>
      </div>
    </section>
  );
}

function CentrePage() {
  return (
    <section className="page-section">
      <SubpageHeader
        label="Visit desk"
        title="Siripuram Gardens assistance"
        body="Use this page to continue with visit planning, general questions, and the next step for your enquiry."
      />
      <div className="container narrow-page">
        <div className="surface-card surface-card-green stack-md">
          <span className="section-label">Customer support</span>
          <h1>Siripuram Gardens visit desk</h1>
          <p>Need help before your visit? Use the property page or the layout page to continue with a real enquiry and site-visit request.</p>
          <div className="button-row">
            <Link className="btn-primary" to="/property/prop-1">
              Open property
            </Link>
            <Link className="btn-secondary" to="/layout/prop-1">
              Open layout
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function BookingPage() {
  const { user, isAuthed } = useAuth();
  const { plotId = "" } = useParams();
  const [plot, setPlot] = useState<any>(null);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setName(user?.name || "");
    setMobile(String(user?.phone || "").replace(/^\+91/, ""));
  }, [user]);

  useEffect(() => {
    let active = true;
    api
      .getPlot(plotId)
      .then((payload) => {
        if (active) setPlot(payload);
      })
      .catch(() => {
        setPlot(null);
      });
    return () => {
      active = false;
    };
  }, [plotId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isAuthed) {
      setStatus("Sign in with your phone number to submit a plot booking.");
      return;
    }
    if (!name.trim() || normalizePhoneDigits(mobile).length !== 10) {
      setStatus("Enter your full name and a valid 10-digit mobile number.");
      return;
    }
    setLoading(true);
    setStatus("");
    try {
      await api.createBooking({
        plot_id: plotId,
        name: name.trim(),
        mobile: normalizePhoneDigits(mobile),
        message: notes.trim(),
      });
      setStatus("Booking request submitted successfully.");
      setNotes("");
    } catch (submitError: any) {
      setStatus(submitError?.message || "Unable to submit the booking right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page-section">
      <SubpageHeader label="Booking enquiry" title="Reserve your interest" body="Share your details and our Siripuram Gardens team will contact you with the next step." />
      <div className="container narrow-page">
        <div className="surface-card surface-card-soft stack-md">
          <span className="section-label">Booking request</span>
          <h1>Continue with this plot</h1>
          <p>{firstString(plot?.name, plot?.label, plot?.plot_number, `Plot ${plotId}`)}</p>
          <form className="stack-sm" onSubmit={submit}>
            <label className="field">
              <span>Full name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter your full name" />
            </label>
            <label className="field">
              <span>Mobile number</span>
              <input value={mobile} onChange={(event) => setMobile(event.target.value)} placeholder="Enter your mobile number" />
            </label>
            <label className="field">
              <span>Message</span>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add any note for the booking desk" rows={4} />
            </label>
            {status ? <div className={cn("banner", status.toLowerCase().includes("success") ? "success" : "warning")}>{status}</div> : null}
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? "Submitting..." : "Submit booking"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

function CollectionPage({
  label = "My account",
  title,
  subtitle,
  loader,
  renderItem,
  requiresAuth = false,
  refreshMs = 12000,
}: {
  label?: string;
  title: string;
  subtitle: string;
  loader: () => Promise<any>;
  renderItem: (item: any, index: number) => React.ReactNode;
  requiresAuth?: boolean;
  refreshMs?: number;
}) {
  const { isAuthed } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (requiresAuth && !isAuthed) return;
    let active = true;
    const loadItems = () =>
      loader()
        .then((payload) => {
          if (!active) return;
          setItems(arrayOf(payload?.items || payload?.results || payload).filter((item) => !isLegacyMockUiRecord(item)));
          setError("");
        })
        .catch((loadError: any) => {
          if (active) setError(loadError?.message || "Unable to load data right now.");
        });
    void loadItems();
    const timer = window.setInterval(() => {
      void loadItems();
    }, refreshMs);
    const reloadOnFocus = () => {
      if (document.visibilityState === "visible") void loadItems();
    };
    window.addEventListener("focus", reloadOnFocus);
    document.addEventListener("visibilitychange", reloadOnFocus);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", reloadOnFocus);
      document.removeEventListener("visibilitychange", reloadOnFocus);
    };
  }, [isAuthed, loader, refreshMs, requiresAuth]);

  if (requiresAuth && !isAuthed) {
    return <CustomerProtectedMessage title="Customer sign in required" body={`Sign in with your phone number to access ${title.toLowerCase()}.`} />;
  }

  return (
    <AccountShell label={label} title={title} body={subtitle}>
      <div className="account-section-head">
        <div>
          <span className="section-label">Overview</span>
          <h2>{title}</h2>
        </div>
        <p>{subtitle}</p>
      </div>
      <section className="surface-card surface-card-soft account-list-panel">
        <span className="section-label">Live records</span>
        {items.length ? <div className="list-stack">{items.map(renderItem)}</div> : <EmptyState title={title} body={error || "No records are available right now."} />}
      </section>
    </AccountShell>
  );
}

function AgentPage() {
  const { role } = useAuth();
  const [dashboard, setDashboard] = useState<any>(null);
  const [visits, setVisits] = useState<any[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      const results = await Promise.allSettled([api.agentDashboard(), api.agentSiteVisits()]);
      if (!active) return;
      if (results[0].status === "fulfilled") setDashboard(results[0].value);
      if (results[1].status === "fulfilled") setVisits(arrayOf(results[1].value?.items || results[1].value?.visits || results[1].value));
      if (results[0].status === "rejected" && results[1].status === "rejected") {
        setError("Unable to load the agent page.");
      } else {
        setError("");
      }
    }

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 30000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

    if (role !== "agent") return <ProtectedMessage title="Agent access only" body="This page opens only for approved Siripuram Gardens agents." />;

  return (
      <section className="page-section">
        <div className="container stack-lg">
          <SubpageHeader label="Agent access" title="Siripuram Gardens leads and visits" body="Review customer visits, enquiries, and follow-ups after your approval is complete." />
          <div className="section-head">
            <div>
              <span className="section-label">Agent desk</span>
              <h1>Leads and visits</h1>
            </div>
            <p>Approved agents can review customer visits and respond to Siripuram Gardens enquiries.</p>
          </div>
        <div className="metrics-grid">
          <MetricCard label="Leads" value={dashboard?.lead_count ?? dashboard?.stats?.leads ?? 0} />
          <MetricCard label="Visits" value={dashboard?.visit_count ?? visits.length ?? 0} />
          <MetricCard label="Bookings" value={dashboard?.booking_count ?? dashboard?.stats?.bookings ?? 0} />
        </div>
        <div className="surface-card surface-card-green">
          <span className="section-label">Assigned visits</span>
          {visits.length ? (
            <div className="list-stack">
              {visits.map((visit, index) => (
                <article className="list-item" key={visit?.id || visit?._id || index}>
                  <div>
                    <h3>{firstString(visit?.property_name, visit?.project_name, "Site visit")}</h3>
                      <p>{firstString(visit?.customer_name, visit?.name, "Customer")}</p>
                  </div>
                  <div className="item-meta">
                    <StatusPill status={visit?.status} />
                    <span>{formatDate(visit?.visit_date)}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="No visits assigned" body={error || "Assigned visit records will appear here."} />
          )}
        </div>
      </div>
    </section>
  );
}

function AdminPage() {
  const { role, user, updateUser } = useAuth();
  const [overview, setOverview] = useState<any>({});
  const [stats, setStats] = useState<any>({});
  const [bookings, setBookings] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [serviceRequests, setServiceRequests] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [crmDashboard, setCrmDashboard] = useState<any>({});
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState("");
  const [profileName, setProfileName] = useState(user?.name || "Kollu Sravani");
  const [profileEmail, setProfileEmail] = useState(isPlaceholderEmail(user?.email) ? "" : String(user?.email || ""));
  const [savingProfile, setSavingProfile] = useState(false);

  async function load() {
    const results = await Promise.allSettled([
      api.adminOverview(),
      api.adminStats(),
      api.adminUsers(),
      api.adminBookings(),
      api.adminAgents(),
      api.adminServiceRequests(),
      api.adminCrmDashboard(),
    ]);
    if (results[0].status === "fulfilled") {
      const payload = results[0].value || {};
      const liveVisits = arrayOf(payload?.visits).filter((item) => !isLegacyMockUiRecord(item));
      const livePendingVisits = arrayOf(payload?.pending_visit_requests).filter((item) => !isLegacyMockUiRecord(item));
      setOverview({
        ...payload,
        visits: liveVisits,
        pending_visit_requests: livePendingVisits,
        pending_visits: livePendingVisits,
      });
    }
    if (results[1].status === "fulfilled") setStats(results[1].value || {});
    if (results[2].status === "fulfilled") setUsers(arrayOf(results[2].value?.items || results[2].value?.users || results[2].value).filter((item) => !isLegacyMockUiRecord(item)));
    if (results[3].status === "fulfilled") setBookings(arrayOf(results[3].value?.items || results[3].value?.bookings || results[3].value).filter((item) => !isLegacyMockUiRecord(item)));
    if (results[4].status === "fulfilled") setAgents(arrayOf(results[4].value?.items || results[4].value?.agents || results[4].value).filter((item) => !isLegacyMockUiRecord(item)));
    if (results[5].status === "fulfilled") setServiceRequests(arrayOf(results[5].value?.items || results[5].value?.service_requests || results[5].value).filter((item) => !isLegacyMockUiRecord(item)));
    if (results[6].status === "fulfilled") {
      const payload = results[6].value || {};
      setCrmDashboard({
        ...payload,
        activities: arrayOf(payload?.activities).filter((item) => !isLegacyMockUiRecord(item)),
        opportunities: arrayOf(payload?.opportunities).filter((item) => !isLegacyMockUiRecord(item)),
        tasks: arrayOf(payload?.tasks).filter((item) => !isLegacyMockUiRecord(item)),
        leads: arrayOf(payload?.leads).filter((item) => !isLegacyMockUiRecord(item)),
      });
    }
    setLastSyncAt(new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }));
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 8000);
    const reloadOnFocus = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", reloadOnFocus);
    document.addEventListener("visibilitychange", reloadOnFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", reloadOnFocus);
      document.removeEventListener("visibilitychange", reloadOnFocus);
    };
  }, []);

  useEffect(() => {
    setProfileName(user?.name || "Kollu Sravani");
    setProfileEmail(isPlaceholderEmail(user?.email) ? "" : String(user?.email || ""));
  }, [user]);

    if (role !== "admin") return <ProtectedMessage title="Admin access only" body="This page opens only for approved Siripuram Gardens admins." />;

  async function act(label: string, runner: () => Promise<any>) {
    setBusyId(label);
    setMessage("");
    try {
      await runner();
      setMessage("Action completed successfully.");
      await load();
    } catch (actionError: any) {
      setMessage(actionError?.message || "Unable to complete the admin action.");
    } finally {
      setBusyId("");
    }
  }

  const visitQueue = arrayOf(overview?.pending_visits || overview?.pending_visit_requests || overview?.visits || overview?.site_visits);
  const siripuramVisitQueue = visitQueue.filter((item) =>
    isSiripuramProperty({
      id: String(item?.property_id || ""),
      name: firstString(item?.property_name, item?.project_name),
      location: firstString(item?.location),
    }),
  );
  const pendingAgents = agents.filter((item) => String(item?.approval_status || "").toLowerCase() !== "approved");
  const crmActivities = arrayOf(crmDashboard?.activities);
  const crmOpportunities = arrayOf(crmDashboard?.opportunities);
  const trackedCustomerIds = new Set(
    [...bookings, ...siripuramVisitQueue, ...serviceRequests]
      .map((item) => String(item?.user_id || item?.customer_id || "").trim())
      .filter(Boolean),
  );
  const customerUsers = users.filter(
    (item) =>
      String(item?.role || item?.portal_role || "").toLowerCase() === "customer" &&
      trackedCustomerIds.has(String(item?.id || "").trim()),
  );
  const openVisits = siripuramVisitQueue.filter((item) => ["agent_approved", "admin_approved", "scheduled", "rescheduled"].includes(String(item?.status || "").toLowerCase()));
  const openBookings = bookings.filter((item) => ["agent_approved", "admin_approved"].includes(String(item?.status || "").toLowerCase()));
  const openServiceRequests = serviceRequests.filter((item) => String(item?.status || "").toLowerCase() !== "completed");
  const activityFeed = [
    ...pendingAgents.map((item) => ({ id: `agent-${item.id}`, title: `${firstString(item?.name, "Agent applicant")} requested access`, body: firstString(item?.phone, item?.email, "Pending agent approval"), when: item?.agent_application_submitted_at || item?.updated_at, status: item?.approval_status || "pending" })),
    ...siripuramVisitQueue.map((item) => ({ id: `visit-${item.id}`, title: `${firstString(item?.customer_name, item?.name, "Customer")} booked a visit`, body: `${firstString(item?.property_name, item?.project_name, "Property")} · ${formatDate(item?.visit_date)}`, when: item?.created_at || item?.updated_at, status: item?.status || "pending" })),
    ...bookings.map((item) => ({ id: `booking-${item.id}`, title: `${firstString(item?.name, item?.customer_name, "Customer")} submitted a booking`, body: firstString(item?.property_name, item?.plot_label, item?.plot_id, "Booking request"), when: item?.created_at || item?.updated_at, status: item?.status || "pending" })),
    ...serviceRequests.map((item) => ({ id: `service-${item.id}`, title: `${firstString(item?.contact, "Customer")} requested support`, body: firstString(item?.service_type, item?.description, "Service request"), when: item?.created_at || item?.updated_at, status: item?.status || "pending" })),
    ...crmActivities.map((item) => ({ id: `crm-${item.id}`, title: firstString(item?.message, item?.activity_type, "CRM activity"), body: firstString(item?.customer_name, item?.lead_name, "Customer activity"), when: item?.created_at || item?.updated_at, status: item?.activity_type || "activity" })),
  ]
    .filter((item) => item.title)
    .sort((a, b) => String(b.when || "").localeCompare(String(a.when || "")))
    .slice(0, 14);

  async function saveAdminProfile(event: FormEvent) {
    event.preventDefault();
    setSavingProfile(true);
    setMessage("");
    try {
      const nextUser = await api.updateProfile({
        name: profileName.trim() || "Kollu Sravani",
        email: profileEmail.trim() || undefined,
      });
      await updateUser(nextUser);
      setMessage("Admin profile updated successfully.");
    } catch (profileError: any) {
      setMessage(profileError?.message || "Unable to update admin profile right now.");
    } finally {
      setSavingProfile(false);
    }
  }

  return (
      <section className="admin-dashboard">
        <div className="container stack-lg">
          <nav className="admin-toolbar" aria-label="Admin sections">
            <a href="#admin-approvals" className="admin-toolbar-link">Approvals</a>
            <a href="#admin-visits" className="admin-toolbar-link">Visits</a>
            <a href="#admin-bookings" className="admin-toolbar-link">Bookings</a>
            <a href="#admin-customers" className="admin-toolbar-link">Customers</a>
            <a href="#admin-service-desk" className="admin-toolbar-link">Service desk</a>
            <a href="#admin-events" className="admin-toolbar-link">Events</a>
          </nav>
          <section className="admin-hero admin-hero-refined">
            <div className="admin-hero-copy">
              <span className="section-label">Manager access</span>
              <h2>Kollu Sravani admin workspace</h2>
              <p>One dedicated control room for agent approvals, customer visits, booking confirmations, service handling, and platform-wide movement as it happens.</p>
            </div>
            <div className="admin-hero-summary">
              <div className="admin-inline-stat">
                <span>Sync</span>
                <strong>8 sec</strong>
              </div>
              <div className="admin-inline-stat">
                <span>Live now</span>
                <strong>{lastSyncAt || "--:--"}</strong>
              </div>
              <div className="admin-inline-stat">
                <span>Action queue</span>
                <strong>{pendingAgents.length + openVisits.length + openBookings.length + openServiceRequests.length}</strong>
              </div>
            </div>
          </section>
        <section className="admin-kpi-strip">
          <MetricCard label="Pending agents" value={stats?.pending_agents ?? pendingAgents.length} />
          <MetricCard label="Pending visits" value={stats?.pending_visits ?? openVisits.length ?? 0} />
          <MetricCard label="Open bookings" value={openBookings.length} />
          <MetricCard label="Customers" value={customerUsers.length} />
          <MetricCard label="Open support" value={openServiceRequests.length} />
          <MetricCard label="CRM activity" value={crmActivities.length || crmOpportunities.length} />
        </section>
        {message ? <div className="banner success">{message}</div> : null}

        <div className="admin-command-center">
          <div className="admin-main-column">
            <section className="admin-panel" id="admin-approvals">
              <div className="admin-panel-head">
                <div>
                  <span className="section-label">Approvals</span>
                  <h3>Agent access queue</h3>
                </div>
                <strong>{pendingAgents.length}</strong>
              </div>
            {pendingAgents.length ? (
              <div className="list-stack">
                {pendingAgents.map((agent, index) => {
                  const id = agent?.id || agent?._id || String(index);
                  return (
                    <article className="list-item list-item-actions" key={id}>
                      <div>
                        <h3>{firstString(agent?.name, "Agent application")}</h3>
                        <p>{firstString(agent?.phone, agent?.email, "Applicant details")}</p>
                      </div>
                      <div className="item-meta">
                        <StatusPill status={agent?.approval_status || "Pending"} />
                        <div className="button-row">
                          <button className="btn-primary" disabled={busyId === `${id}-approve`} onClick={() => act(`${id}-approve`, () => api.adminApproveAgent(id))}>
                            Approve
                          </button>
                          <button
                            className="btn-secondary"
                            disabled={busyId === `${id}-reject`}
                            onClick={() => act(`${id}-reject`, () => api.adminUpdateAgentStatus(id, "rejected"))}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="No pending agent applications" body="New agent applications will appear here for review." />
            )}
            </section>

            <section className="admin-panel admin-panel-olive" id="admin-visits">
              <div className="admin-panel-head">
                <div>
                  <span className="section-label">Customer requests</span>
                  <h3>Visit approval queue</h3>
                </div>
                <strong>{openVisits.length}</strong>
              </div>
            {openVisits.length ? (
              <div className="list-stack">
                {openVisits.map((visit, index) => {
                  const id = visit?.id || visit?._id || String(index);
                  return (
                    <article className="list-item list-item-actions" key={id}>
                      <div>
                        <h3>{firstString(visit?.property_name, visit?.project_name, "Visit request")}</h3>
                        <p>{firstString(visit?.customer_name, visit?.name, "Customer")} · {formatDate(visit?.visit_date)}</p>
                      </div>
                      <div className="item-meta">
                        <StatusPill status={visit?.status || "Pending"} />
                        <div className="button-row">
                          <button className="btn-primary" disabled={busyId === `${id}-confirm`} onClick={() => act(`${id}-confirm`, () => api.adminUpdateVisitStatus(id, "scheduled"))}>
                            Schedule
                          </button>
                          <button className="btn-secondary" disabled={busyId === `${id}-complete`} onClick={() => act(`${id}-complete`, () => api.adminUpdateVisitStatus(id, "completed"))}>
                            Complete
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="No pending visits" body="New site visit requests will appear here for review." />
            )}
            </section>

            <section className="admin-panel" id="admin-bookings">
              <div className="admin-panel-head">
                <div>
                  <span className="section-label">Sales desk</span>
                  <h3>Booking confirmations</h3>
                </div>
                <strong>{openBookings.length}</strong>
              </div>
          {openBookings.length ? (
            <div className="list-stack">
              {openBookings.map((booking, index) => {
                const id = booking?.id || booking?._id || String(index);
                return (
                  <article className="list-item list-item-actions" key={id}>
                    <div>
                      <h3>{firstString(booking?.property_name, booking?.plot_label, "Booking request")}</h3>
                      <p>{firstString(booking?.name, booking?.customer_name, "Customer")} · {firstString(booking?.mobile, booking?.customer_phone)}</p>
                    </div>
                    <div className="item-meta">
                      <StatusPill status={booking?.status || "Pending"} />
                      <button className="btn-primary" disabled={busyId === `${id}-booking`} onClick={() => act(`${id}-booking`, () => api.adminConfirmBooking(id))}>
                        Reserve booking
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No booking requests" body="New booking requests will appear here." />
          )}
            </section>
          </div>

          <aside className="admin-side-column">
            <section className="admin-panel">
              <div className="admin-panel-head">
                <div>
                  <span className="section-label">Manager profile</span>
                  <h3>Identity and access</h3>
                </div>
              </div>
              <form className="stack-sm" onSubmit={saveAdminProfile}>
                <label className="field">
                  <span>Manager name</span>
                  <input value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="Enter admin name" />
                </label>
                <label className="field">
                  <span>Email</span>
                  <input type="email" value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} placeholder="Enter manager email" />
                </label>
                <div className="button-row">
                  <button className="btn-primary" type="submit" disabled={savingProfile}>
                    {savingProfile ? "Saving..." : "Save profile"}
                  </button>
                  <button className="btn-secondary" type="button" onClick={() => void load()}>
                    Refresh now
                  </button>
                </div>
              </form>
            </section>

            <section className="admin-panel admin-panel-olive" id="admin-customers">
              <div className="admin-panel-head">
                <div>
                  <span className="section-label">Customer tracking</span>
                  <h3>Recent customer accounts</h3>
                </div>
                <strong>{customerUsers.length}</strong>
              </div>
              {customerUsers.length ? (
                <div className="list-stack">
                  {customerUsers.slice(0, 6).map((customer, index) => (
                    <article className="list-item" key={customer?.id || index}>
                      <div>
                        <h3>{firstString(customer?.name, "Customer")}</h3>
                        <p>{firstString(customer?.phone, customer?.email, "Customer record")}</p>
                      </div>
                      <div className="item-meta">
                        <StatusPill status={customer?.kyc_status || "Active"} />
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState title="No customer records" body="Customer sign-ins, bookings, and visit journeys will appear here." />
              )}
            </section>

            <section className="admin-panel" id="admin-service-desk">
              <div className="admin-panel-head">
                <div>
                  <span className="section-label">Service desk</span>
                  <h3>Support operations</h3>
                </div>
                <strong>{openServiceRequests.length}</strong>
              </div>
          {openServiceRequests.length ? (
            <div className="list-stack">
              {openServiceRequests.map((request, index) => {
                const id = request?.id || request?._id || String(index);
                return (
                  <article className="list-item list-item-actions" key={id}>
                    <div>
                      <h3>{firstString(request?.service_type, "Service request")}</h3>
                      <p>{firstString(request?.description, request?.contact, "Support request details")}</p>
                    </div>
                    <div className="item-meta">
                      <StatusPill status={request?.status || "Pending"} />
                      <div className="button-row">
                        <button className="btn-primary" disabled={busyId === `${id}-service-progress`} onClick={() => act(`${id}-service-progress`, () => api.adminUpdateServiceRequestStatus(id, "in_progress"))}>
                          Start
                        </button>
                        <button className="btn-secondary" disabled={busyId === `${id}-service-complete`} onClick={() => act(`${id}-service-complete`, () => api.adminUpdateServiceRequestStatus(id, "completed"))}>
                          Complete
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No service requests" body="Customer support requests will appear here for admin handling." />
          )}
            </section>

            <section className="admin-panel admin-panel-dark" id="admin-events">
              <div className="admin-panel-head admin-panel-head-light">
                <div>
                  <span className="section-label">Platform events</span>
                  <h3>Live event stream</h3>
                </div>
                <strong>{activityFeed.length}</strong>
              </div>
            {activityFeed.length ? (
              <div className="list-stack">
                {activityFeed.map((item) => (
                  <article className="list-item" key={item.id}>
                    <div>
                      <h3>{item.title}</h3>
                      <p>{item.body}</p>
                    </div>
                    <div className="item-meta">
                      <StatusPill status={item.status} />
                      <span>{formatDate(item.when)}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No live admin activity yet" body="Customer and agent actions will show up here as soon as they happen." />
            )}
            </section>
          </aside>
        </div>
      </div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function LegacyAdminPortalFrame({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="admin-portal-shell">
      <header className="admin-portal-header">
        <div className="container admin-portal-header-inner">
          <div>
            <span className="section-label">Manager dashboard</span>
            <h1>Rivan Reality Admin</h1>
            <p>{user?.name || "Kollu Sravani"}{adminEmailDisplay(user?.email) !== "Manager account email" ? ` · ${adminEmailDisplay(user?.email)}` : ""}</p>
          </div>
          <div className="button-row">
            <button
              className="btn-secondary"
              onClick={() => {
                if (window.history.length > 1) navigate(-1);
                else navigate("/admin");
              }}
            >
              Go Back
            </button>
            <button className="btn-secondary" onClick={() => navigate("/admin")}>
              Overview
            </button>
            <button
              className="btn-primary"
              onClick={async () => {
                await signOut();
                navigate(HOME_PATH);
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className="admin-portal-main">{children}</main>
    </div>
  );
}

function AdminPortalShellFrame({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="admin-portal-shell">
      <header className="admin-portal-header">
        <div className="container admin-portal-header-inner">
          <div className="admin-header-brand">
            <div className="admin-header-mark">RR</div>
            <div>
              <span className="section-label">Manager dashboard</span>
              <h1>Rivan Reality Admin</h1>
              <p>{user?.name || "Kollu Sravani"}{adminEmailDisplay(user?.email) !== "Manager account email" ? ` · ${adminEmailDisplay(user?.email)}` : ""}</p>
            </div>
          </div>
          <div className="admin-header-actions">
            <nav className="admin-header-nav" aria-label="Admin navigation">
              <button className="admin-nav-pill" onClick={() => navigate("/admin")}>Dashboard</button>
              <a className="admin-nav-pill" href="#admin-approvals">Approvals</a>
              <a className="admin-nav-pill" href="#admin-bookings">Bookings</a>
              <a className="admin-nav-pill" href="#admin-events">Events</a>
            </nav>
            <div className="button-row">
              <button
                className="btn-secondary"
                onClick={() => {
                  if (window.history.length > 1) navigate(-1);
                  else navigate("/admin");
                }}
              >
                Go Back
              </button>
              <button className="btn-secondary" onClick={() => navigate("/admin")}>
                Overview
              </button>
              <button
                className="btn-primary"
                onClick={async () => {
                  await signOut();
                  navigate(HOME_PATH);
                }}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className="admin-portal-main">{children}</main>
    </div>
  );
}

function ProtectedMessage({ title, body }: { title: string; body: string }) {
  const navigate = useNavigate();

  return (
    <section className="page-section">
      <div className="container narrow-page">
        <div className="surface-card">
          <button
            type="button"
            className="page-back-button"
            onClick={() => {
              if (window.history.length > 1) navigate(-1);
              else navigate(HOME_PATH);
            }}
          >
            ← Go Back
          </button>
          <span className="section-label">Restricted</span>
          <h1>{title}</h1>
          <p>{body}</p>
        </div>
      </div>
    </section>
  );
}

function CustomerProtectedMessage({ title, body }: { title: string; body: string }) {
  const navigate = useNavigate();

  return (
    <section className="page-section">
      <div className="container narrow-page">
        <div className="surface-card">
          <button
            type="button"
            className="page-back-button"
            onClick={() => {
              if (window.history.length > 1) navigate(-1);
              else navigate(HOME_PATH);
            }}
          >
            ← Go Back
          </button>
          <span className="section-label">Customer access</span>
          <h1>{title}</h1>
          <p>{body}</p>
        </div>
      </div>
    </section>
  );
}

function PageSection({ title, body }: { title: string; body: string }) {
  const navigate = useNavigate();

  return (
    <section className="page-section">
      <div className="container narrow-page">
        <div className="surface-card">
          <button
            type="button"
            className="page-back-button"
            onClick={() => {
              if (window.history.length > 1) navigate(-1);
              else navigate(HOME_PATH);
            }}
          >
            ← Go Back
          </button>
          <span className="section-label">Siripuram Gardens</span>
          <h1>{title}</h1>
          <p>{body}</p>
        </div>
      </div>
    </section>
  );
}

function AppRoutes() {
  const navigate = useNavigate();
  const [forcedModal, setForcedModal] = useState<ModalType>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function handleModal(modal: ModalType) {
    setForcedModal(modal);
    if (modal === null) {
      if (window.location.pathname === "/login" || window.location.pathname === "/agent-login" || window.location.pathname === "/admin-login" || window.location.pathname === "/agent-apply") {
        navigate(HOME_PATH);
      }
      return;
    }
    if (modal === "customer") navigate("/login");
    if (modal === "agent") navigate("/agent-login");
    if (modal === "admin") navigate("/admin-login");
    if (modal === "apply") navigate("/agent-apply");
  }

  return (
    <Routes>
      <Route path="/" element={<OnboardingPage />} />
      <Route path={HOME_PATH} element={<HomePage />} />
      <Route path="/login" element={<CustomerLoginPage />} />
      <Route path="/agent-login" element={<AgentLoginPage />} />
      <Route path="/admin-login" element={<AdminLoginPage />} />
      <Route path="/agent-apply" element={<HomePage forcedModal="apply" />} />
      <Route path="/profile" element={<HomePage profileOpen />} />
      <Route path="/visit" element={<Navigate to="/visits" replace />} />
      <Route
        path="/property/:id"
        element={
          <AppFrame
            openModal={handleModal}
            openProfile={() => setDrawerOpen(true)}
            drawerOpen={drawerOpen}
            closeProfile={() => setDrawerOpen(false)}
            forcedModal={forcedModal}
          >
            <PropertyPage />
          </AppFrame>
        }
      />
      <Route
        path="/layout/:id"
        element={
          <AppFrame openModal={handleModal} openProfile={() => setDrawerOpen(true)} drawerOpen={drawerOpen} closeProfile={() => setDrawerOpen(false)} forcedModal={forcedModal}>
            <LayoutPage />
          </AppFrame>
        }
      />
      <Route
        path="/centre/:id"
        element={
          <AppFrame openModal={handleModal} openProfile={() => setDrawerOpen(true)} drawerOpen={drawerOpen} closeProfile={() => setDrawerOpen(false)} forcedModal={forcedModal}>
            <CentrePage />
          </AppFrame>
        }
      />
      <Route
        path="/booking/:plotId"
        element={
          <AppFrame openModal={handleModal} openProfile={() => setDrawerOpen(true)} drawerOpen={drawerOpen} closeProfile={() => setDrawerOpen(false)} forcedModal={forcedModal}>
            <BookingPage />
          </AppFrame>
        }
      />
      <Route
        path="/wishlist"
        element={
          <AppFrame openModal={handleModal} openProfile={() => setDrawerOpen(true)} drawerOpen={drawerOpen} closeProfile={() => setDrawerOpen(false)} forcedModal={forcedModal}>
            <CollectionPage
              title="Saved properties"
              subtitle="Properties you saved while browsing Siripuram Gardens."
              loader={api.wishlist}
              requiresAuth
              renderItem={(item, index) => (
                <article className="list-item" key={item?.id || item?._id || index}>
                  <div>
                    <h3>{firstString(item?.property_name, item?.name, "Saved property")}</h3>
                    <p>{firstString(item?.location, item?.city, "Property saved to your wishlist")}</p>
                  </div>
                  <StatusPill status="Saved" />
                </article>
              )}
            />
          </AppFrame>
        }
      />
      <Route
        path="/documents"
        element={
          <AppFrame openModal={handleModal} openProfile={() => setDrawerOpen(true)} drawerOpen={drawerOpen} closeProfile={() => setDrawerOpen(false)} forcedModal={forcedModal}>
            <CollectionPage
              title="Documents"
              subtitle="Your Siripuram Gardens documents and uploaded records."
              loader={api.documents}
              requiresAuth
              renderItem={(item, index) => (
                <article className="list-item" key={item?.id || item?._id || index}>
                  <div>
                    <h3>{firstString(item?.title, item?.name, "Document")}</h3>
                    <p>{firstString(item?.description, item?.status, "Document record")}</p>
                  </div>
                  <StatusPill status={item?.status || "Available"} />
                </article>
              )}
            />
          </AppFrame>
        }
      />
      <Route
        path="/notifications"
        element={
          <AppFrame openModal={handleModal} openProfile={() => setDrawerOpen(true)} drawerOpen={drawerOpen} closeProfile={() => setDrawerOpen(false)} forcedModal={forcedModal}>
            <CollectionPage
              title="Notifications"
              subtitle="Updates about visits, enquiries, approvals, and account activity."
              loader={api.notifications}
              requiresAuth
              renderItem={(item, index) => (
                <article className="list-item" key={item?.id || item?._id || index}>
                  <div>
                    <h3>{firstString(item?.title, item?.name, "Notification")}</h3>
                    <p>{firstString(item?.message, item?.body, "Notification details")}</p>
                  </div>
                  <StatusPill status={item?.status || (item?.read ? "Read" : "Unread")} />
                </article>
              )}
            />
          </AppFrame>
        }
      />
      <Route
        path="/services"
        element={
          <AppFrame openModal={handleModal} openProfile={() => setDrawerOpen(true)} drawerOpen={drawerOpen} closeProfile={() => setDrawerOpen(false)} forcedModal={forcedModal}>
            <CollectionPage
              title="Help & support"
              subtitle="Support options for visits, documents, and account assistance."
              loader={api.servicesCatalog}
              renderItem={(item, index) => (
                <article className="list-item" key={item?.id || item?._id || index}>
                  <div>
                      <h3>{firstString(item?.title, item?.name, "Support option")}</h3>
                      <p>{firstString(item?.description, item?.summary, "Choose the kind of help you need.")}</p>
                  </div>
                  <Link className="text-link" to={`/services/${item?.slug || item?.id || item?._id || "support"}`}>
                    Open
                  </Link>
                </article>
              )}
            />
          </AppFrame>
        }
      />
      <Route
        path="/services/:type"
        element={
          <AppFrame openModal={handleModal} openProfile={() => setDrawerOpen(true)} drawerOpen={drawerOpen} closeProfile={() => setDrawerOpen(false)} forcedModal={forcedModal}>
            <ServicesTypePage />
          </AppFrame>
        }
      />
      <Route
        path="/bookings"
        element={
          <AppFrame openModal={handleModal} openProfile={() => setDrawerOpen(true)} drawerOpen={drawerOpen} closeProfile={() => setDrawerOpen(false)} forcedModal={forcedModal}>
            <CollectionPage
              title="My bookings"
              subtitle="Booking requests from the authenticated customer account."
              loader={api.myBookings}
              requiresAuth
              renderItem={(item, index) => (
                <article className="list-item" key={item?.id || item?._id || index}>
                  <div>
                    <h3>{firstString(item?.property_name, item?.plot_number, item?.plot_id, "Booking request")}</h3>
                    <p>{firstString(item?.message, item?.mobile, "Customer booking request")}</p>
                  </div>
                  <StatusPill status={item?.status || "Pending"} />
                </article>
              )}
            />
          </AppFrame>
        }
      />
      <Route
        path="/visits"
        element={
          <AppFrame openModal={handleModal} openProfile={() => setDrawerOpen(true)} drawerOpen={drawerOpen} closeProfile={() => setDrawerOpen(false)} forcedModal={forcedModal}>
            <CollectionPage
              title="Site visits"
              subtitle="Visit requests and current statuses from the authenticated account."
              loader={api.myVisits}
              requiresAuth
              renderItem={(item, index) => (
                <article className="list-item" key={item?.id || item?._id || index}>
                  <div>
                    <h3>{firstString(item?.property_name, item?.project_name, "Site visit")}</h3>
                    <p>{formatDate(item?.visit_date)}</p>
                  </div>
                  <StatusPill status={item?.status || "Pending"} />
                </article>
              )}
            />
          </AppFrame>
        }
      />
      <Route
        path="/myland"
        element={
          <AppFrame openModal={handleModal} openProfile={() => setDrawerOpen(true)} drawerOpen={drawerOpen} closeProfile={() => setDrawerOpen(false)} forcedModal={forcedModal}>
            <CollectionPage
              title="My land"
              subtitle="Ownership-linked Siripuram Gardens records."
              loader={api.myLand}
              requiresAuth
              renderItem={(item, index) => (
                <article className="list-item" key={item?.id || item?._id || index}>
                  <div>
                    <h3>{firstString(item?.property_name, item?.title, "Owned asset")}</h3>
                    <p>{firstString(item?.plot_label, item?.location, "Customer land record")}</p>
                  </div>
                  <StatusPill status={item?.status || "Active"} />
                </article>
              )}
            />
          </AppFrame>
        }
      />
      <Route
        path="/relationship"
        element={
          <AppFrame openModal={handleModal} openProfile={() => setDrawerOpen(true)} drawerOpen={drawerOpen} closeProfile={() => setDrawerOpen(false)} forcedModal={forcedModal}>
            <CustomerRelationshipPage />
          </AppFrame>
        }
      />
      <Route
        path="/payments"
        element={
          <AppFrame openModal={handleModal} openProfile={() => setDrawerOpen(true)} drawerOpen={drawerOpen} closeProfile={() => setDrawerOpen(false)} forcedModal={forcedModal}>
            <PaymentsPage />
          </AppFrame>
        }
      />
      <Route
        path="/agent"
        element={
          <AppFrame openModal={handleModal} openProfile={() => setDrawerOpen(true)} drawerOpen={drawerOpen} closeProfile={() => setDrawerOpen(false)} forcedModal={forcedModal}>
            <AgentPage />
          </AppFrame>
        }
      />
      <Route
        path="/admin"
        element={
          <AdminPortalShellFrame>
            <AdminPage />
          </AdminPortalShellFrame>
        }
      />
      <Route path="*" element={<Navigate to={HOME_PATH} replace />} />
    </Routes>
  );
}

function PaymentsPage() {
  const { isAuthed } = useAuth();
  const [summary, setSummary] = useState<any>({});
  const [history, setHistory] = useState<any[]>([]);
  const [installments, setInstallments] = useState<any[]>([]);

  if (!isAuthed) {
    return <CustomerProtectedMessage title="Customer sign in required" body="Sign in with your phone number to view balances, receipts, and installment history." />;
  }

  useEffect(() => {
    let active = true;
    Promise.allSettled([api.paymentsSummary(), api.paymentHistory(), api.installments()]).then((results) => {
      if (!active) return;
      if (results[0].status === "fulfilled") setSummary(results[0].value || {});
      if (results[1].status === "fulfilled") setHistory(arrayOf(results[1].value?.items || results[1].value).filter((item) => !isLegacyMockUiRecord(item)));
      if (results[2].status === "fulfilled") setInstallments(arrayOf(results[2].value?.items || results[2].value).filter((item) => !isLegacyMockUiRecord(item)));
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <AccountShell label="Payments" title="Payments" body="Track balances, receipts, and installment progress with the same calm Rivan Reality experience.">
      <div className="account-section-head">
        <div>
          <span className="section-label">Payment summary</span>
          <h2>Current balances and receipts</h2>
        </div>
        <p>Payment summary for your Siripuram Gardens account.</p>
      </div>
      <div className="metrics-grid">
        <MetricCard label="Total paid" value={formatCurrency(summary?.total_paid || summary?.paid)} />
        <MetricCard label="Outstanding" value={formatCurrency(summary?.outstanding || summary?.balance)} />
        <MetricCard label="Upcoming installments" value={installments.length} />
      </div>
      <div className="admin-grid">
        <section className="surface-card surface-card-soft">
          <span className="section-label">Payment history</span>
          {history.length ? (
            <div className="list-stack">
              {history.map((item, index) => (
                <article className="list-item" key={item?.id || item?._id || index}>
                  <div>
                    <h3>{formatCurrency(item?.amount)}</h3>
                    <p>{formatDate(item?.paid_at || item?.date)}</p>
                  </div>
                  <StatusPill status={item?.status || "Paid"} />
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="No payment history" body="Recorded payments will appear here once your transactions are available." />
          )}
        </section>
        <section className="surface-card surface-card-green">
          <span className="section-label">Installments</span>
          {installments.length ? (
            <div className="list-stack">
              {installments.map((item, index) => (
                <article className="list-item" key={item?.id || item?._id || index}>
                  <div>
                    <h3>{formatCurrency(item?.amount || item?.due_amount)}</h3>
                    <p>{firstString(item?.title, item?.name, formatDate(item?.due_date), "Installment")}</p>
                  </div>
                  <StatusPill status={item?.status || "Upcoming"} />
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="No installments" body="Upcoming installment milestones will appear here." />
          )}
        </section>
      </div>
    </AccountShell>
  );
}

function CustomerRelationshipPage() {
  const { isAuthed } = useAuth();
  const [relationship, setRelationship] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAuthed) return;
    let active = true;
    api
      .customerRelationship()
      .then((payload) => {
        if (active) {
          const nextPayload = payload && typeof payload === "object"
            ? {
                ...payload,
                recent_activity: arrayOf(payload?.recent_activity).filter((item) => !isLegacyMockUiRecord(item)),
                open_tasks: arrayOf(payload?.open_tasks).filter((item) => !isLegacyMockUiRecord(item)),
                open_opportunities: arrayOf(payload?.open_opportunities).filter((item) => !isLegacyMockUiRecord(item)),
              }
            : payload;
          setRelationship(nextPayload);
        }
      })
      .catch((loadError: any) => {
        if (active) setError(loadError?.message || "Unable to load your relationship summary right now.");
      });
    return () => {
      active = false;
    };
  }, [isAuthed]);

  if (!isAuthed) {
    return <CustomerProtectedMessage title="Customer sign in required" body="Sign in with your phone number to view assigned support, open tasks, and recent CRM activity." />;
  }

  const activities = arrayOf(relationship?.recent_activity);
  const tasks = arrayOf(relationship?.open_tasks);
  const opportunities = arrayOf(relationship?.open_opportunities);

  return (
    <AccountShell label="Relationship Desk" title="Relationship Desk" body="See assigned support, follow-up tasks, and CRM movement in one place with the home-page visual rhythm.">
      <div className="account-section-head">
        <div>
          <span className="section-label">Customer relationship</span>
          <h2>Assigned support and live progress</h2>
        </div>
        <p>Track who is handling your enquiry, what remains open, and the latest activity linked to your account.</p>
      </div>
      <div className="metrics-grid">
        <MetricCard label="Open tasks" value={tasks.length} />
        <MetricCard label="Active opportunities" value={opportunities.length} />
        <MetricCard label="Recent activities" value={activities.length} />
      </div>
      <div className="admin-grid">
        <section className="surface-card surface-card-soft">
          <span className="section-label">Assigned team</span>
          <div className="stack-sm">
            <div>
              <strong>Primary agent</strong>
              <p>{firstString(relationship?.assigned_agent?.name, relationship?.assigned_agent?.phone, "Not assigned yet")}</p>
            </div>
            <div>
              <strong>Sub-agent</strong>
              <p>{firstString(relationship?.assigned_sub_agent?.name, relationship?.assigned_sub_agent?.phone, "Not assigned")}</p>
            </div>
            <div>
              <strong>Primary link</strong>
              <p>{firstString(relationship?.primary_link?.relationship_type, relationship?.primary_link?.source, "No relationship link yet")}</p>
            </div>
          </div>
        </section>
        <section className="surface-card surface-card-green">
          <span className="section-label">Open tasks</span>
          {tasks.length ? (
            <div className="list-stack">
              {tasks.map((task, index) => (
                <article className="list-item" key={task?.id || index}>
                  <div>
                    <h3>{firstString(task?.title, "CRM task")}</h3>
                    <p>{firstString(task?.description, task?.task_type, "Task details")}</p>
                  </div>
                  <StatusPill status={task?.status || "Open"} />
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="No open tasks" body={error || "Your follow-up tasks will appear here when the CRM creates them."} />
          )}
        </section>
      </div>
      <section className="surface-card surface-card-soft">
        <span className="section-label">Recent activity</span>
        {activities.length ? (
          <div className="list-stack">
            {activities.map((activity, index) => (
              <article className="list-item" key={activity?.id || index}>
                <div>
                  <h3>{firstString(activity?.message, activity?.activity_type, "Activity update")}</h3>
                  <p>{formatDate(activity?.created_at)}</p>
                </div>
                <StatusPill status={activity?.activity_type || "Activity"} />
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="No recent activity" body={error || "Booking, visit, and CRM updates will appear here."} />
        )}
      </section>
    </AccountShell>
  );
}

function ServicesTypePage() {
  const { type = "" } = useParams();
  const { user, isAuthed } = useAuth();
  const [preferredDate, setPreferredDate] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setContact(String(user?.phone || "").replace(/^\+91/, ""));
  }, [user]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isAuthed) {
      setStatus("Sign in with your phone number to submit a support request.");
      return;
    }
    if (!preferredDate || !description.trim() || normalizePhoneDigits(contact).length !== 10) {
      setStatus("Enter your preferred date, issue details, and a valid contact number.");
      return;
    }
    setSubmitting(true);
    setStatus("");
    try {
      await api.requestService({
        service_type: type.replace(/-/g, " "),
        preferred_date: preferredDate,
        description: description.trim(),
        contact: `+91${normalizePhoneDigits(contact)}`,
      });
      setDescription("");
      setStatus("Support request submitted successfully.");
    } catch (submitError: any) {
      setStatus(submitError?.message || "Unable to submit the support request right now.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AccountShell
      label="Help & support"
      title={type.replace(/-/g, " ")}
      body="The Siripuram Gardens team will assist you through this support request with the same clear experience used across the app."
    >
      <div className="account-form-wrap">
        <div className="surface-card surface-card-soft stack-md">
          <span className="section-label">Help detail</span>
          <h1>{type.replace(/-/g, " ")}</h1>
          <p>Use this support path for document help, visit updates, or any assistance tied to Siripuram Gardens.</p>
          <form className="stack-sm" onSubmit={submit}>
            <label className="field">
              <span>Preferred date</span>
              <input type="date" value={preferredDate} onChange={(event) => setPreferredDate(event.target.value)} />
            </label>
            <label className="field">
              <span>Contact number</span>
              <input value={contact} onChange={(event) => setContact(event.target.value)} placeholder="Enter your mobile number" />
            </label>
            <label className="field">
              <span>Issue details</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={5} placeholder="Describe the help you need" />
            </label>
            {status ? <div className={cn("banner", status.toLowerCase().includes("success") ? "success" : "warning")}>{status}</div> : null}
            <button className="btn-primary" type="submit" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit support request"}
            </button>
          </form>
        </div>
      </div>
    </AccountShell>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AppRoutes />
    </BrowserRouter>
  );
}

