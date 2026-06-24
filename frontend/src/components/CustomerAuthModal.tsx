import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { AuthSplitShell } from "@/src/components/AuthSplitShell";
import { useAuth } from "@/src/auth-context";
import { api, warmBackendReady } from "@/src/api";
import {
  firebaseConfigError,
  getFirebaseAuth,
  getFirebasePhoneAuthHelpers,
  hasFirebaseConfig,
} from "@/src/firebase";
import { colors, radii, shadow, spacing, typography } from "@/src/theme";
import { blurActiveWebElement } from "@/src/utils/web-focus";

type Props = {
  visible: boolean;
  mode?: "login" | "signup";
  onClose: () => void;
  onSuccess?: () => void;
};

const WEB_RECAPTCHA_CONTAINER_ID_PREFIX = "customer-auth-recaptcha";

function normalizePublicEnv(value?: string) {
  return (value || "").trim().replace(/^['"]|['"]$/g, "");
}

export default function CustomerAuthModal({
  visible,
  mode = "login",
  onClose,
  onSuccess,
}: Props) {
  const { signIn } = useAuth();
  const router = useRouter();
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

  const isLocalhostWeb =
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const phoneDigits = useMemo(() => phone.replace(/\D/g, "").slice(-10), [phone]);
  const validOtp = otp.every((digit) => digit.length === 1);
  const useFirebaseTestPhoneAuth =
    isLocalhostWeb && normalizePublicEnv(process.env.EXPO_PUBLIC_FIREBASE_USE_TEST_PHONE_AUTH) === "true";

  useEffect(() => {
    if (!visible) return;
    warmBackendReady();
  }, [visible]);

  useEffect(() => {
    if (otpCooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setOtpCooldownSeconds((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCooldownSeconds]);

  useEffect(() => {
    if (!visible) return;
    return () => {
      cleanupWebRecaptchaArtifacts();
    };
  }, [visible]);

  function handleSuccess() {
    blurActiveWebElement();
    resetTransientState();
    onSuccess?.();
    onClose();
  }

  function resetTransientState() {
    setErrorMessage("");
    setLoading(false);
    setOtpSent(false);
    setOtpSentToPhone("");
    setOtp(["", "", "", "", "", ""]);
    confirmationResultRef.current = null;
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
      if (existingNode?.parentNode) {
        existingNode.parentNode.removeChild(existingNode);
      }
      recaptchaNodeIdRef.current = null;
    }
  }

  function ensureWebRecaptchaHost() {
    if (typeof document === "undefined") {
      throw new Error("Web verification is unavailable outside the browser.");
    }

    recaptchaNodeCounterRef.current += 1;
    const nodeId = `${WEB_RECAPTCHA_CONTAINER_ID_PREFIX}-${recaptchaNodeCounterRef.current}`;
    const host = document.createElement("div");
    host.id = nodeId;
    host.style.position = "fixed";
    host.style.right = "24px";
    host.style.bottom = "24px";
    host.style.width = "304px";
    host.style.height = "78px";
    host.style.zIndex = "2147483647";
    host.style.background = "rgba(255,255,255,0.98)";
    host.style.borderRadius = "16px";
    host.style.padding = "8px";
    host.style.boxShadow = "0 10px 30px rgba(0,0,0,0.18)";
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

  async function handleSendOtp() {
    setErrorMessage("");
    if (!hasFirebaseConfig) {
      return showFormError(firebaseConfigError || "Firebase web configuration is missing.");
    }
    if (phoneDigits.length !== 10) return showFormError("Please enter a valid 10-digit mobile number.");
    if (otpCooldownSeconds > 0) return showFormError(`Please wait ${otpCooldownSeconds}s before requesting another OTP.`);

    setLoading(true);
    try {
      if (Platform.OS !== "web") {
        return showFormError("Firebase phone OTP is currently supported on web in this build.");
      }
      if (isLocalhostWeb && !useFirebaseTestPhoneAuth) {
        return showFormError("Use the hosted site for real OTP. On localhost, use Firebase test phone numbers only.");
      }

      let verifier = recaptchaVerifierRef.current;
      if (!verifier) {
        verifier = await getFreshWebRecaptchaVerifier();
      }
      if (useFirebaseTestPhoneAuth && (!recaptchaReady || !recaptchaSolved)) {
        return showFormError("Complete the reCAPTCHA verification first.");
      }

      const auth = await getFirebaseAuth();
      const { signInWithPhoneNumber } = await getFirebasePhoneAuthHelpers();
      confirmationResultRef.current = await signInWithPhoneNumber(auth, `+91${phoneDigits}`, verifier);
      setOtpSent(true);
      setOtpSentToPhone(`+91${phoneDigits}`);
      setOtpCooldownSeconds(45);
      setTimeout(() => otpRefs.current[0]?.focus(), 80);
    } catch (error: any) {
      setOtpSent(false);
      setOtp(["", "", "", "", "", ""]);
      showFormError(formatPhoneOtpError(error, isLocalhostWeb, useFirebaseTestPhoneAuth, setOtpCooldownSeconds));
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
      await signIn(session.access_token, session.user);
      handleSuccess();
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

  function showFormError(message: string) {
    setErrorMessage(message);
    if (Platform.OS !== "web") {
      Alert.alert("Authentication", message);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={[styles.backdrop, Platform.OS === "web" ? ({ backdropFilter: "blur(16px)" } as any) : null]} />
        <View style={styles.centerWrap}>
          <AuthSplitShell
            eyebrow="Rivan Customer Access"
            title={mode === "signup" ? "Create your account in one quick step." : "Sign in and get back to browsing fast."}
            body="Save properties, raise enquiries, and continue exactly where you left off."
            points={[
              { icon: "map-pin", text: "Browse projects first, unlock details only when needed" },
              { icon: "shield", text: "Secure OTP access from the same simple screen" },
              { icon: "bookmark", text: "Continue straight into saved actions after authentication" },
            ]}
            formEyebrow={mode === "signup" ? "Create account" : "Customer login"}
            formTitle={mode === "signup" ? "Simple signup" : "Simple login"}
            formSubtitle="Quick sign-in with phone OTP."
            onHome={() => {
              blurActiveWebElement();
              onClose();
              router.replace("/");
            }}
            onClose={() => {
              blurActiveWebElement();
              onClose();
            }}
            scrollable={false}
          >
            <ScrollView contentContainerStyle={styles.cardContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {errorMessage ? (
                <View style={styles.errorBanner}>
                  <Feather name="alert-circle" size={14} color={colors.danger} />
                  <Text style={styles.errorBannerText}>{errorMessage}</Text>
                </View>
              ) : null}

              <View style={styles.section}>
                <InputField
                  label="Phone Number"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  maxLength={10}
                  placeholder="Enter 10-digit mobile number"
                  leftAdornment={<Text style={styles.phonePrefix}>+91</Text>}
                />
                <InputField
                  label="Name"
                  value={phoneName}
                  onChangeText={setPhoneName}
                  autoCapitalize="words"
                  placeholder="Rajesh Kumar"
                />
                {isLocalhostWeb && !otpSent ? (
                  <Text style={styles.recaptchaHint}>
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
                    <TouchableOpacity style={styles.primaryButton} onPress={handleVerifyOtp} disabled={loading}>
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
                      otpCooldownSeconds > 0 || (useFirebaseTestPhoneAuth && (!recaptchaReady || !recaptchaSolved))
                        ? styles.primaryButtonDisabled
                        : null,
                    ]}
                    onPress={handleSendOtp}
                    disabled={otpCooldownSeconds > 0 || loading || (useFirebaseTestPhoneAuth && (!recaptchaReady || !recaptchaSolved))}
                  >
                    <Text style={styles.primaryButtonText}>{loading ? "Please wait..." : mode === "signup" ? "Create with OTP" : "Continue"}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </AuthSplitShell>
        </View>
      </View>
    </Modal>
  );
}

function InputField({
  label,
  leftAdornment,
  style,
  ...props
}: TextInputProps & { label: string; leftAdornment?: React.ReactNode }) {
  return (
    <View style={styles.inputBlock}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputShell, leftAdornment ? styles.inputShellWithAdornment : null]}>
        {leftAdornment ? <View style={styles.inputAdornment}>{leftAdornment}</View> : null}
        <TextInput
          {...props}
          style={[styles.input, leftAdornment ? styles.inputWithAdornment : null, style]}
          placeholderTextColor={colors.stone400}
        />
      </View>
    </View>
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
  root: { flex: 1, justifyContent: "center", alignItems: "center" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(9, 14, 20, 0.42)",
  },
  centerWrap: {
    flex: 1,
    width: "100%",
    padding: spacing.xl,
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    width: "100%",
    maxWidth: 520,
    minHeight: 0,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    overflow: "hidden",
    flexDirection: "column",
    ...shadow.md,
  },
  cardWide: {
    maxWidth: 920,
    minHeight: 0,
    flexDirection: "row",
  },
  brandPanel: {
    display: "none",
  },
  brandPanelWide: {
    display: "flex",
    width: 300,
    backgroundColor: colors.primaryDeepest,
    padding: spacing.xxl,
    justifyContent: "center",
    gap: spacing.lg,
  },
  brandEyebrow: { ...typography.label, color: colors.accentLight },
  brandTitle: { ...typography.h1, color: colors.white, fontWeight: "800" },
  brandText: { ...typography.body, color: "rgba(255,255,255,0.82)", lineHeight: 24 },
  brandPoints: { gap: spacing.lg },
  brandPoint: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  brandPointText: { flex: 1, ...typography.small, color: "rgba(255,255,255,0.82)", lineHeight: 19 },
  formPanel: {
    flex: 1,
  },
  cardContent: {
    padding: spacing.xxl,
    gap: spacing.md,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  headings: { flex: 1, gap: 6 },
  eyebrow: { ...typography.label, color: colors.accentDark },
  title: { ...typography.h2, color: colors.primaryDeepest, fontWeight: "800" },
  subtitle: { ...typography.body, color: colors.stone500, lineHeight: 24 },
  topActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  homeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 42,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  homeButtonText: { ...typography.small, color: colors.primaryDeepest, fontWeight: "700" },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  section: { gap: spacing.md },
  inputBlock: { gap: spacing.sm },
  label: { ...typography.small, color: colors.stone500, fontWeight: "700" },
  inputShell: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.md,
    minHeight: 56,
  },
  inputShellWithAdornment: { paddingLeft: spacing.lg },
  inputAdornment: { marginRight: spacing.sm },
  input: { flex: 1, paddingHorizontal: spacing.lg, paddingVertical: 12, fontSize: 16, color: colors.primaryDeepest },
  inputWithAdornment: { paddingLeft: 0 },
  phonePrefix: { ...typography.body, color: colors.primaryDeepest, fontWeight: "700" },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoText: { flex: 1, ...typography.small, color: colors.stone600, lineHeight: 20 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.rejectedBg,
    borderRadius: radii.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: "#EDC1B8",
  },
  errorBannerText: { flex: 1, ...typography.small, color: colors.rejectedText, fontWeight: "600", lineHeight: 20 },
  primaryButton: {
    minHeight: 58,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    ...shadow.md,
  },
  primaryButtonDisabled: { opacity: 0.55 },
  primaryButtonText: { color: colors.white, fontSize: 16, fontWeight: "800" },
  otpLabel: { ...typography.small, color: colors.stone600, fontWeight: "700" },
  otpRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  otpBox: {
    width: 48,
    height: 56,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
    color: colors.primary,
  },
  otpBoxFilled: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  resend: { alignItems: "center", paddingVertical: spacing.xs },
  resendText: { ...typography.body, color: colors.primary, fontWeight: "600" },
  recaptchaHint: { ...typography.small, color: colors.stone600, lineHeight: 20 },
});
