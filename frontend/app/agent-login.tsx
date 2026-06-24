import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

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

const WEB_RECAPTCHA_CONTAINER_ID_PREFIX = "agent-auth-recaptcha";

function normalizePublicEnv(value?: string) {
  return (value || "").trim().replace(/^['"]|['"]$/g, "");
}

export default function AgentLoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ phone?: string; application?: string }>();
  const { signIn } = useAuth();

  const isLocalhostWeb =
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const useFirebaseTestPhoneAuth =
    isLocalhostWeb && normalizePublicEnv(process.env.EXPO_PUBLIC_FIREBASE_USE_TEST_PHONE_AUTH) === "true";

  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpSentToPhone, setOtpSentToPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [otpCooldownSeconds, setOtpCooldownSeconds] = useState(0);
  const [recaptchaReady, setRecaptchaReady] = useState(false);
  const [recaptchaSolved, setRecaptchaSolved] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [helperMessage, setHelperMessage] = useState("");

  const otpRefs = useRef<(TextInput | null)[]>([]);
  const confirmationResultRef = useRef<any>(null);
  const recaptchaVerifierRef = useRef<any>(null);
  const recaptchaNodeIdRef = useRef<string | null>(null);
  const recaptchaNodeCounterRef = useRef(0);
  const recaptchaInitializedRef = useRef(false);

  const phoneDigits = useMemo(() => phone.replace(/\D/g, "").slice(-10), [phone]);
  const validOtp = otp.every((digit) => digit.length === 1);

  useEffect(() => {
    if (typeof params.phone === "string" && params.phone) {
      setPhone(params.phone.replace(/\D/g, "").slice(-10));
    }
    if (params.application === "submitted") {
      setHelperMessage("Application submitted successfully. You can sign in after manager approval.");
    } else if (params.application === "approved") {
      setHelperMessage("This number is already approved. Continue with OTP to sign in.");
    }
  }, [params.application, params.phone]);

  useEffect(() => {
    warmBackendReady();
  }, []);

  useEffect(() => {
    if (otpCooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setOtpCooldownSeconds((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCooldownSeconds]);

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

  function resetOtpSession() {
    confirmationResultRef.current = null;
    setOtpSent(false);
    setOtpSentToPhone("");
    setOtp(["", "", "", "", "", ""]);
  }

  function showFormError(message: string) {
    setErrorMessage(message);
    if (Platform.OS !== "web") {
      Alert.alert("Agent login", message);
    }
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
    setHelperMessage("");
    if (!hasFirebaseConfig) return showFormError(firebaseConfigError || "Firebase web configuration is missing.");
    if (phoneDigits.length !== 10) return showFormError("Please enter a valid 10-digit agent mobile number.");
    if (otpCooldownSeconds > 0) return showFormError(`Please wait ${otpCooldownSeconds}s before requesting another OTP.`);

    setLoading(true);
    try {
      const access = await api.agentAccessStatus(`+91${phoneDigits}`);
      if (!access.can_login) {
        const approvalState = String(access.approval_status || "").toLowerCase();
        if (!access.exists || !access.role || !["agent", "sub_agent"].includes(String(access.role))) {
          setHelperMessage("This number is not yet registered as an approved agent account. Complete the application to send it for admin approval.");
          blurActiveWebElement();
          router.push({ pathname: "/agent-apply", params: { phone: `+91${phoneDigits}` } });
        } else if (approvalState === "pending") {
          setHelperMessage("This phone number already has an agent application, but approval is still pending.");
        } else if (approvalState === "rejected") {
          setHelperMessage("This application was rejected. Update the details and submit a fresh request for review.");
          blurActiveWebElement();
          router.push({ pathname: "/agent-apply", params: { phone: `+91${phoneDigits}` } });
        } else if (approvalState === "suspended") {
          setHelperMessage("This account is suspended. Please contact the admin.");
        } else {
          setHelperMessage(access.message || "This number is not ready for agent login yet.");
        }
        return;
      }

      if (Platform.OS !== "web") return showFormError("Agent phone OTP is currently supported on web in this build.");
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
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    setErrorMessage("");
    setHelperMessage("");
    if (!validOtp) return showFormError("Please enter the 6-digit OTP.");

    setLoading(true);
    try {
      const credential = await confirmationResultRef.current.confirm(otp.join(""));
      const { getIdToken } = await getFirebasePhoneAuthHelpers();
      const idToken = await getIdToken(credential.user, true);
      const session = await api.agentFirebaseAuth(idToken, `+91${phoneDigits}`);
      if (session.user?.role !== "agent" && session.user?.role !== "sub_agent") {
        throw new Error("This phone number is not approved for the agent dashboard.");
      }
      await signIn(session.access_token, session.user);
      router.replace("/agent" as never);
    } catch (error: any) {
      const message = String(error?.message || "");
      const normalized = message.toLowerCase();
      if (normalized.includes("no approved agent account exists for this phone number") || normalized.includes("does not belong to an agent account")) {
        setHelperMessage("This number is not yet registered as an approved agent account. Complete the application to send it for admin approval.");
      } else if (normalized.includes("pending manager approval")) {
        setHelperMessage("This phone number already has an agent application, but approval is still pending.");
      }
      showFormError(message || formatPhoneOtpError(error, isLocalhostWeb, useFirebaseTestPhoneAuth, setOtpCooldownSeconds));
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
        eyebrow="Rivan Agent Access"
        title="Approved agents can enter directly through secure OTP."
        body="Use the same phone number that was approved for your agent account. If the number is not registered yet, complete the application first."
        points={[
          { icon: "briefcase", text: "Real-time access linked to approved agent records only" },
          { icon: "check-circle", text: "Agent approvals continue to be controlled by the current admin workflow" },
          { icon: "arrow-right-circle", text: "Move into the live agent dashboard after OTP verification" },
        ]}
        formEyebrow="Agent login"
        formTitle="Agent login"
        formSubtitle="Use your approved mobile number."
        onHome={() => {
          blurActiveWebElement();
          router.replace("/");
        }}
        scrollable
      >
        <View style={styles.formContent}>
          {!hasFirebaseConfig ? (
            <View style={styles.errorBanner}>
              <Feather name="alert-circle" size={14} color={colors.danger} />
              <Text style={styles.errorBannerText}>{firebaseConfigError}</Text>
            </View>
          ) : null}

          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Feather name="alert-circle" size={14} color={colors.danger} />
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
            </View>
          ) : null}

          {helperMessage ? (
            <View style={styles.infoBanner}>
              <Text style={styles.infoBannerText}>{helperMessage}</Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={styles.label}>Registered mobile number</Text>
            <View style={styles.inputShell}>
              <Text style={styles.phonePrefix}>+91</Text>
              <TextInput
                testID="agent-login-phone"
                style={styles.input}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={(text) => {
                  setPhone(text.replace(/\D/g, ""));
                  setErrorMessage("");
                  setHelperMessage("");
                  resetOtpSession();
                }}
                placeholder="Enter 10-digit mobile number"
                placeholderTextColor={colors.stone400}
                maxLength={10}
              />
            </View>
          </View>

          {!otpSent ? (
            <View style={styles.applyCard}>
              <Text style={styles.applyTitle}>New agent?</Text>
              <Text style={styles.applyText}>If this number is not approved yet, open the application form and submit your details for admin review.</Text>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {
                  blurActiveWebElement();
                  router.push({ pathname: "/agent-apply", params: { phone: `+91${phoneDigits}` } });
                }}
              >
                <Text style={styles.secondaryButtonText}>Open application form</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {!otpSent && helperMessage ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => {
                blurActiveWebElement();
                router.push({ pathname: "/agent-apply", params: { phone: `+91${phoneDigits}` } });
              }}
            >
              <Text style={styles.secondaryButtonText}>Complete agent application</Text>
            </TouchableOpacity>
          ) : null}

          {isLocalhostWeb && !otpSent ? (
            <Text style={styles.localHint}>
              {useFirebaseTestPhoneAuth
                ? recaptchaReady
                  ? recaptchaSolved
                    ? "Firebase test verification is ready."
                    : "Complete the reCAPTCHA box at the bottom-right to continue."
                  : "Loading Firebase test verification..."
                : "Use the hosted site for real OTP. On localhost, use Firebase test phone numbers only."}
            </Text>
          ) : null}

          {otpSent ? (
            <>
              <Text style={styles.otpLabel}>Enter the 6-digit OTP sent to {otpSentToPhone}</Text>
              <View style={styles.otpRow}>
                {otp.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={(input) => {
                      otpRefs.current[index] = input;
                    }}
                    testID={`agent-otp-digit-${index}`}
                    style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
                    keyboardType="number-pad"
                    maxLength={1}
                    value={digit}
                    onChangeText={(text) => handleOtpChange(index, text)}
                  />
                ))}
              </View>
              <TouchableOpacity style={[styles.primaryButton, loading && styles.primaryButtonDisabled]} onPress={handleVerifyOtp} disabled={loading}>
                <Text style={styles.primaryButtonText}>{loading ? "Opening..." : "Open Dashboard"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSendOtp} disabled={otpCooldownSeconds > 0 || loading} style={styles.resend}>
                <Text style={styles.resendText}>{otpCooldownSeconds > 0 ? `Resend in ${otpCooldownSeconds}s` : "Resend OTP"}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[
                styles.primaryButton,
                (otpCooldownSeconds > 0 || (useFirebaseTestPhoneAuth && (!recaptchaReady || !recaptchaSolved)) || loading) && styles.primaryButtonDisabled,
              ]}
              onPress={handleSendOtp}
              disabled={otpCooldownSeconds > 0 || loading || (useFirebaseTestPhoneAuth && (!recaptchaReady || !recaptchaSolved))}
              testID="agent-login-submit"
            >
              <Text style={styles.primaryButtonText}>{loading ? "Please wait..." : otpCooldownSeconds > 0 ? `Send OTP in ${otpCooldownSeconds}s` : "Continue"}</Text>
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
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: "#F1F6F2",
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingLeft: spacing.lg,
  },
  phonePrefix: { color: colors.primaryDeepest, fontSize: 15, fontWeight: "700" },
  input: { flex: 1, paddingHorizontal: spacing.lg, paddingVertical: 10, color: colors.primaryDeepest, fontSize: 15 },
  applyCard: {
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  applyTitle: { color: colors.primaryDeepest, fontSize: 14, fontWeight: "800" },
  applyText: { color: colors.stone500, fontSize: 13, lineHeight: 20 },
  otpLabel: { color: colors.stone600, fontSize: 13, fontWeight: "700" },
  otpRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  otpBox: {
    width: 48,
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    textAlign: "center",
    fontSize: 24,
    fontWeight: "700",
    color: colors.primary,
  },
  otpBoxFilled: { backgroundColor: colors.primarySoft },
  resend: { alignItems: "center", paddingVertical: spacing.xs },
  resendText: { color: colors.primary, fontSize: 15, fontWeight: "700" },
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
  infoBanner: {
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    padding: spacing.lg,
  },
  infoBannerText: { color: colors.primaryDeepest, fontSize: 13, lineHeight: 20, fontWeight: "600" },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: { color: colors.primaryDeepest, fontSize: 15, fontWeight: "700" },
  primaryButton: {
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.md,
  },
  primaryButtonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: colors.white, fontSize: 15, fontWeight: "800" },
  localHint: { color: colors.stone600, fontSize: 13, lineHeight: 20 },
});
