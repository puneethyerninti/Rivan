import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import { firebaseAuth } from "../lib/firebase";
import { clearSession, getBackendUrl, loadSession, postJson, restoreSession, saveSession } from "../lib/auth";

const RESEND_SECONDS = 20;
const PRIMARY_AGENT_PHONE = "9052644345";
const LAST_STAFF_ROLE_KEY = "rivan_last_staff_role";
const EMPTY_OTP = ["", "", "", "", "", ""];
const EMPTY_CUSTOMER_ONBOARDING = {
  name: "",
  email: "",
};
const EMPTY_APPLICATION = {
  name: "",
  email: "",
  occupation: "",
  age: "",
  aadhaar_number: "",
  address: "",
  agent_brand_name: "",
  notes: "",
};

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "").slice(-10);
}

function formatPhoneLabel(digits) {
  if (!digits) return "+91";
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5, 10)}`.trim();
}

function isPrimaryAgentPhone(digits) {
  return normalizePhone(digits) === PRIMARY_AGENT_PHONE;
}

function startGuestBrowsing(navigate) {
  clearSession();
  localStorage.setItem(
    "rivan_guest_session",
    JSON.stringify({
      role: "customer",
      guest: true,
      started_at: new Date().toISOString(),
    }),
  );
  navigate("/app");
}

export default function Login() {
  const navigate = useNavigate();
  const recaptchaRef = useRef(null);
  const confirmationRef = useRef(null);
  const roleRef = useRef("customer");

  const [screen, setScreen] = useState("splash");
  const [role, setRole] = useState("customer");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(EMPTY_OTP);
  const [customerOnboarding, setCustomerOnboarding] = useState(EMPTY_CUSTOMER_ONBOARDING);
  const [application, setApplication] = useState(EMPTY_APPLICATION);
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [recaptchaReady, setRecaptchaReady] = useState(false);
  const [recaptchaResetCount, setRecaptchaResetCount] = useState(0);
  const [staffAccessOpen, setStaffAccessOpen] = useState(false);
  const [, setRememberedStaffRole] = useState(() => localStorage.getItem(LAST_STAFF_ROLE_KEY) || "");

  useEffect(() => {
    let mounted = true;
    const existing = loadSession();
    if (!existing?.refresh_token) return undefined;

    const resumeSession = async () => {
      try {
        const session = await restoreSession();
        if (!mounted || !session?.user?.role) return;
        if (session.user.role === "admin") navigate("/admin", { replace: true });
        else if (session.user.role === "agent") navigate("/agent", { replace: true });
        else navigate("/app", { replace: true });
      } catch {
        // If restore fails we keep the user on login and let OTP continue normally.
      }
    };

    resumeSession();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  useEffect(() => {
    fetch(`${getBackendUrl()}/api/health?_t=${Date.now()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    }).catch(() => {});
  }, []);

  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  useEffect(() => {
    if (!countdown) return undefined;
    const timer = window.setInterval(() => {
      setCountdown((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  useEffect(() => {
    if (!window.recaptchaVerifier) {
      try {
        window.recaptchaVerifier = new RecaptchaVerifier(firebaseAuth, "rivan-login-recaptcha", {
          size: "invisible",
          callback: () => {},
          "expired-callback": () => setRecaptchaReady(false),
        });
        window.recaptchaVerifier
          .render()
          .then(() => setRecaptchaReady(true))
          .catch((err) => {
            console.error("Recaptcha render error:", err);
            setRecaptchaReady(false);
          });
      } catch (err) {
        console.error("Recaptcha init error:", err);
      }
    } else {
      setRecaptchaReady(true);
    }
    recaptchaRef.current = window.recaptchaVerifier;
  }, [recaptchaResetCount]);

  const resetMessages = () => {
    setError("");
    setStatus("");
  };

  const resetFlowState = () => {
    setOtp(EMPTY_OTP);
    setCustomerOnboarding(EMPTY_CUSTOMER_ONBOARDING);
    setApplication(EMPTY_APPLICATION);
    setCountdown(0);
    confirmationRef.current = null;
    resetMessages();
  };

  const openPortal = (nextRole) => {
    clearSession();
    localStorage.removeItem("rivan_guest_session");
    setRole(nextRole);
    setPhone("");
    resetFlowState();
    setStaffAccessOpen(false);
    setScreen("login");
  };

  const backToSplash = () => {
    localStorage.removeItem("rivan_guest_session");
    setScreen("splash");
    setPhone("");
    resetFlowState();
  };

  const updateApplicationField = (field, value) => {
    setApplication((current) => ({ ...current, [field]: value }));
  };

  const postCustomerExchange = async (payload) => {
    try {
      return await postJson("/api/auth/customer/firebase", payload);
    } catch (err) {
      if (String(err?.message || "").toLowerCase().includes("not found")) {
        return postJson("/api/auth/firebase", payload);
      }
      throw err;
    }
  };

  const exchangeToken = async (firebaseIdToken, normalizedPhone) => {
    const payload = {
      id_token: firebaseIdToken,
      phone: normalizedPhone,
    };

    let session;
    if (roleRef.current === "customer") {
      session = await postCustomerExchange({
        ...payload,
        name: customerOnboarding.name?.trim() || normalizedPhone,
      });
    } else if (roleRef.current === "agent") {
      session = await postJson("/api/auth/agent/firebase", payload);
    } else {
      session = await postJson("/api/auth/admin/firebase", payload);
    }

    saveSession(session);
    return session;
  };

  const runAccessPrecheck = async (normalizedPhone) => {
    if (roleRef.current === "customer") {
      return { allowed: true };
    }

    if (roleRef.current === "admin") {
      const result = await postJson("/api/auth/admin/status", { phone: normalizedPhone });
      if (!result.can_login) {
        return {
          allowed: false,
          nextScreen: "login",
          errorMessage: result.message || "This mobile number is not authorized for admin access.",
        };
      }
      return { allowed: true, statusMessage: result.message };
    }

    if (isPrimaryAgentPhone(normalizedPhone)) {
      return {
        allowed: true,
        statusMessage: "Continue with OTP to access your Partner portal.",
      };
    }

    const result = await postJson("/api/auth/agent/status", { phone: normalizedPhone });
    if (result.can_login) {
      return { allowed: true, statusMessage: result.message };
    }

    return {
      allowed: false,
      nextScreen: "agent-application",
      statusMessage: result.message || "Agent approval is required before login.",
    };
  };

  const requestOtp = async () => {
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone.length !== 10) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }

    if (!recaptchaRef.current || !recaptchaReady) {
      setError("Secure OTP check is still getting ready. Please try again in a moment.");
      return;
    }

    resetMessages();
    setStatus("Checking access and preparing OTP...");
    setLoading(true);
    try {
      const precheck = await runAccessPrecheck(normalizedPhone);
      if (!precheck.allowed) {
        if (precheck.statusMessage) setStatus(precheck.statusMessage);
        if (precheck.errorMessage) setError(precheck.errorMessage);
        if (precheck.nextScreen) setScreen(precheck.nextScreen);
        return;
      }

      const fullPhone = `+91${normalizedPhone}`;
      setStatus("Sending OTP now...");
      const confirmation = await signInWithPhoneNumber(
        firebaseAuth,
        fullPhone,
        recaptchaRef.current,
      );
      confirmationRef.current = confirmation;
      setCountdown(RESEND_SECONDS);
      setStatus(precheck.statusMessage || `OTP sent to ${formatPhoneLabel(normalizedPhone)}.`);
      setScreen("otp");
    } catch (err) {
      setError(friendlyFirebaseError(err));
      if (String(err?.code || err?.message || "").includes("captcha-check-failed")) {
        resetFirebaseRecaptcha();
        setRecaptchaReady(false);
        setRecaptchaResetCount((value) => value + 1);
      }
    } finally {
      setLoading(false);
    }
  };

  const submitAgentApplication = async () => {
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone.length !== 10) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    if (!application.name.trim()) {
      setError("Enter the applicant name.");
      return;
    }

    resetMessages();
    setLoading(true);
    try {
      const response = await postJson("/api/auth/agent/apply", {
        ...application,
        phone: normalizedPhone,
        age: application.age ? Number(application.age) : null,
      });
      setStatus(
        response.message || "Agent application submitted. Admin approval is required before login.",
      );
      setScreen("application-submitted");
    } catch (err) {
      setError(err?.message || "Unable to submit the application right now.");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtpAndLogin = async () => {
    const code = otp.join("");
    const normalizedPhone = normalizePhone(phone);
    if (code.length !== 6) {
      setError("Enter the 6-digit OTP.");
      return;
    }
    if (!confirmationRef.current) {
      setError("OTP session expired. Please request a new OTP.");
      return;
    }

    resetMessages();
    setLoading(true);
    try {
      setStatus("Verifying OTP...");
      const credential = await confirmationRef.current.confirm(code);
      setStatus("Opening your dashboard...");
      const firebaseIdToken = await credential.user.getIdToken();
      const session = await exchangeToken(firebaseIdToken, normalizedPhone);
      if (session.user.role === "admin") {
        localStorage.setItem(LAST_STAFF_ROLE_KEY, "admin");
        setRememberedStaffRole("admin");
        navigate("/admin", { replace: true });
      } else if (session.user.role === "agent") {
        localStorage.setItem(LAST_STAFF_ROLE_KEY, "agent");
        setRememberedStaffRole("agent");
        navigate("/agent", { replace: true });
      } else {
        navigate("/app", { replace: true });
      }
    } catch (err) {
      setError(err?.message || "OTP verification failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpInput = (index, value) => {
    const digit = String(value || "").replace(/\D/g, "").slice(-1);
    setOtp((current) => {
      const next = [...current];
      next[index] = digit;
      return next;
    });
    if (digit) {
      const nextInput = document.querySelector(`input[data-otp="${index + 1}"]`);
      if (nextInput) nextInput.focus();
    }
  };

  const handleOtpKeyDown = (index, event) => {
    if (event.key === "Backspace" && !otp[index]) {
      const prevInput = document.querySelector(`input[data-otp="${index - 1}"]`);
      if (prevInput) prevInput.focus();
    }
  };

  const resendOtp = async () => {
    if (countdown > 0 || loading) return;
    await requestOtp();
  };

  const titleByRole = {
    customer: "Welcome back",
    agent: "Partner Portal",
    admin: "Admin Portal",
  };

  const subtitleByRole = {
    customer: "Sign in to continue with Rivan Reality",
    agent: "Use your approved mobile number to access the Partner portal",
    admin: "Only the authorized admin mobile number can continue",
  };

  function friendlyFirebaseError(error) {
    const message = String(error?.message || error || "");
    const code = String(error?.code || "");
    if (code.includes("captcha-check-failed") || message.toLowerCase().includes("hostname match not found")) {
      return "Firebase domain setup issue: add rivanrealty.com and www.rivanrealty.com in Firebase Authentication > Settings > Authorized domains, then try OTP again.";
    }
    if (code.includes("too-many-requests")) {
      return "Firebase has temporarily blocked OTP attempts for this number/device. Please wait a few minutes and try again.";
    }
    if (code.includes("invalid-phone-number")) {
      return "Enter a valid 10-digit mobile number.";
    }
    if (code.includes("quota-exceeded")) {
      return "Firebase OTP quota is exceeded for now. Please check Firebase SMS quota/billing.";
    }
    return message || "Failed to send OTP. Check Firebase phone auth setup.";
  }

  function resetFirebaseRecaptcha() {
    try {
      window.recaptchaVerifier?.clear?.();
    } catch {}
    window.recaptchaVerifier = null;
  }

  const inputStyle = {
    width: "100%",
    border: "1.5px solid #e2e8e0",
    borderRadius: "16px",
    background: "#fbfdfa",
    padding: "15px 16px",
    fontFamily: "inherit",
    fontSize: "14px",
    fontWeight: "600",
    color: "#16231a",
  };

  return (
    <>
      <div className="rv-phone login-phone">
        <div className="rv-scroll" style={{ position: "absolute", inset: "0", overflowY: "auto" }}>
          {screen === "splash" && (
            <div
              className="rv-screen rv-login-splash"
              style={{
                minHeight: "100vh",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                background:
                  "radial-gradient(circle at 50% 22%, rgba(255,255,255,.9), rgba(255,255,255,0) 34%), linear-gradient(180deg,#f7fbf4 0%,#eaf3e5 66%,#1f5a31 66%,#123f24 100%)",
              }}
            >
              <span className="rv-splash-orb one" aria-hidden="true" />
              <span className="rv-splash-orb two" aria-hidden="true" />
              <span className="rv-splash-orb three" aria-hidden="true" />
              <button
                type="button"
                className="rv-staff-access-chip"
                onClick={() => setStaffAccessOpen((value) => !value)}
                aria-expanded={staffAccessOpen}
                aria-controls="staff-access-panel"
                title="Staff access"
                style={{
                  position: "absolute",
                  top: "22px",
                  right: "24px",
                  minHeight: "42px",
                  border: "1px solid rgba(31,90,49,.16)",
                  borderRadius: "999px",
                  background: "rgba(255,255,255,.76)",
                  color: "#1f5a31",
                  boxShadow: "0 16px 30px -22px rgba(18,53,29,.65)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 12px",
                  zIndex: 3,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "12px",
                  fontWeight: "800",
                  letterSpacing: ".1px",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: "26px",
                    height: "26px",
                    borderRadius: "50%",
                    background: "linear-gradient(180deg,#f6a13a,#e2822a)",
                    color: "#fff",
                    display: "grid",
                    placeItems: "center",
                    boxShadow: "0 8px 14px -8px rgba(226,130,42,.9)",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" style={{ display: "block" }}>
                    <path
                      d="M7 10V8a5 5 0 0 1 10 0v2h1a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h1Zm2 0h6V8a3 3 0 0 0-6 0v2Z"
                      fill="currentColor"
                    />
                  </svg>
                </span>
                Staff access
              </button>

              {staffAccessOpen && (
                <div
                  id="staff-access-panel"
                  style={{
                    position: "absolute",
                    top: "76px",
                    right: "24px",
                    width: "min(330px, calc(100% - 48px))",
                    border: "1px solid rgba(31,90,49,.12)",
                    borderRadius: "24px",
                    background: "rgba(255,255,255,.96)",
                    color: "#16231a",
                    boxShadow: "0 26px 70px -34px rgba(18,53,29,.75)",
                    padding: "16px",
                    zIndex: 4,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                    <div>
                      <p style={{ margin: 0, fontSize: "12px", fontWeight: "900", color: "#e2822a", textTransform: "uppercase", letterSpacing: ".8px" }}>
                        Team portal
                      </p>
                      <h2 style={{ margin: "4px 0 0", fontSize: "20px", lineHeight: "1.15", color: "#1f5a31" }}>
                        Internal access
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStaffAccessOpen(false)}
                      aria-label="Close staff access"
                      style={{
                        width: "34px",
                        height: "34px",
                        border: "none",
                        borderRadius: "50%",
                        background: "#f1f6ee",
                        color: "#1f5a31",
                        cursor: "pointer",
                        fontWeight: "900",
                      }}
                    >
                      x
                    </button>
                  </div>
                  <p style={{ margin: "9px 0 14px", color: "#657568", fontSize: "13px", lineHeight: "1.45" }}>
                    For approved Rivan team members only. Customers can continue with the main journey below.
                  </p>
                  {[
                    {
                      role: "agent",
                      label: "Partner",
                      copy: "Leads, visits, bookings",
                      path: "M12 3a7 7 0 0 0-7 7v3a3 3 0 0 0 3 3h1v-5H7v-1a5 5 0 0 1 10 0v1h-2v5h1a3 3 0 0 0 3-3v-3a7 7 0 0 0-7-7Zm-2 15h4a2 2 0 0 1 2 2v1H8v-1a2 2 0 0 1 2-2Z",
                    },
                    {
                      role: "admin",
                      label: "Admin Login",
                      copy: "Approvals, CRM, reports",
                      path: "M12 2 5 5v6c0 4.8 3 8.8 7 10 4-1.2 7-5.2 7-10V5l-7-3Zm0 5a2.4 2.4 0 1 1 0 4.8A2.4 2.4 0 0 1 12 7Zm-4 9.2c.8-1.8 2.3-2.7 4-2.7s3.2.9 4 2.7c-1 1.2-2.3 2.1-4 2.7-1.7-.6-3-1.5-4-2.7Z",
                    },
                  ].map((item) => (
                    <button
                      key={item.role}
                      type="button"
                      onClick={() => openPortal(item.role)}
                      aria-label={item.label}
                      title={item.label}
                      style={{
                        width: "100%",
                        minHeight: "58px",
                        border: "1px solid #e0eadc",
                        borderRadius: "18px",
                        background: "#fbfdfa",
                        color: "#1f5a31",
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "10px 12px",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        textAlign: "left",
                        marginTop: "10px",
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: "40px",
                          height: "40px",
                          borderRadius: "15px",
                          background: item.role === "admin" ? "#eef6ea" : "#fff4e8",
                          color: item.role === "admin" ? "#1f5a31" : "#e2822a",
                          display: "grid",
                          placeItems: "center",
                          flex: "0 0 auto",
                        }}
                      >
                        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block" }}>
                          <path d={item.path} fill="currentColor" />
                        </svg>
                      </span>
                      <span style={{ display: "grid", gap: "2px" }}>
                        <strong style={{ fontSize: "14px", color: "#16231a" }}>{item.label}</strong>
                        <span style={{ fontSize: "12px", color: "#718074", fontWeight: "600" }}>{item.copy}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div
                className="rv-splash-brand-zone"
                style={{
                  flex: "0 0 clamp(430px, 66vh, 650px)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "98px 34px 64px",
                  textAlign: "center",
                  position: "relative",
                  zIndex: 1,
                }}
              >
                <img
                  className="rv-splash-logo"
                  src="/RivanRealtyLogo.png"
                  alt="Rivan Realty"
                  style={{
                    width: "min(340px, 78vw)",
                    height: "auto",
                    borderRadius: "18px",
                    filter: "drop-shadow(0 18px 34px rgba(18,53,29,.22))",
                  }}
                />
              </div>
              <div
                className="rv-splash-actions"
                style={{
                  padding: "34px clamp(22px, 3vw, 52px) 46px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                  position: "relative",
                  zIndex: 1,
                }}
              >
                <button
                  className="rv-primary-cta"
                  onClick={() => openPortal("customer")}
                  style={{
                    width: "100%",
                    height: "58px",
                    border: "none",
                    borderRadius: "18px",
                    background: "linear-gradient(180deg,#eb9236,#e2822a)",
                    color: "#fff",
                    fontFamily: "inherit",
                    fontSize: "16px",
                    fontWeight: "700",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "10px",
                    boxShadow: "0 12px 24px -8px rgba(226,130,42,.7)",
                  }}
                >
                  <span>Get Started</span>
                  <svg className="rv-cta-arrow" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style={{ position: "relative", zIndex: 1 }}>
                    <path d="M5 12h12M13 7l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  className="rv-secondary-cta"
                  onClick={() => startGuestBrowsing(navigate)}
                  style={{
                    width: "100%",
                    height: "58px",
                    border: "1.5px solid rgba(255,255,255,.35)",
                    borderRadius: "18px",
                    background: "rgba(255,255,255,.08)",
                    color: "#eaf2e6",
                    fontFamily: "inherit",
                    fontSize: "15px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Explore as Guest
                </button>
              </div>
            </div>
          )}

          {screen === "customer-onboarding" && (
            <div
              className="rv-screen"
              style={{
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                padding: "50px 30px 34px",
                background: "linear-gradient(180deg,#f4f8f1 0%,#ffffff 28%)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <button
                  onClick={backToSplash}
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "13px",
                    border: "1px solid #e4ece0",
                    background: "#fff",
                    color: "#1f5a31",
                    fontSize: "19px",
                    cursor: "pointer",
                  }}
                >
                  ←
                </button>
                <img src="/RivanRealtyLogo.png" alt="Rivan Realty" style={{ height: "38px", width: "62px", objectFit: "contain", borderRadius: "10px" }} />
              </div>

              <h1
                style={{
                  margin: "26px 0 8px",
                  fontSize: "28px",
                  fontWeight: "800",
                  color: "#1f5a31",
                  letterSpacing: "-.5px",
                }}
              >
                Customer Onboarding
              </h1>
              <p style={{ margin: "0", fontSize: "14.5px", color: "#6d7d6f", lineHeight: "1.55" }}>
                Share your basic details first, then continue with secure phone OTP login.
              </p>

              <div style={{ marginTop: "24px", display: "grid", gap: "14px" }}>
                <input
                  value={customerOnboarding.name}
                  onChange={(event) =>
                    setCustomerOnboarding((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Full name"
                  style={inputStyle}
                />
                <input
                  value={customerOnboarding.email}
                  onChange={(event) =>
                    setCustomerOnboarding((current) => ({ ...current, email: event.target.value }))
                  }
                  placeholder="Email address (optional)"
                  style={inputStyle}
                />
              </div>

              {error && (
                <p style={{ margin: "16px 0 0", fontSize: "13px", fontWeight: "700", color: "#c93b3b" }}>
                  {error}
                </p>
              )}

              <button
                onClick={() => {
                  if (!customerOnboarding.name.trim()) {
                    setError("Enter your name to continue.");
                    return;
                  }
                  resetMessages();
                  setScreen("login");
                }}
                style={{
                  marginTop: "24px",
                  width: "100%",
                  height: "58px",
                  border: "none",
                  borderRadius: "18px",
                  background: "linear-gradient(180deg,#2b6d3d,#3f8a54)",
                  color: "#fff",
                  fontFamily: "inherit",
                  fontSize: "16px",
                  fontWeight: "700",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  boxShadow: "0 14px 26px -10px rgba(18,68,35,.75)",
                }}
              >
                Continue to Login <span style={{ fontSize: "19px" }}>→</span>
              </button>
            </div>
          )}

          {screen === "login" && (
            <div
              className="rv-screen"
              style={{
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                padding: "64px 30px 34px",
                background: "linear-gradient(180deg,#f4f8f1 0%,#ffffff 30%)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <button
                  onClick={backToSplash}
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "13px",
                    border: "1px solid #e4ece0",
                    background: "#fff",
                    color: "#1f5a31",
                    fontSize: "19px",
                    cursor: "pointer",
                  }}
                >
                  ←
                </button>
                <img src="/RivanRealtyLogo.png" alt="Rivan Realty" style={{ height: "38px", width: "62px", objectFit: "contain", borderRadius: "10px" }} />
              </div>

              <h1
                style={{
                  margin: "26px 0 6px",
                  fontSize: "28px",
                  fontWeight: "800",
                  color: "#1f5a31",
                  letterSpacing: "-.5px",
                }}
              >
                {titleByRole[role]}
              </h1>
              <p style={{ margin: "0", fontSize: "14.5px", color: "#6d7d6f", lineHeight: "1.5" }}>
                {subtitleByRole[role]}
              </p>

              <div style={{ marginTop: "22px" }}>
                <label style={{ fontSize: "13px", fontWeight: "700", color: "#3d4f40" }}>Mobile Number</label>
                <div
                  style={{
                    marginTop: "9px",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    height: "56px",
                    border: "1.5px solid #e2e8e0",
                    borderRadius: "16px",
                    padding: "0 16px",
                    background: "#fbfdfa",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "15px",
                      fontWeight: "700",
                      color: "#1f5a31",
                      borderRight: "1.5px solid #e2e8e0",
                      paddingRight: "12px",
                    }}
                  >
                    IN +91
                  </span>
                  <input
                    value={phone}
                    onChange={(event) => setPhone(normalizePhone(event.target.value))}
                    inputMode="numeric"
                    placeholder="Enter your mobile number"
                    style={{
                      flex: "1",
                      border: "none",
                      background: "transparent",
                      fontFamily: "inherit",
                      fontSize: "15.5px",
                      fontWeight: "600",
                      color: "#16231a",
                    }}
                  />
                </div>
              </div>

              {role === "admin" && (
                <p style={{ margin: "14px 0 0", fontSize: "13px", color: "#6d7d6f" }}>
                  Admin login is available only for the registered admin mobile number.
                </p>
              )}

              {role === "agent" && (
                <p style={{ margin: "14px 0 0", fontSize: "13px", color: "#6d7d6f" }}>
                  Continue with your registered mobile number. If you are new, you can submit your application here.
                </p>
              )}

              {error && (
                <p style={{ margin: "16px 0 0", fontSize: "13px", fontWeight: "700", color: "#c93b3b" }}>
                  {error}
                </p>
              )}
              {status && (
                <p style={{ margin: "16px 0 0", fontSize: "13px", fontWeight: "700", color: "#2b6d3d" }}>
                  {status}
                </p>
              )}

              <button
                onClick={requestOtp}
                disabled={loading || !recaptchaReady}
                style={{
                  marginTop: "24px",
                  width: "100%",
                  height: "58px",
                  border: "none",
                  borderRadius: "18px",
                  background: "linear-gradient(180deg,#2b6d3d,#3f8a54)",
                  color: "#fff",
                  fontFamily: "inherit",
                  fontSize: "16px",
                  fontWeight: "700",
                  cursor: loading || !recaptchaReady ? "wait" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  boxShadow: "0 14px 26px -10px rgba(18,68,35,.75)",
                  opacity: loading || !recaptchaReady ? 0.7 : 1,
                }}
              >
                {!recaptchaReady ? "Preparing..." : loading ? "Sending..." : "Continue"} <span style={{ fontSize: "19px" }}>→</span>
              </button>
            </div>
          )}

          {screen === "agent-application" && (
            <div
              className="rv-screen"
              style={{
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                padding: "42px 30px 34px",
                background: "linear-gradient(180deg,#f4f8f1 0%,#ffffff 20%)",
              }}
            >
              <button
                onClick={() => setScreen("login")}
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "13px",
                  border: "1px solid #e4ece0",
                  background: "#fff",
                  color: "#1f5a31",
                  fontSize: "19px",
                  cursor: "pointer",
                }}
              >
                ←
              </button>

              <h1 style={{ margin: "24px 0 8px", fontSize: "26px", fontWeight: "800", color: "#1f5a31" }}>
                Agent Application
              </h1>
              <p style={{ margin: 0, fontSize: "14px", color: "#6d7d6f", lineHeight: "1.55" }}>
                This number is not active for agent access yet. Submit your details and we will review your application.
              </p>

              <div style={{ display: "grid", gap: "14px", marginTop: "24px" }}>
                <input
                  value={application.name}
                  onChange={(event) => updateApplicationField("name", event.target.value)}
                  placeholder="Full name"
                  style={inputStyle}
                />
                <input
                  value={application.email}
                  onChange={(event) => updateApplicationField("email", event.target.value)}
                  placeholder="Email address"
                  style={inputStyle}
                />
                <input
                  value={application.occupation}
                  onChange={(event) => updateApplicationField("occupation", event.target.value)}
                  placeholder="Occupation"
                  style={inputStyle}
                />
                <input
                  value={application.age}
                  onChange={(event) =>
                    updateApplicationField("age", String(event.target.value).replace(/\D/g, "").slice(0, 2))
                  }
                  placeholder="Age"
                  inputMode="numeric"
                  style={inputStyle}
                />
                <input
                  value={application.aadhaar_number}
                  onChange={(event) =>
                    updateApplicationField(
                      "aadhaar_number",
                      String(event.target.value).replace(/\D/g, "").slice(0, 12),
                    )
                  }
                  placeholder="Aadhaar number"
                  inputMode="numeric"
                  style={inputStyle}
                />
                <input
                  value={application.agent_brand_name}
                  onChange={(event) => updateApplicationField("agent_brand_name", event.target.value)}
                  placeholder="Agency or brand name"
                  style={inputStyle}
                />
                <textarea
                  value={application.address}
                  onChange={(event) => updateApplicationField("address", event.target.value)}
                  placeholder="Address"
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
                <textarea
                  value={application.notes}
                  onChange={(event) => updateApplicationField("notes", event.target.value)}
                  placeholder="Additional notes"
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>

              {error && (
                <p style={{ margin: "16px 0 0", fontSize: "13px", fontWeight: "700", color: "#c93b3b" }}>
                  {error}
                </p>
              )}
              {status && (
                <p style={{ margin: "16px 0 0", fontSize: "13px", fontWeight: "700", color: "#2b6d3d" }}>
                  {status}
                </p>
              )}

              <button
                onClick={submitAgentApplication}
                disabled={loading}
                style={{
                  marginTop: "22px",
                  width: "100%",
                  height: "58px",
                  border: "none",
                  borderRadius: "18px",
                  background: "linear-gradient(180deg,#2b6d3d,#3f8a54)",
                  color: "#fff",
                  fontFamily: "inherit",
                  fontSize: "16px",
                  fontWeight: "700",
                  cursor: loading ? "wait" : "pointer",
                  boxShadow: "0 14px 26px -10px rgba(18,68,35,.75)",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "Submitting..." : "Submit Application"}
              </button>
            </div>
          )}

          {screen === "application-submitted" && (
            <div
              className="rv-screen"
              style={{
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                padding: "40px 30px",
                background: "linear-gradient(180deg,#f4f8f1 0%,#ffffff 30%)",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: "84px",
                  height: "84px",
                  margin: "0 auto 22px",
                  borderRadius: "24px",
                  background: "#eef6ea",
                  display: "grid",
                  placeItems: "center",
                  color: "#2b6d3d",
                  fontSize: "34px",
                  fontWeight: "800",
                }}
              >
                ✓
              </div>
              <h1 style={{ margin: 0, fontSize: "28px", fontWeight: "800", color: "#1f5a31" }}>
                Application Submitted
              </h1>
              <p style={{ margin: "12px 0 0", fontSize: "14.5px", color: "#6d7d6f", lineHeight: "1.6" }}>
                {status || "Your request is pending admin approval. Once approved, OTP login will work immediately."}
              </p>
              <button
                onClick={backToSplash}
                style={{
                  marginTop: "28px",
                  width: "100%",
                  height: "58px",
                  border: "none",
                  borderRadius: "18px",
                  background: "linear-gradient(180deg,#2b6d3d,#3f8a54)",
                  color: "#fff",
                  fontFamily: "inherit",
                  fontSize: "16px",
                  fontWeight: "700",
                  cursor: "pointer",
                }}
              >
                Back to Home
              </button>
            </div>
          )}

          {screen === "otp" && (
            <div
              className="rv-screen"
              style={{
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                padding: "64px 30px 34px",
                background: "linear-gradient(180deg,#f4f8f1 0%,#ffffff 30%)",
              }}
            >
              <button
                onClick={() => setScreen("login")}
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "13px",
                  border: "1px solid #e4ece0",
                  background: "#fff",
                  color: "#1f5a31",
                  fontSize: "19px",
                  cursor: "pointer",
                }}
              >
                ←
              </button>
              <div
                style={{
                  margin: "30px auto 0",
                  width: "80px",
                  height: "80px",
                  borderRadius: "24px",
                  background: "#eef6ea",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "34px",
                }}
              >
                OTP
              </div>
              <h1
                style={{
                  margin: "24px 0 8px",
                  fontSize: "26px",
                  fontWeight: "800",
                  color: "#1f5a31",
                  textAlign: "center",
                  letterSpacing: "-.5px",
                }}
              >
                Verify your number
              </h1>
              <p style={{ margin: "0", fontSize: "14.5px", color: "#6d7d6f", lineHeight: "1.55", textAlign: "center" }}>
                Enter the 6-digit code we sent to
                <br />
                <strong style={{ color: "#16231a" }}>{formatPhoneLabel(phone)}</strong>
              </p>

              <div style={{ display: "flex", justifyContent: "center", gap: "10px", marginTop: "32px" }}>
                {otp.map((value, index) => (
                  <input
                    key={index}
                    data-otp={index}
                    value={value}
                    onChange={(event) => handleOtpInput(index, event.target.value)}
                    onKeyDown={(event) => handleOtpKeyDown(index, event)}
                    inputMode="numeric"
                    maxLength={1}
                    style={{
                      width: "48px",
                      height: "58px",
                      textAlign: "center",
                      fontFamily: "inherit",
                      fontSize: "22px",
                      fontWeight: "800",
                      color: "#1f5a31",
                      border: "1.5px solid #d7e0d3",
                      borderRadius: "15px",
                      background: "#fbfdfa",
                    }}
                  />
                ))}
              </div>

              {error && (
                <p style={{ margin: "18px 0 0", fontSize: "13px", fontWeight: "700", color: "#c93b3b", textAlign: "center" }}>
                  {error}
                </p>
              )}
              {status && (
                <p style={{ margin: "18px 0 0", fontSize: "13px", fontWeight: "700", color: "#2b6d3d", textAlign: "center" }}>
                  {status}
                </p>
              )}

              <p style={{ textAlign: "center", margin: "26px 0 0", fontSize: "13.5px", color: "#6d7d6f" }}>
                Did not get the code?{" "}
                <button
                  onClick={resendOtp}
                  disabled={countdown > 0 || loading}
                  style={{
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    fontWeight: "700",
                    color: "#e2822a",
                    cursor: countdown > 0 ? "default" : "pointer",
                    fontFamily: "inherit",
                    fontSize: "13.5px",
                  }}
                >
                  {countdown > 0 ? `Resend in 0:${String(countdown).padStart(2, "0")}` : "Resend OTP"}
                </button>
              </p>

              <button
                onClick={verifyOtpAndLogin}
                disabled={loading}
                style={{
                  marginTop: "auto",
                  width: "100%",
                  height: "58px",
                  border: "none",
                  borderRadius: "18px",
                  background: "linear-gradient(180deg,#2b6d3d,#3f8a54)",
                  color: "#fff",
                  fontFamily: "inherit",
                  fontSize: "16px",
                  fontWeight: "700",
                  cursor: loading ? "wait" : "pointer",
                  boxShadow: "0 14px 26px -10px rgba(18,68,35,.75)",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "Verifying..." : "Verify and Continue"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div id="rivan-login-recaptcha" />
    </>
  );
}
