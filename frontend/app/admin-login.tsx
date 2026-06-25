import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api, warmBackendReady } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { AuthSplitShell } from "@/src/components/AuthSplitShell";
import {
  firebaseConfigError,
  getFirebaseAuth,
  getFirebasePhoneAuthHelpers,
  hasFirebaseConfig,
} from "@/src/firebase";
import { colors, shadow, spacing } from "@/src/theme";
import { blurActiveWebElement } from "@/src/utils/web-focus";

const WEB_RECAPTCHA_CONTAINER_ID_PREFIX = "admin-auth-recaptcha";

function normalizePublicEnv(value?: string) {
  return (value || "").trim().replace(/^['"]|['"]$/g, "");
}

export default function AdminLoginScreen() {
  const router = useRouter();
  const { isAuthed, signIn, user } = useAuth();
  const isLocalhostWeb =
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const useFirebaseTestPhoneAuth =
    isLocalhostWeb && normalizePublicEnv(process.env.EXPO_PUBLIC_FIREBASE_USE_TEST_PHONE_AUTH) === "true";

  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [otpCooldownSeconds, setOtpCooldownSeconds] = useState(0);
  const [recaptchaReady, setRecaptchaReady] = useState(false);
  const [recaptchaSolved, setRecaptchaSolved] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const otpRefs = useRef<(TextInput | null)[]>([]);
  const confirmationResultRef = useRef<any>(null);
  const recaptchaVerifierRef = useRef<any>(null);
  const recaptchaNodeIdRef = useRef<string | null>(null);
  const recaptchaNodeCounterRef = useRef(0);
  const recaptchaInitializedRef = useRef(false);

  const phoneDigits = useMemo(() => phone.replace(/\D/g, "").slice(-10), [phone]);
  const validOtp = otp.every((digit) => digit.length === 1);

  useEffect(() => {
    warmBackendReady();
  }, []);

  useEffect(() => {
    const role = String(user?.role || "").toLowerCase();
    const hasAdminAccess =
      isAuthed && (Boolean(user?.is_admin) || ["admin", "manager", "super_admin"].includes(role));
    if (hasAdminAccess) {
      router.replace("/admin");
    }
  }, [isAuthed, router, user]);

  useEffect(() => {
    if (otpCooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setOtpCooldownSeconds((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCooldownSeconds]);

  useEffect(() => {
    if (!isLocalhostWeb || !useFirebaseTestPhoneAuth || recaptchaInitializedRef.current) return;
    recaptchaInitializedRef.current = true;
    void primeLocalhostRecaptcha();
  }, [isLocalhostWeb, useFirebaseTestPhoneAuth]);

  useEffect(() => () => cleanupWebRecaptchaArtifacts(), []);

  function showFormError(message: string) {
    setErrorMessage(message);
    if (Platform.OS !== "web") Alert.alert("Admin login", message);
  }

  function resetOtpSession() {
    confirmationResultRef.current = null;
    setOtpSent(false);
    setOtp(["", "", "", "", "", ""]);
  }

  function cleanupWebRecaptchaArtifacts() {
    setRecaptchaReady(false);
    setRecaptchaSolved(false);
    if (recaptchaVerifierRef.current) {
      try {
        recaptchaVerifierRef.current.clear();
      } catch {}
      recaptchaVerifierRef.current = null;
    }
    if (typeof document !== "undefined" && recaptchaNodeIdRef.current) {
      document.getElementById(recaptchaNodeIdRef.current)?.remove();
      recaptchaNodeIdRef.current = null;
    }
  }

  function ensureWebRecaptchaHost() {
    if (typeof document === "undefined") throw new Error("Web verification is unavailable outside the browser.");
    recaptchaNodeCounterRef.current += 1;
    const nodeId = `${WEB_RECAPTCHA_CONTAINER_ID_PREFIX}-${recaptchaNodeCounterRef.current}`;
    const host = document.createElement("div");
    host.id = nodeId;
    host.style.position = "fixed";
    host.style.zIndex = "2147483647";
    if (isLocalhostWeb) {
      host.style.right = "24px";
      host.style.bottom = "24px";
      host.style.width = "304px";
      host.style.height = "78px";
    } else {
      host.style.left = "-9999px";
      host.style.top = "0";
      host.style.width = "1px";
      host.style.height = "1px";
      host.style.opacity = "0.01";
      host.style.pointerEvents = "none";
    }
    document.body.appendChild(host);
    recaptchaNodeIdRef.current = nodeId;
    return nodeId;
  }

  async function getFreshWebRecaptchaVerifier() {
    const auth = await getFirebaseAuth();
    const { RecaptchaVerifier } = await getFirebasePhoneAuthHelpers();
    auth.languageCode = "en";
    auth.settings.appVerificationDisabledForTesting = useFirebaseTestPhoneAuth;
    cleanupWebRecaptchaArtifacts();
    const nodeId = ensureWebRecaptchaHost();
    recaptchaVerifierRef.current = new RecaptchaVerifier(auth, nodeId, {
      size: isLocalhostWeb ? "normal" : "invisible",
      callback: () => setRecaptchaSolved(true),
      "expired-callback": () => setRecaptchaSolved(false),
    });
    await recaptchaVerifierRef.current.render();
    setRecaptchaReady(true);
    return recaptchaVerifierRef.current;
  }

  async function primeLocalhostRecaptcha() {
    try {
      await getFreshWebRecaptchaVerifier();
    } catch {
      setRecaptchaReady(false);
    }
  }

  async function handleSendOtp() {
    setErrorMessage("");
    if (!hasFirebaseConfig) return showFormError(firebaseConfigError || "Firebase configuration is missing.");
    if (phoneDigits.length !== 10) return showFormError("Enter a valid 10-digit admin mobile number.");
    if (otpCooldownSeconds > 0) return showFormError(`Please wait ${otpCooldownSeconds}s before requesting another OTP.`);

    setLoading(true);
    try {
      const normalizedPhone = `+91${phoneDigits}`;
      const access = await api.adminAccessStatus(normalizedPhone);
      if (!access.can_login) throw new Error(access.message || "This mobile number is not authorized for admin access.");
      if (Platform.OS !== "web") throw new Error("Admin phone OTP is currently supported on web in this build.");

      resetOtpSession();
      let verifier = recaptchaVerifierRef.current;
      if (!verifier) verifier = await getFreshWebRecaptchaVerifier();
      if (useFirebaseTestPhoneAuth && (!recaptchaReady || !recaptchaSolved)) {
        throw new Error("Complete the verification check before requesting OTP.");
      }

      const auth = await getFirebaseAuth();
      const { signInWithPhoneNumber } = await getFirebasePhoneAuthHelpers();
      confirmationResultRef.current = await signInWithPhoneNumber(auth, normalizedPhone, verifier);
      setOtpSent(true);
      setOtpCooldownSeconds(45);
      setTimeout(() => otpRefs.current[0]?.focus(), 80);
    } catch (error: any) {
      resetOtpSession();
      showFormError(formatAdminOtpError(error, setOtpCooldownSeconds));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    setErrorMessage("");
    if (!validOtp) return showFormError("Enter the 6-digit OTP.");
    if (!confirmationResultRef.current) return showFormError("Request a new OTP and try again.");

    setLoading(true);
    try {
      const credential = await confirmationResultRef.current.confirm(otp.join(""));
      const { getIdToken } = await getFirebasePhoneAuthHelpers();
      const idToken = await getIdToken(credential.user, true);
      const session = await api.adminFirebaseAuth(idToken, `+91${phoneDigits}`);
      const role = String(session.user?.role || "").toLowerCase();
      if (!session.user?.is_admin && !["admin", "manager", "super_admin"].includes(role)) {
        throw new Error("This account does not have admin access.");
      }
      await signIn(session.access_token, session.user, session.refresh_token);
      router.replace("/admin");
    } catch (error: any) {
      showFormError(formatAdminOtpError(error, setOtpCooldownSeconds));
    } finally {
      setLoading(false);
    }
  }

  function handleOtpChange(index: number, value: string) {
    const clean = value.replace(/\D/g, "").slice(0, 1);
    const next = [...otp];
    next[index] = clean;
    setOtp(next);
    if (clean && index < 5) otpRefs.current[index + 1]?.focus();
    if (!clean && index > 0) otpRefs.current[index - 1]?.focus();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <AuthSplitShell
        eyebrow="Rivan Admin"
        title="Admin access"
        body="Sign in with the mobile number registered to your manager or admin account."
        points={[
          { icon: "shield", text: "OTP verification for authorized accounts only" },
        ]}
        formEyebrow="Admin access"
        formTitle="Sign in"
        formSubtitle="Use your registered mobile number."
        onHome={() => {
          blurActiveWebElement();
          router.replace("/");
        }}
      >
        <View style={styles.formContent}>
          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Feather name="alert-circle" size={14} color={colors.danger} />
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={styles.label}>Mobile number</Text>
            <View style={styles.inputShell}>
              <Text style={styles.phonePrefix}>+91</Text>
              <TextInput
                value={phone}
                onChangeText={(value) => {
                  setPhone(value.replace(/\D/g, ""));
                  setErrorMessage("");
                  resetOtpSession();
                }}
                keyboardType="phone-pad"
                maxLength={10}
                style={styles.input}
                placeholder="10-digit mobile number"
                placeholderTextColor={colors.stone400}
              />
            </View>
          </View>

          {otpSent ? (
            <>
              <Text style={styles.otpLabel}>Enter the OTP sent to +91 {phoneDigits}</Text>
              <View style={styles.otpRow}>
                {otp.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={(input) => {
                      otpRefs.current[index] = input;
                    }}
                    style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
                    keyboardType="number-pad"
                    maxLength={1}
                    value={digit}
                    onChangeText={(value) => handleOtpChange(index, value)}
                  />
                ))}
              </View>
              <TouchableOpacity style={[styles.primaryButton, loading && styles.disabled]} onPress={handleVerifyOtp} disabled={loading}>
                <Text style={styles.primaryButtonText}>{loading ? "Verifying..." : "Verify and continue"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.resend} onPress={handleSendOtp} disabled={loading || otpCooldownSeconds > 0}>
                <Text style={styles.resendText}>{otpCooldownSeconds > 0 ? `Resend in ${otpCooldownSeconds}s` : "Resend OTP"}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={[styles.primaryButton, loading && styles.disabled]} onPress={handleSendOtp} disabled={loading}>
              <Text style={styles.primaryButtonText}>{loading ? "Checking..." : "Send OTP"}</Text>
            </TouchableOpacity>
          )}
        </View>
      </AuthSplitShell>
    </SafeAreaView>
  );
}

function formatAdminOtpError(
  error: unknown,
  setOtpCooldownSeconds: React.Dispatch<React.SetStateAction<number>>
) {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.toLowerCase();
  if (normalized.includes("captcha") || normalized.includes("app verification")) {
    return "Phone verification could not start. Refresh the page and try again.";
  }
  if (normalized.includes("too many") || normalized.includes("rate limit")) {
    setOtpCooldownSeconds(300);
    return "Too many OTP attempts. Please wait a few minutes and try again.";
  }
  if (normalized.includes("expired")) return "This OTP has expired. Request a new one.";
  if (normalized.includes("invalid") || normalized.includes("incorrect")) return "The OTP is incorrect.";
  return message || "Admin OTP verification failed.";
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.offWhite },
  formContent: { gap: spacing.lg },
  field: { gap: spacing.sm },
  label: { color: colors.stone600, fontSize: 13, fontWeight: "700" },
  inputShell: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surfaceAlt,
  },
  phonePrefix: { color: colors.primaryDeepest, fontSize: 15, fontWeight: "800", marginRight: spacing.sm },
  input: { flex: 1, paddingVertical: 8, color: colors.primaryDeepest, fontSize: 15 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EDC1B8",
    backgroundColor: colors.rejectedBg,
  },
  errorBannerText: { flex: 1, color: colors.rejectedText, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  otpLabel: { color: colors.stone600, fontSize: 13, fontWeight: "600" },
  otpRow: { flexDirection: "row", justifyContent: "space-between", gap: 7 },
  otpBox: {
    flex: 1,
    maxWidth: 48,
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    textAlign: "center",
    color: colors.primaryDeepest,
    fontSize: 18,
    fontWeight: "800",
  },
  otpBoxFilled: { borderColor: colors.primary },
  primaryButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.sm,
  },
  primaryButtonText: { color: colors.white, fontSize: 14, fontWeight: "800" },
  disabled: { opacity: 0.6 },
  resend: { alignItems: "center", paddingVertical: 5 },
  resendText: { color: colors.primary, fontSize: 13, fontWeight: "700" },
});
