import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
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

const WEB_RECAPTCHA_CONTAINER_ID_PREFIX = "firebase-phone-recaptcha";

function normalizePublicEnv(value?: string) {
  return (value || "").trim().replace(/^['"]|['"]$/g, "");
}

export default function LoginScreen() {
  const router = useRouter();
  const { isAuthed, signIn } = useAuth();

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneName, setPhoneName] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpSentToPhone, setOtpSentToPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [otpCooldownSeconds, setOtpCooldownSeconds] = useState(0);
  const [recaptchaReady, setRecaptchaReady] = useState(false);
  const [recaptchaSolved, setRecaptchaSolved] = useState(false);

  const otpRefs = useRef<(TextInput | null)[]>([]);
  const confirmationResultRef = useRef<any>(null);
  const recaptchaVerifierRef = useRef<any>(null);
  const recaptchaNodeIdRef = useRef<string | null>(null);
  const recaptchaNodeCounterRef = useRef(0);
  const recaptchaInitializedRef = useRef(false);

  const isLocalhostWeb =
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const phoneDigits = useMemo(() => phone.replace(/\D/g, "").slice(-10), [phone]);
  const validOtp = otp.every((digit) => digit.length === 1);
  const useFirebaseTestPhoneAuth =
    isLocalhostWeb && normalizePublicEnv(process.env.EXPO_PUBLIC_FIREBASE_USE_TEST_PHONE_AUTH) === "true";

  useEffect(() => {
    if (otpCooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setOtpCooldownSeconds((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCooldownSeconds]);

  useEffect(() => {
    warmBackendReady();
  }, []);

  useEffect(() => {
    if (!isAuthed) return;
    router.replace("/");
  }, [isAuthed, router]);

  useEffect(() => {
    if (!isLocalhostWeb || !useFirebaseTestPhoneAuth) return;
    if (recaptchaInitializedRef.current) return;
    recaptchaInitializedRef.current = true;
    void primeLocalhostRecaptcha();
  }, [isLocalhostWeb, useFirebaseTestPhoneAuth]);

  useEffect(() => {
    return () => {
      cleanupWebRecaptchaArtifacts();
    };
  }, []);

  function showFormError(message: string) {
    setErrorMessage(message);
    if (Platform.OS !== "web") {
      Alert.alert("Authentication", message);
    }
  }

  function resetOtpSession() {
    confirmationResultRef.current = null;
    setOtpSent(false);
    setOtpSentToPhone("");
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
      const existingNode = document.getElementById(recaptchaNodeIdRef.current);
      if (existingNode?.parentNode) existingNode.parentNode.removeChild(existingNode);
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
    host.style.overflow = "hidden";
    host.style.zIndex = "2147483647";

    if (isLocalhostWeb) {
      host.style.right = "24px";
      host.style.bottom = "24px";
      host.style.width = "304px";
      host.style.height = "78px";
      host.style.background = "rgba(247,248,246,0.98)";
      host.style.borderRadius = "16px";
      host.style.padding = "8px";
      host.style.boxShadow = "0 10px 30px rgba(0,0,0,0.18)";
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
    if (!hasFirebaseConfig) return showFormError(firebaseConfigError || "Firebase web configuration is missing.");
    if (phoneDigits.length !== 10) return showFormError("Please enter a valid 10-digit mobile number.");
    if (otpCooldownSeconds > 0) return showFormError(`Please wait ${otpCooldownSeconds}s before requesting another OTP.`);

    setLoading(true);
    try {
      if (Platform.OS !== "web") return showFormError("Firebase phone OTP is currently supported on web in this build.");
      if (isLocalhostWeb && !useFirebaseTestPhoneAuth) {
        return showFormError("Use the hosted site for real OTP. On localhost, use Firebase test phone numbers only.");
      }

      resetOtpSession();
      let verifier = recaptchaVerifierRef.current;
      if (!verifier) verifier = await getFreshWebRecaptchaVerifier();
      if (useFirebaseTestPhoneAuth && !recaptchaReady) return showFormError("reCAPTCHA is still loading. Please wait a moment and try again.");
      if (useFirebaseTestPhoneAuth && !recaptchaSolved) return showFormError("Please complete the reCAPTCHA verification before sending OTP.");

      const auth = await getFirebaseAuth();
      const { signInWithPhoneNumber } = await getFirebasePhoneAuthHelpers();
      confirmationResultRef.current = await signInWithPhoneNumber(auth, `+91${phoneDigits}`, verifier);
      setOtpSent(true);
      setOtpSentToPhone(`+91${phoneDigits}`);
      setOtpCooldownSeconds(45);
      setTimeout(() => otpRefs.current[0]?.focus(), 80);
    } catch (error: any) {
      resetOtpSession();
      showFormError(formatPhoneOtpError(error, isLocalhostWeb, useFirebaseTestPhoneAuth, setOtpCooldownSeconds));
      if (useFirebaseTestPhoneAuth) void primeLocalhostRecaptcha();
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    setErrorMessage("");
    if (!validOtp) return showFormError("Please enter the 6-digit OTP.");

    setLoading(true);
    try {
      const credential = await confirmationResultRef.current.confirm(otp.join(""));
      const { getIdToken } = await getFirebasePhoneAuthHelpers();
      const idToken = await getIdToken(credential.user, true);
      const session = await api.firebaseAuth(idToken, `+91${phoneDigits}`, phoneName.trim() || undefined);
      await signIn(session.access_token, session.user, session.refresh_token);
      router.replace("/");
    } catch (error: any) {
      showFormError(formatPhoneOtpError(error, isLocalhostWeb, useFirebaseTestPhoneAuth, setOtpCooldownSeconds));
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
        eyebrow="Rivan Customer Access"
        title="Customer access"
        body="Sign in with your mobile number to continue with saved actions and property enquiries."
        points={[
          { icon: "map-pin", text: "Continue with your saved discovery flow" },
          { icon: "shield", text: "Secure OTP verification for your account" },
        ]}
        formEyebrow="Customer login"
        formTitle="Customer login"
        formSubtitle="Sign in with your mobile number."
        onHome={() => {
          blurActiveWebElement();
          router.replace("/");
        }}
        scrollable
      >
        <View style={styles.formContent}>
          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Feather name="alert-circle" size={14} color={colors.danger} />
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={styles.label}>Phone Number</Text>
            <View style={styles.inputShell}>
              <Text style={styles.phonePrefix}>+91</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={10}
                placeholder="Enter 10-digit mobile number"
                placeholderTextColor={colors.stone400}
                style={styles.input}
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <View style={styles.inputShell}>
              <TextInput
                value={phoneName}
                onChangeText={setPhoneName}
                autoCapitalize="words"
                placeholder="Rajesh Kumar"
                placeholderTextColor={colors.stone400}
                style={styles.input}
              />
            </View>
          </View>

          {isLocalhostWeb && !otpSent ? (
            <Text style={styles.localHint}>
              {useFirebaseTestPhoneAuth
                ? recaptchaReady
                  ? recaptchaSolved
                    ? "Verification complete. You can send OTP now."
                    : "Complete the reCAPTCHA box shown at the bottom-right."
                  : "Loading verification..."
                : "Use the hosted site for real OTPs. On localhost, use Firebase test phone numbers only."}
            </Text>
          ) : null}

          {otpSent ? (
            <>
              <Text style={styles.otpLabel}>Enter OTP sent to {otpSentToPhone}</Text>
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
                    onChangeText={(text) => handleOtpChange(index, text)}
                  />
                ))}
              </View>
              <TouchableOpacity style={[styles.primaryButton, loading && styles.primaryButtonDisabled]} onPress={handleVerifyOtp} disabled={loading}>
                <Text style={styles.primaryButtonText}>{loading ? "Verifying..." : "Verify OTP"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSendOtp} disabled={otpCooldownSeconds > 0 || loading} style={styles.resend}>
                <Text style={styles.resendText}>{otpCooldownSeconds > 0 ? `Resend in ${otpCooldownSeconds}s` : "Resend OTP"}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[
                styles.primaryButton,
                (otpCooldownSeconds > 0 || loading || (useFirebaseTestPhoneAuth && (!recaptchaReady || !recaptchaSolved))) && styles.primaryButtonDisabled,
              ]}
              onPress={handleSendOtp}
              disabled={otpCooldownSeconds > 0 || loading || (useFirebaseTestPhoneAuth && (!recaptchaReady || !recaptchaSolved))}
            >
              <Text style={styles.primaryButtonText}>{loading ? "Please wait..." : "Continue"}</Text>
            </TouchableOpacity>
          )}
        </View>
      </AuthSplitShell>
    </SafeAreaView>
  );
}

function formatPhoneOtpError(
  error: any,
  isLocalhostWeb: boolean,
  useFirebaseTestPhoneAuth: boolean,
  setOtpCooldownSeconds: React.Dispatch<React.SetStateAction<number>>
) {
  const message = String(error?.message || error || "");
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("captcha") || lowerMessage.includes("app verification")) {
    return useFirebaseTestPhoneAuth
      ? "Complete the reCAPTCHA box first, then try again."
      : "Phone verification could not start because the app verification check did not complete.";
  }
  if (lowerMessage.includes("too many") || lowerMessage.includes("rate limit")) {
    setOtpCooldownSeconds(300);
    return isLocalhostWeb
      ? "Too many OTP attempts on localhost. Wait a few minutes or use Firebase test phone numbers."
      : "Too many OTP attempts. Please wait a few minutes and try again.";
  }
  if (lowerMessage.includes("expired")) return "This OTP has expired. Please request a new one.";
  if (lowerMessage.includes("invalid") || lowerMessage.includes("incorrect")) return "The OTP you entered is incorrect.";
  return message || "Phone OTP verification failed.";
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.offWhite },
  formContent: { gap: spacing.lg },
  field: { gap: spacing.sm },
  label: { color: colors.stone500, fontSize: 13, fontWeight: "700" },
  inputShell: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F6F2",
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 14,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  input: { flex: 1, paddingVertical: 8, fontSize: 14, color: colors.primaryDeepest },
  phonePrefix: { color: colors.primaryDeepest, fontSize: 14, fontWeight: "700", marginRight: spacing.sm },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.rejectedBg,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: "#EDC1B8",
  },
  errorBannerText: { flex: 1, color: colors.rejectedText, fontSize: 13, fontWeight: "600", lineHeight: 20 },
  localHint: { color: colors.stone600, fontSize: 13, lineHeight: 20 },
  otpLabel: { color: colors.stone600, fontSize: 13, fontWeight: "700" },
  otpRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  otpBox: {
    width: 42,
    height: 50,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "700",
    color: colors.primary,
  },
  otpBoxFilled: { backgroundColor: colors.primarySoft },
  primaryButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.md,
  },
  primaryButtonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: colors.white, fontSize: 14, fontWeight: "800" },
  resend: { alignItems: "center", paddingVertical: spacing.xs },
  resendText: { color: colors.primary, fontSize: 15, fontWeight: "700" },
});
