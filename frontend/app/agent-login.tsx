import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView as SafeAreaProviderView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Button } from "@/src/components/Button";
import { useAuth } from "@/src/auth-context";
import { api, warmBackendReady } from "@/src/api";
import {
  firebaseConfigError,
  getFirebaseAuth,
  getFirebasePhoneAuthHelpers,
  hasFirebaseConfig,
} from "@/src/firebase";
import { colors, radii, shadow, spacing, typography } from "@/src/theme";

const WEB_RECAPTCHA_CONTAINER_ID_PREFIX = "agent-auth-recaptcha";

function normalizePublicEnv(value?: string) {
  return (value || "").trim().replace(/^['"]|['"]$/g, "");
}

export default function AgentLoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ phone?: string }>();
  const { signIn } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= 940;

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
  }, [params.phone]);

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
    Alert.alert("Agent login", message);
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
    if (!hasFirebaseConfig) {
      return showFormError(firebaseConfigError || "Firebase web configuration is missing.");
    }
    if (phoneDigits.length !== 10) return showFormError("Please enter a valid 10-digit agent mobile number.");
    if (otpCooldownSeconds > 0) return showFormError(`Please wait ${otpCooldownSeconds}s before requesting another OTP.`);

    setLoading(true);
    try {
      if (Platform.OS !== "web") {
        return showFormError("Agent phone OTP is currently supported on web in this build.");
      }
      if (isLocalhostWeb && !useFirebaseTestPhoneAuth) {
        return showFormError("Use the hosted site for real OTP. On localhost, use Firebase test phone numbers only.");
      }

      resetOtpSession();
      let verifier = recaptchaVerifierRef.current;
      if (!verifier) {
        verifier = await getFreshWebRecaptchaVerifier();
      }
      if (useFirebaseTestPhoneAuth && !recaptchaReady) {
        return showFormError("reCAPTCHA is still loading. Please wait a moment and try again.");
      }
      if (useFirebaseTestPhoneAuth && !recaptchaSolved) {
        return showFormError("Please complete the reCAPTCHA verification before sending OTP.");
      }

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

      if (
        normalized.includes("no approved agent account exists for this phone number") ||
        normalized.includes("does not belong to an agent account")
      ) {
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
    <SafeAreaProviderView style={styles.safe}>
      <ScrollView contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]} showsVerticalScrollIndicator={false}>
        <View style={[styles.shell, isWide && styles.shellWide]}>
          <View style={styles.hero}>
            <Text style={styles.heroEyebrow}>Agent access</Text>
            <Text style={styles.heroTitle}>Approved agents can enter directly through secure OTP.</Text>
            <Text style={styles.heroBody}>
              Use the same phone number that was approved for your agent account. If the number is not registered yet, complete the application flow first.
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>Agent login</Text>
                <Text style={styles.cardSubtitle}>OTP-based access linked to approved agent records.</Text>
              </View>
              <TouchableOpacity onPress={() => router.replace("/")}>
                <Text style={styles.backLink}>Home</Text>
              </TouchableOpacity>
            </View>

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

            {!otpSent && helperMessage ? (
              <TouchableOpacity style={styles.secondaryCta} onPress={() => router.push({ pathname: "/agent-apply", params: { phone: `+91${phoneDigits}` } })}>
                <Text style={styles.secondaryCtaText}>Complete agent application</Text>
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
                <Button title="Open Dashboard" onPress={handleVerifyOtp} loading={loading} testID="agent-login-verify" />
                <TouchableOpacity onPress={handleSendOtp} disabled={otpCooldownSeconds > 0 || loading} style={styles.resend}>
                  <Text style={styles.resendText}>{otpCooldownSeconds > 0 ? `Resend in ${otpCooldownSeconds}s` : "Resend OTP"}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Button
                title={otpCooldownSeconds > 0 ? `Send OTP in ${otpCooldownSeconds}s` : "Continue"}
                onPress={handleSendOtp}
                loading={loading}
                disabled={otpCooldownSeconds > 0 || (useFirebaseTestPhoneAuth && (!recaptchaReady || !recaptchaSolved))}
                testID="agent-login-submit"
              />
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaProviderView>
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
  scroll: { flexGrow: 1, padding: spacing.xl, justifyContent: "center" },
  scrollWide: { paddingVertical: spacing.xxxl },
  shell: { gap: spacing.xl },
  shellWide: { flexDirection: "row", alignItems: "stretch" },
  hero: {
    flex: 1,
    borderRadius: 28,
    backgroundColor: colors.primaryDeepest,
    padding: spacing.xxl,
    gap: spacing.md,
    justifyContent: "center",
    ...shadow.md,
  },
  heroEyebrow: { ...typography.label, color: colors.accentLight },
  heroTitle: { ...typography.h2, color: colors.white },
  heroBody: { ...typography.body, color: "#D7E7DD" },
  card: {
    flex: 1,
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.xxl,
    gap: spacing.lg,
    ...shadow.md,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  cardTitle: { ...typography.h3, color: colors.primaryDeepest },
  cardSubtitle: { ...typography.body, color: colors.stone500, marginTop: 4 },
  backLink: { ...typography.small, color: colors.primary, fontWeight: "700" },
  field: { gap: spacing.sm },
  label: { ...typography.small, color: colors.stone500, fontWeight: "700" },
  inputShell: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingLeft: spacing.lg,
  },
  phonePrefix: { ...typography.body, color: colors.primaryDeepest, fontWeight: "700" },
  input: { flex: 1, paddingHorizontal: spacing.lg, paddingVertical: 12, color: colors.primaryDeepest, fontSize: 15 },
  otpLabel: { ...typography.small, color: colors.stone600, fontWeight: "700" },
  otpRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  otpBox: {
    width: 50,
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
  infoBanner: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  infoBannerText: { ...typography.small, color: colors.primaryDeepest, lineHeight: 20 },
  secondaryCta: {
    minHeight: 50,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryCtaText: { ...typography.body, color: colors.primaryDeepest, fontWeight: "700" },
  localHint: { ...typography.small, color: colors.stone600, lineHeight: 20 },
});
