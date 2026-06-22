import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

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
  const { signIn } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const isLocalhostWeb =
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const useFirebaseTestPhoneAuth =
    isLocalhostWeb && normalizePublicEnv(process.env.EXPO_PUBLIC_FIREBASE_USE_TEST_PHONE_AUTH) === "true";
  const showLocalDemoHelp = isLocalhostWeb;

  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpSentToPhone, setOtpSentToPhone] = useState("");
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

  function showFormError(message: string) {
    setErrorMessage(message);
    Alert.alert("Agent login", message);
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
      router.replace("/agent");
    } catch (error: any) {
      const message = String(error?.message || "");
      if (message === "Not Found" || message.includes("HTTP 404")) {
        showFormError(
          "The live backend has not been updated with agent phone login yet. Redeploy the Render backend service, then try again."
        );
        return;
      }
      showFormError(error?.message || formatPhoneOtpError(error, isLocalhostWeb, useFirebaseTestPhoneAuth, setOtpCooldownSeconds));
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
      <ScrollView contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]}>
        <View style={[styles.shell, isWide && styles.shellWide]}>
          <View style={styles.hero}>
            <View style={styles.heroBadge}>
              <Feather name="shield" size={14} color={colors.white} />
              <Text style={styles.heroBadgeText}>AGENT WORKSPACE</Text>
            </View>
            <Text style={styles.eyebrow}>Phone verified access</Text>
            <Text style={styles.title}>Rivan Crest Partners</Text>
            <Text style={styles.subtitle}>
              Approved agents and sub-agents can enter the live dashboard using only their registered mobile number and OTP.
            </Text>

            <View style={styles.heroHighlights}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>OTP</Text>
                <Text style={styles.heroStatLabel}>phone login</Text>
              </View>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>Live</Text>
                <Text style={styles.heroStatLabel}>dashboard sync</Text>
              </View>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>Approved</Text>
                <Text style={styles.heroStatLabel}>agent access</Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.badgeRow}>
              <View style={styles.badge}>
                <Feather name="smartphone" size={14} color={colors.accentDark} />
                <Text style={styles.badgeText}>PHONE ONLY LOGIN</Text>
              </View>
              <TouchableOpacity onPress={() => router.replace("/login")} testID="agent-login-back">
                <Text style={styles.backLink}>Customer Login</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.cardTitle}>Enter Agent Dashboard</Text>
            <Text style={styles.cardSubtitle}>Use the same phone number that your manager registered for your approved agent account.</Text>

            {showLocalDemoHelp ? (
              <View style={styles.quickRow}>
                <TouchableOpacity style={styles.quickButton} onPress={() => setPhone("9900001111")}>
                  <Text style={styles.quickButtonText}>Primary Agent</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickButton} onPress={() => setPhone("9911112222")}>
                  <Text style={styles.quickButtonText}>Sub-Agent</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickButton} onPress={() => setPhone("9922223333")}>
                  <Text style={styles.quickButtonText}>Pending Agent</Text>
                </TouchableOpacity>
              </View>
            ) : null}

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

            <View style={styles.inputBlock}>
              <Text style={styles.label}>Registered Agent Mobile Number</Text>
              <View style={styles.inputShell}>
                <Text style={styles.phonePrefix}>+91</Text>
                <TextInput
                  testID="agent-login-phone"
                  style={styles.input}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={(text) => {
                    const nextPhone = text.replace(/\D/g, "");
                    setPhone(nextPhone);
                    setErrorMessage("");
                    resetOtpSession();
                  }}
                  placeholder="Enter 10-digit mobile number"
                  placeholderTextColor={colors.stone400}
                  maxLength={10}
                />
              </View>
            </View>

            {isLocalhostWeb && !otpSent ? (
              <Text style={styles.infoText}>
                {useFirebaseTestPhoneAuth
                  ? recaptchaReady
                    ? recaptchaSolved
                      ? "Firebase test mode is ready. You can send OTP to configured test phone numbers."
                      : "Complete the reCAPTCHA box shown at the bottom-right, then tap Send OTP."
                    : "Loading Firebase test verification..."
                  : "Use the hosted site for real OTP. On localhost, use Firebase test phone numbers only."}
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
                      testID={`agent-otp-digit-${index}`}
                      style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
                      keyboardType="number-pad"
                      maxLength={1}
                      value={digit}
                      onChangeText={(text) => handleOtpChange(index, text)}
                    />
                  ))}
                </View>
                <Button title="Verify OTP and Open Dashboard" onPress={handleVerifyOtp} loading={loading} testID="agent-login-verify" />
                <TouchableOpacity onPress={handleSendOtp} disabled={otpCooldownSeconds > 0 || loading} style={styles.resend}>
                  <Text style={styles.resendText}>
                    {otpCooldownSeconds > 0 ? `Resend in ${otpCooldownSeconds}s` : "Resend OTP"}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <Button
                title={otpCooldownSeconds > 0 ? `Send OTP in ${otpCooldownSeconds}s` : "Send OTP"}
                onPress={handleSendOtp}
                loading={loading}
                disabled={otpCooldownSeconds > 0 || (useFirebaseTestPhoneAuth && (!recaptchaReady || !recaptchaSolved))}
                testID="agent-login-submit"
              />
            )}

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>
                {showLocalDemoHelp ? "Local testing notes" : "Live phone access"}
              </Text>
              {showLocalDemoHelp ? (
                <>
                  <Text style={styles.infoText}>Primary Agent: +91 99000 01111</Text>
                  <Text style={styles.infoText}>Sub-Agent: +91 99111 12222</Text>
                  <Text style={styles.infoText}>Pending Agent: +91 99222 23333</Text>
                  <Text style={styles.infoText}>Pending agents are blocked until manager approval is complete.</Text>
                </>
              ) : (
                <>
                  <Text style={styles.infoText}>Only manager-approved agent and sub-agent phone numbers can enter the live dashboard.</Text>
                  <Text style={styles.infoText}>Customer login and agent login both work on the hosted URL with Firebase phone OTP.</Text>
                  <Text style={styles.infoText}>If a valid OTP succeeds but access is denied, the phone number is not yet approved inside the agent account records.</Text>
                </>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
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
  safe: { flex: 1, backgroundColor: "#F6F1E8" },
  scroll: { flexGrow: 1, padding: spacing.lg, justifyContent: "center" },
  scrollWide: { paddingVertical: spacing.xl },
  shell: { gap: spacing.lg },
  shellWide: { flexDirection: "row", alignItems: "stretch" },
  hero: {
    gap: spacing.md,
    marginBottom: spacing.lg,
    backgroundColor: "#123A29",
    borderRadius: radii.xl,
    padding: spacing.xl,
    minHeight: 260,
    justifyContent: "space-between",
  },
  heroBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: radii.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroBadgeText: { ...typography.label, color: colors.white, fontSize: 10 },
  eyebrow: { ...typography.label, color: colors.accentDark },
  title: { ...typography.h1, color: colors.white, fontWeight: "800" },
  subtitle: { ...typography.body, color: "#D8E7DE", lineHeight: 22, maxWidth: 560 },
  heroHighlights: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },
  heroStat: {
    minWidth: 110,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  heroStatValue: { color: colors.white, fontSize: 18, lineHeight: 22, fontWeight: "800" },
  heroStatLabel: { color: "#D8E7DE", fontSize: 11, lineHeight: 14, fontWeight: "600" },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: "#EADFCC",
    ...shadow.md,
    flex: 1,
  },
  cardTitle: { ...typography.h3, color: colors.primaryDeepest, fontWeight: "800" },
  cardSubtitle: { ...typography.body, color: colors.stone600, lineHeight: 21 },
  badgeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.full,
  },
  badgeText: { ...typography.label, color: colors.accentDark, fontSize: 9 },
  backLink: { ...typography.small, color: colors.primary, fontWeight: "700" },
  quickRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  quickButton: {
    borderWidth: 1,
    borderColor: "#D8E8DB",
    backgroundColor: "#F5FAF6",
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  quickButtonText: { ...typography.small, color: colors.primaryDeepest, fontWeight: "700" },
  inputBlock: { gap: 6 },
  label: { ...typography.small, color: colors.stone600, fontWeight: "600" },
  inputShell: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FCFBF8",
    borderWidth: 1,
    borderColor: "#E6DED1",
    borderRadius: radii.md,
    paddingLeft: spacing.md,
  },
  phonePrefix: { ...typography.body, color: colors.stone900, fontWeight: "700" },
  input: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    color: colors.stone900,
    fontSize: 15,
  },
  otpLabel: { ...typography.small, color: colors.stone600, fontWeight: "600" },
  otpRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  otpBox: {
    width: 48,
    height: 56,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.stone200,
    backgroundColor: colors.white,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
    color: colors.primary,
  },
  otpBoxFilled: { borderColor: colors.primary, backgroundColor: "#F7FCF8" },
  resend: { alignItems: "center", paddingVertical: spacing.xs },
  resendText: { ...typography.body, color: colors.primary, fontWeight: "600" },
  infoBox: {
    gap: 4,
    backgroundColor: "#FBF6EE",
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "#EEDFC6",
  },
  infoTitle: { ...typography.small, color: colors.primaryDeepest, fontWeight: "700" },
  infoText: { ...typography.small, color: colors.stone600, lineHeight: 18 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FEECEC",
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "#F6C7C7",
  },
  errorBannerText: { flex: 1, ...typography.small, color: colors.danger, fontWeight: "600", lineHeight: 18 },
});
