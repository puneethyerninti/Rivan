import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import { firebaseAuth } from "../lib/firebase";
import { clearSession, loadSession, postJson, saveSession } from "../lib/auth";

const RESEND_SECONDS = 30;
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
  bank_details: "",
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

  useEffect(() => {
    const session = loadSession();
    if (!session?.user?.role) return;
    if (session.user.role === "admin") navigate("/admin", { replace: true });
    else if (session.user.role === "agent") navigate("/agent", { replace: true });
    else navigate("/app", { replace: true });
  }, [navigate]);

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
    if (recaptchaRef.current) return undefined;
    const verifier = new RecaptchaVerifier(firebaseAuth, "rivan-login-recaptcha", {
      size: "invisible",
    });
    recaptchaRef.current = verifier;
    return () => {
      verifier.clear();
      recaptchaRef.current = null;
    };
  }, []);

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
    setRole(nextRole);
    setPhone("");
    resetFlowState();
    setScreen(nextRole === "customer" ? "customer-onboarding" : "login");
  };

  const backToSplash = () => {
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

    if (!recaptchaRef.current) {
      setError("reCAPTCHA is not ready yet. Refresh and try again.");
      return;
    }

    resetMessages();
    setLoading(true);
    try {
      if (roleRef.current === "customer" && !customerOnboarding.name.trim()) {
        setScreen("customer-onboarding");
        setError("Complete onboarding details before requesting OTP.");
        return;
      }
      const precheck = await runAccessPrecheck(normalizedPhone);
      if (!precheck.allowed) {
        if (precheck.statusMessage) setStatus(precheck.statusMessage);
        if (precheck.errorMessage) setError(precheck.errorMessage);
        if (precheck.nextScreen) setScreen(precheck.nextScreen);
        return;
      }

      const fullPhone = `+91${normalizedPhone}`;
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
      setError(err?.message || "Failed to send OTP. Check Firebase phone auth setup.");
      try {
        recaptchaRef.current?.clear();
      } catch {}
      recaptchaRef.current = new RecaptchaVerifier(firebaseAuth, "rivan-login-recaptcha", {
        size: "invisible",
      });
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
      const credential = await confirmationRef.current.confirm(code);
      const firebaseIdToken = await credential.user.getIdToken(true);
      const session = await exchangeToken(firebaseIdToken, normalizedPhone);
      if (session.user.role === "admin") navigate("/admin", { replace: true });
      else if (session.user.role === "agent") navigate("/agent", { replace: true });
      else navigate("/app", { replace: true });
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
    agent: "Agent Portal",
    admin: "Admin Portal",
  };

  const subtitleByRole = {
    customer: "Sign in to continue with Rivan Reality",
    agent: "Use your approved mobile number to access the agent dashboard",
    admin: "Only the authorized admin mobile number can continue",
  };

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
              className="rv-screen"
              style={{
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                background:
                  "linear-gradient(180deg,#f3f8f0 0%,#e7f0e2 46%,#12351d 46%,#0d2916 100%)",
              }}
            >
              <div
                style={{
                  flex: "1",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "70px 34px 20px",
                  textAlign: "center",
                }}
              >
                <img
                  src="/assets/logo-full.png"
                  alt="Rivan Reality"
                  style={{
                    width: "290px",
                    height: "auto",
                    filter: "drop-shadow(0 10px 24px rgba(18,53,29,.18))",
                  }}
                />
                <p
                  style={{
                    margin: "22px 0 0",
                    fontSize: "15px",
                    lineHeight: "1.55",
                    color: "#4a5c4d",
                    maxWidth: "250px",
                    fontWeight: "500",
                  }}
                >
                  Your journey to a home you will be proud to own starts here.
                </p>
              </div>
              <div style={{ padding: "0 34px 46px", display: "flex", flexDirection: "column", gap: "14px" }}>
                <button
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
                  Get Started <span style={{ fontSize: "19px" }}>→</span>
                </button>
                <button
                  onClick={() => navigate("/app")}
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
                <button
                  onClick={() => openPortal("agent")}
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
                  Agent Login
                </button>
                <button
                  onClick={() => openPortal("admin")}
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
                  Admin Login
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
                    color: "#12351d",
                    fontSize: "19px",
                    cursor: "pointer",
                  }}
                >
                  ←
                </button>
                <img src="/assets/logo-mark.png" alt="Rivan" style={{ height: "38px", width: "auto" }} />
              </div>

              <h1
                style={{
                  margin: "26px 0 8px",
                  fontSize: "28px",
                  fontWeight: "800",
                  color: "#12351d",
                  letterSpacing: "-.5px",
                }}
              >
                Customer Onboarding
              </h1>
              <p style={{ margin: "0", fontSize: "14.5px", color: "#6d7d6f", lineHeight: "1.55" }}>
                Start with your details first, then continue with phone OTP login for your customer account.
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
                  background: "linear-gradient(180deg,#1a5e2e,#124423)",
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
                    color: "#12351d",
                    fontSize: "19px",
                    cursor: "pointer",
                  }}
                >
                  ←
                </button>
                <img src="/assets/logo-mark.png" alt="Rivan" style={{ height: "38px", width: "auto" }} />
              </div>

              <h1
                style={{
                  margin: "26px 0 6px",
                  fontSize: "28px",
                  fontWeight: "800",
                  color: "#12351d",
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
                      color: "#12351d",
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
                  Admin access is restricted to the authorized mobile number only.
                </p>
              )}

              {role === "agent" && (
                <p style={{ margin: "14px 0 0", fontSize: "13px", color: "#6d7d6f" }}>
                  Approved agent login is enabled for the registered number ending in 4345. Other numbers open the real application flow instead of fake OTP access.
                </p>
              )}

              {error && (
                <p style={{ margin: "16px 0 0", fontSize: "13px", fontWeight: "700", color: "#c93b3b" }}>
                  {error}
                </p>
              )}
              {status && (
                <p style={{ margin: "16px 0 0", fontSize: "13px", fontWeight: "700", color: "#1a5e2e" }}>
                  {status}
                </p>
              )}

              <button
                onClick={requestOtp}
                disabled={loading}
                style={{
                  marginTop: "24px",
                  width: "100%",
                  height: "58px",
                  border: "none",
                  borderRadius: "18px",
                  background: "linear-gradient(180deg,#1a5e2e,#124423)",
                  color: "#fff",
                  fontFamily: "inherit",
                  fontSize: "16px",
                  fontWeight: "700",
                  cursor: loading ? "wait" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  boxShadow: "0 14px 26px -10px rgba(18,68,35,.75)",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "Checking..." : "Continue"} <span style={{ fontSize: "19px" }}>→</span>
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
                  color: "#12351d",
                  fontSize: "19px",
                  cursor: "pointer",
                }}
              >
                ←
              </button>

              <h1 style={{ margin: "24px 0 8px", fontSize: "26px", fontWeight: "800", color: "#12351d" }}>
                Agent Application
              </h1>
              <p style={{ margin: 0, fontSize: "14px", color: "#6d7d6f", lineHeight: "1.55" }}>
                This number is not approved yet. Submit your details and the admin can approve you in real time.
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
                  value={application.bank_details}
                  onChange={(event) => updateApplicationField("bank_details", event.target.value)}
                  placeholder="Bank details"
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
                <p style={{ margin: "16px 0 0", fontSize: "13px", fontWeight: "700", color: "#1a5e2e" }}>
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
                  background: "linear-gradient(180deg,#1a5e2e,#124423)",
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
                  color: "#1a5e2e",
                  fontSize: "34px",
                  fontWeight: "800",
                }}
              >
                ✓
              </div>
              <h1 style={{ margin: 0, fontSize: "28px", fontWeight: "800", color: "#12351d" }}>
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
                  background: "linear-gradient(180deg,#1a5e2e,#124423)",
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
                  color: "#12351d",
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
                  color: "#12351d",
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
                      color: "#12351d",
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
                <p style={{ margin: "18px 0 0", fontSize: "13px", fontWeight: "700", color: "#1a5e2e", textAlign: "center" }}>
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
                  background: "linear-gradient(180deg,#1a5e2e,#124423)",
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
