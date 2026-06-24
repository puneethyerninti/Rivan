import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { Button } from "@/src/components/Button";
import { PropertyMedia } from "@/src/components/PropertyMedia";
import { useAuth } from "@/src/auth-context";
import {
  firebaseConfigError,
  getFirebaseAuth,
  getFirebasePhoneAuthHelpers,
  hasFirebaseConfig,
} from "@/src/firebase";
import { api, warmBackendReady } from "@/src/api";
import { colors, radii, shadow, spacing, typography } from "@/src/theme";

const LOGIN_VIDEO_URL = "https://res.cloudinary.com/dzisksq78/video/upload/v1780939161/villa_1_ltxt2q.mp4";
const LOGIN_VIDEO_POSTER = "https://images.unsplash.com/photo-1512917774080-9991f1c4c750";
const WEB_RECAPTCHA_CONTAINER_ID_PREFIX = "firebase-phone-recaptcha";

function normalizePublicEnv(value?: string) {
  return (value || "").trim().replace(/^['"]|['"]$/g, "");
}

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= 920;

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [phone, setPhone] = useState("");
  const [phoneName, setPhoneName] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpSentToPhone, setOtpSentToPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const otpRefs = useRef<(TextInput | null)[]>([]);
  const confirmationResultRef = useRef<any>(null);
  const recaptchaVerifierRef = useRef<any>(null);
  const recaptchaNodeIdRef = useRef<string | null>(null);
  const recaptchaNodeCounterRef = useRef(0);
  const recaptchaInitializedRef = useRef(false);
  const [otpCooldownSeconds, setOtpCooldownSeconds] = useState(0);
  const [recaptchaReady, setRecaptchaReady] = useState(false);
  const [recaptchaSolved, setRecaptchaSolved] = useState(false);

  const isLocalhostWeb =
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname);

  useEffect(() => {
    if (otpCooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setOtpCooldownSeconds((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCooldownSeconds]);

  const phoneDigits = useMemo(() => phone.replace(/\D/g, "").slice(-10), [phone]);
  const validOtp = otp.every((digit) => digit.length === 1);
  const useFirebaseTestPhoneAuth =
    isLocalhostWeb && normalizePublicEnv(process.env.EXPO_PUBLIC_FIREBASE_USE_TEST_PHONE_AUTH) === "true";

  useEffect(() => {
    warmBackendReady();
  }, []);

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

  function resetTransientState() {
    setErrorMessage("");
    setLoading(false);
    setOtpSent(false);
    setOtpSentToPhone("");
    setOtp(["", "", "", "", "", ""]);
    confirmationResultRef.current = null;
  }

  function showFormError(message: string) {
    setErrorMessage(message);
    Alert.alert("Authentication", message);
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
      } catch {
        // Ignore stale reCAPTCHA cleanup failures.
      }
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
      host.style.left = "auto";
      host.style.top = "auto";
      host.style.width = "304px";
      host.style.height = "78px";
      host.style.opacity = "1";
      host.style.pointerEvents = "auto";
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
      callback: () => {
        setRecaptchaSolved(true);
      },
      "expired-callback": () => {
        setRecaptchaSolved(false);
      },
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
    if (phoneDigits.length !== 10) return showFormError("Please enter a valid 10-digit mobile number.");
    if (otpCooldownSeconds > 0) return showFormError(`Please wait ${otpCooldownSeconds}s before requesting another OTP.`);

    setLoading(true);
    try {
      if (Platform.OS !== "web") {
        return showFormError("Firebase phone OTP is currently supported on web in this build.");
      }
      if (isLocalhostWeb && !useFirebaseTestPhoneAuth) {
        return showFormError(
          "Real Firebase phone OTP should be tested on the hosted site, not localhost. For local testing, add Firebase test phone numbers and set EXPO_PUBLIC_FIREBASE_USE_TEST_PHONE_AUTH=true."
        );
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
      Alert.alert("OTP", "OTP sent successfully.");
      setTimeout(() => otpRefs.current[0]?.focus(), 80);
    } catch (error: any) {
      resetOtpSession();
      showFormError(formatPhoneOtpError(error, isLocalhostWeb, useFirebaseTestPhoneAuth, setOtpCooldownSeconds));
      if (useFirebaseTestPhoneAuth) {
        void primeLocalhostRecaptcha();
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    setErrorMessage("");
    if (!validOtp) return showFormError("Please enter the 6-digit OTP.");

    setLoading(true);
    try {
      const normalizedPhone = `+91${phoneDigits}`;
      const cleanName = phoneName.trim() || undefined;
      const session = await verifyFirebasePhoneOtp(
        confirmationResultRef.current,
        otpSent,
        otpSentToPhone,
        normalizedPhone,
        otp.join(""),
        cleanName
      );
      await signIn(session.access_token, session.user);
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
    <SafeAreaView style={styles.safe} testID="login-screen">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={[styles.shell, isWide && styles.shellWide]}>
            <View style={[styles.brandColumn, isWide && styles.brandColumnWide]}>
              <View style={[styles.logoWrap, isWide && styles.logoWrapWide]}>
                <Image source={require("../assets/images/rivan-logo.png")} style={styles.logo} resizeMode="contain" />
                <Text style={styles.tagline}>Premium real estate access</Text>
              </View>

              <View style={styles.entryPanel}>
                <Text style={styles.entryBrand}>Rivan</Text>
                <View style={styles.entryMediaShell}>
                  <PropertyMedia image={LOGIN_VIDEO_POSTER} videoUrl={LOGIN_VIDEO_URL} style={styles.entryMedia} />
                </View>
                <Text style={styles.entryHeadline}>Login to get started</Text>
                <Text style={styles.entryText}>
                  Browse properties, save favourites, and continue your enquiry journey with a simpler green-first experience.
                </Text>
                <View style={styles.entryDots}>
                  <View style={[styles.entryDot, styles.entryDotActive]} />
                  <View style={styles.entryDot} />
                  <View style={styles.entryDot} />
                </View>
              </View>

              <View style={styles.securityCard}>
                <View style={styles.securityIcon}>
                  <Feather name="shield" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.securityTitle}>Fast and secure login</Text>
                  <Text style={styles.securityText}>
                    Phone OTP stays primary so customer access remains quick and simple.
                  </Text>
                </View>
              </View>
            </View>

            <View style={[styles.formCard, isWide && styles.formCardWide]}>
              <View style={styles.formTopRow}>
                <View style={styles.formTopCopy}>
                  <Text style={styles.formEyebrow}>Customer access</Text>
                  <Text style={styles.formTitle}>Simple login</Text>
                  <Text style={styles.formSubcopy}>Use your mobile number to continue in a few seconds.</Text>
                </View>
                <TouchableOpacity
                  style={styles.backHomeButton}
                  onPress={() => router.replace("/")}
                  testID="login-back-home"
                >
                  <Feather name="arrow-left" size={16} color={colors.primaryDeepest} />
                  <Text style={styles.backHomeButtonText}>Home</Text>
                </TouchableOpacity>
              </View>

              {errorMessage ? (
                <View style={styles.errorBanner}>
                  <Feather name="alert-circle" size={14} color={colors.danger} />
                  <Text style={styles.errorBannerText}>{errorMessage}</Text>
                </View>
              ) : null}

              {!hasFirebaseConfig ? (
                <View style={styles.errorBanner}>
                  <Feather name="tool" size={14} color={colors.danger} />
                  <Text style={styles.errorBannerText}>
                    {firebaseConfigError} Rebuild the web app after setting the EXPO_PUBLIC_FIREBASE_* variables.
                  </Text>
                </View>
              ) : null}

              <View style={styles.formSection}>
                  <InputField
                    label="Phone Number"
                    value={phone}
                    onChangeText={(text) => {
                      const nextPhone = text.replace(/\D/g, "");
                      if (nextPhone !== phone) {
                        setErrorMessage("");
                        resetOtpSession();
                        if (!otpSent && useFirebaseTestPhoneAuth) {
                          setRecaptchaSolved(false);
                        }
                      }
                      setPhone(nextPhone);
                    }}
                    keyboardType="phone-pad"
                    maxLength={10}
                    testID="login-phone-input"
                    placeholder="Enter 10-digit mobile number"
                    leftAdornment={<Text style={styles.phonePrefix}>+91</Text>}
                  />

                  <InputField
                    label="Your Name (optional)"
                    value={phoneName}
                    onChangeText={setPhoneName}
                    autoCapitalize="words"
                    autoComplete="name"
                    testID="login-phone-name-input"
                    placeholder="Rajesh Kumar"
                  />

                  {isLocalhostWeb && !otpSent ? (
                    <Text style={styles.recaptchaHint}>
                      {useFirebaseTestPhoneAuth
                        ? recaptchaReady
                          ? recaptchaSolved
                            ? "Firebase test mode is enabled for localhost. You can send OTP now."
                            : "Complete the reCAPTCHA box at the bottom-right, then continue."
                          : "Loading Firebase test verification..."
                        : "Localhost is only safe for Firebase test phone numbers. Use the hosted site for real OTPs."}
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
                            testID={`login-otp-digit-${index}`}
                            style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
                            keyboardType="number-pad"
                            maxLength={1}
                            value={digit}
                            onChangeText={(text) => handleOtpChange(index, text)}
                            onKeyPress={(event) => {
                              if (event.nativeEvent.key === "Backspace" && !digit && index > 0) {
                                otpRefs.current[index - 1]?.focus();
                              }
                            }}
                          />
                        ))}
                      </View>

                      <Button
                        title="Continue"
                        onPress={handleVerifyOtp}
                        loading={loading}
                        testID="login-verify-button"
                        style={{ marginTop: spacing.sm }}
                      />

                      <TouchableOpacity
                        onPress={handleSendOtp}
                        style={[styles.resend, otpCooldownSeconds > 0 ? styles.resendDisabled : null]}
                        disabled={otpCooldownSeconds > 0 || loading}
                        testID="login-resend-button"
                      >
                        <Text style={styles.resendText}>
                          {otpCooldownSeconds > 0 ? `Resend in ${otpCooldownSeconds}s` : "Resend OTP"}
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <Button
                      title={otpCooldownSeconds > 0 ? `Send OTP in ${otpCooldownSeconds}s` : "Continue"}
                      onPress={handleSendOtp}
                      loading={loading}
                      disabled={otpCooldownSeconds > 0 || (useFirebaseTestPhoneAuth && (!recaptchaReady || !recaptchaSolved))}
                      testID="login-send-otp-button"
                      style={{ marginTop: spacing.sm }}
                    />
                  )}
              </View>

              <Text style={styles.footer}>By continuing, you agree to Rivan&apos;s Terms and Privacy Policy.</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function InputField({
  label,
  leftAdornment,
  style,
  ...props
}: TextInputProps & {
  label: string;
  leftAdornment?: React.ReactNode;
}) {
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

  if (
    lowerMessage.includes("captcha") ||
    lowerMessage.includes("rejected") ||
    lowerMessage.includes("app verification")
  ) {
    return useFirebaseTestPhoneAuth
      ? "Complete the reCAPTCHA box shown on the page, then try sending the OTP again."
      : "Phone verification could not start because the app verification check did not complete. Use the hosted site for real OTPs, or Firebase test phone numbers on localhost.";
  }
  if (lowerMessage.includes("recaptcha timeout")) {
    return "The reCAPTCHA check timed out before Firebase could send the OTP. Complete it again and send OTP once more.";
  }
  if (lowerMessage.includes("invalid_app_credential")) {
    return isLocalhostWeb
      ? "Firebase rejected the localhost app verification token. Real phone OTP is not reliable on localhost; use the hosted site or Firebase test phone numbers."
      : "Firebase rejected the app verification token. Reload the page and try requesting a new OTP.";
  }
  if (lowerMessage.includes("billing-not-enabled")) {
    return "Firebase billing is not enabled for this project. Link billing to the active Firebase project and try again.";
  }
  if (lowerMessage.includes("phone") && lowerMessage.includes("invalid")) {
    return "Please enter a valid phone number with an active SMS line.";
  }
  if (
    lowerMessage.includes("auth/too-many-requests") ||
    lowerMessage.includes("too many") ||
    lowerMessage.includes("rate limit") ||
    lowerMessage.includes("over sms send rate limit") ||
    lowerMessage.includes("temporarily")
  ) {
    setOtpCooldownSeconds(300);
    return "Firebase has temporarily blocked more OTP sends for this number, device, or IP. This cannot be bypassed in code. Wait a few minutes, then try once from the hosted site. For development, use Firebase test phone numbers.";
  }
  if (lowerMessage.includes("invalid") || lowerMessage.includes("incorrect")) {
    return "The OTP you entered is incorrect.";
  }
  if (lowerMessage.includes("expired")) {
    return "This OTP has expired. Please request a new one.";
  }
  return message || "Phone OTP verification failed.";
}

async function verifyFirebasePhoneOtp(
  confirmationResult: any,
  otpSent: boolean,
  otpSentToPhone: string,
  phoneNumber: string,
  otpValue: string,
  name?: string
) {
  if (!confirmationResult) {
    throw new Error("No active OTP session exists. Please send a new OTP first.");
  }
  if (!otpSent || otpSentToPhone !== phoneNumber) {
    throw new Error("This OTP does not match the current phone number. Please send a new OTP first.");
  }

  const credential = await confirmationResult.confirm(otpValue);
  const { getIdToken } = await getFirebasePhoneAuthHelpers();
  const idToken = await getIdToken(credential.user, true);
  return api.firebaseAuth(idToken, phoneNumber, name);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.offWhite },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, padding: spacing.xl, justifyContent: "center" },
  shell: { width: "100%", maxWidth: 1120, alignSelf: "center", gap: spacing.xxl },
  shellWide: { flexDirection: "row", alignItems: "stretch" },
  brandColumn: { gap: spacing.xl },
  brandColumnWide: { flex: 1, justifyContent: "center", paddingRight: spacing.xl },
  formCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.xl,
    padding: spacing.xxl,
    gap: spacing.lg,
    ...shadow.md,
  },
  formCardWide: { flex: 1, maxWidth: 460 },
  logoWrap: { alignItems: "center", gap: spacing.md },
  logoWrapWide: { alignItems: "flex-start" },
  logo: { width: 180, height: 88 },
  tagline: { ...typography.small, color: colors.primary, fontWeight: "700", textTransform: "uppercase" },
  entryPanel: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.xl,
    padding: spacing.xxl,
    borderWidth: 1,
    borderColor: "#D0E3D6",
    alignItems: "center",
    ...shadow.sm,
  },
  entryBrand: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
    color: colors.primaryDeepest,
    marginBottom: spacing.md,
  },
  entryMediaShell: {
    width: 184,
    height: 210,
    borderTopLeftRadius: 92,
    borderTopRightRadius: 92,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: "hidden",
    backgroundColor: colors.surfaceAlt,
  },
  entryMedia: { width: "100%", height: "100%" },
  entryHeadline: {
    marginTop: spacing.lg,
    ...typography.h2,
    color: colors.primaryDeepest,
    textAlign: "center",
  },
  entryText: {
    marginTop: spacing.sm,
    fontSize: 15,
    lineHeight: 24,
    color: colors.stone600,
    textAlign: "center",
    maxWidth: 360,
  },
  entryDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: spacing.md,
  },
  entryDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#CAD6C8",
  },
  entryDotActive: {
    width: 24,
    backgroundColor: colors.primary,
  },
  formTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  formTopCopy: { gap: 2, flex: 1 },
  formEyebrow: { ...typography.label, color: colors.primary, letterSpacing: 1.1 },
  formTitle: { ...typography.h3, color: colors.primaryDeepest, fontWeight: "800" },
  formSubcopy: { ...typography.small, color: colors.stone600, lineHeight: 20, marginTop: 4 },
  backHomeButton: {
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
  backHomeButtonText: { ...typography.small, color: colors.primaryDeepest, fontWeight: "700" },
  securityCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    ...shadow.sm,
  },
  securityIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  securityTitle: { ...typography.body, color: colors.primaryDeepest, fontWeight: "700" },
  securityText: { ...typography.small, color: colors.stone600, marginTop: 2, lineHeight: 20 },
  formSection: { gap: spacing.lg },
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
  input: { flex: 1, paddingHorizontal: spacing.lg, paddingVertical: 14, fontSize: 16, color: colors.primaryDeepest },
  inputWithAdornment: { paddingLeft: 0 },
  phonePrefix: { ...typography.body, color: colors.primaryDeepest, fontWeight: "700" },
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
  otpLabel: { ...typography.small, color: colors.stone600, fontWeight: "700", marginTop: spacing.xs },
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
  resend: { alignItems: "center", marginTop: spacing.xs, padding: spacing.sm },
  resendDisabled: { opacity: 0.55 },
  resendText: { ...typography.body, color: colors.primary, fontWeight: "600" },
  recaptchaHint: { ...typography.small, color: colors.stone600, lineHeight: 20 },
  footer: { ...typography.small, color: colors.stone400, textAlign: "center", marginTop: spacing.lg, lineHeight: 20 },
});
