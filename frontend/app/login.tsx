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
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import Constants from "expo-constants";
import { getIdToken, RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";

import { Button } from "@/src/components/Button";
import { PropertyMedia } from "@/src/components/PropertyMedia";
import { useAuth } from "@/src/auth-context";
import { getFirebaseAuth } from "@/src/firebase";
import { api } from "@/src/api";
import { colors, radii, spacing, typography } from "@/src/theme";

WebBrowser.maybeCompleteAuthSession();

type AuthTab = "phone" | "google";

const AUTH_TABS: { key: AuthTab; label: string }[] = [
  { key: "phone", label: "Phone OTP" },
  { key: "google", label: "Google" },
];

const LOGIN_VIDEO_URL = "https://res.cloudinary.com/dzisksq78/video/upload/v1780939161/villa_1_ltxt2q.mp4";
const LOGIN_VIDEO_POSTER = "https://images.unsplash.com/photo-1512917774080-9991f1c4c750";
const WEB_RECAPTCHA_CONTAINER_ID_PREFIX = "firebase-phone-recaptcha";

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= 920;

  const [activeTab, setActiveTab] = useState<AuthTab>("phone");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
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

  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "";
  const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || "";
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "";
  const isExpoGo = Constants.appOwnership === "expo";
  const isLocalhostWeb =
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const isHostedWeb =
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    !["localhost", "127.0.0.1"].includes(window.location.hostname);
  const googlePlatformClientId = Platform.select({
    android: googleAndroidClientId,
    ios: googleIosClientId,
    default: googleWebClientId,
  });
  const googleRedirectUri =
    process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_URI?.trim() ||
    (Platform.OS === "web"
      ? isHostedWeb && typeof window !== "undefined"
        ? `${window.location.origin}${window.location.pathname || "/login"}`
        : ""
      : AuthSession.makeRedirectUri({
          native: "frontend://google-auth",
          scheme: "frontend",
          path: "google-auth",
        }));

  const [googleRequest, googleResponse, promptGoogleAsync] = Google.useIdTokenAuthRequest({
    webClientId: googleWebClientId,
    iosClientId: googleIosClientId || undefined,
    androidClientId: googleAndroidClientId || undefined,
    redirectUri: googleRedirectUri || undefined,
    scopes: ["openid", "profile", "email"],
    selectAccount: true,
  });

  useEffect(() => {
    const runGoogleAuth = async () => {
      if (!googleResponse) return;

      if (googleResponse.type !== "success") {
        if (googleResponse.type !== "dismiss") {
          setErrorMessage(formatGoogleLoginError((googleResponse as any)?.error, googleRedirectUri, isLocalhostWeb));
        }
        setGoogleLoading(false);
        return;
      }

      const result: any = googleResponse;
      const idToken = result.params?.id_token || result.authentication?.idToken;
      if (!idToken) {
        setGoogleLoading(false);
        setErrorMessage("Google did not return a valid identity token.");
        return;
      }

      try {
        const session = await api.googleAuth(idToken);
        await signIn(session.access_token, session.user);
      } catch (error: any) {
        setErrorMessage(error?.message || "Google sign-in failed");
      } finally {
        setGoogleLoading(false);
      }
    };

    void runGoogleAuth();
  }, [googleResponse, googleRedirectUri, isLocalhostWeb, signIn]);

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
    isLocalhostWeb && process.env.EXPO_PUBLIC_FIREBASE_USE_TEST_PHONE_AUTH === "true";

  useEffect(() => {
    if (!isLocalhostWeb || activeTab !== "phone" || !useFirebaseTestPhoneAuth) return;
    if (recaptchaInitializedRef.current) return;
    recaptchaInitializedRef.current = true;
    void primeLocalhostRecaptcha();
  }, [activeTab, isLocalhostWeb, useFirebaseTestPhoneAuth]);

  useEffect(() => {
    return () => {
      cleanupWebRecaptchaArtifacts();
    };
  }, []);

  function resetTransientState(nextTab: AuthTab) {
    setActiveTab(nextTab);
    setErrorMessage("");
    setLoading(false);
    setGoogleLoading(false);
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
    const auth = getFirebaseAuth();
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

      const auth = getFirebaseAuth();
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

  async function handleGoogleLogin() {
    setErrorMessage("");
    if (!googleWebClientId) {
      return showFormError("Google client ID is missing from the app configuration.");
    }
    if (Platform.OS === "web" && isLocalhostWeb) {
      return showFormError(
        "Google sign-in should be tested on the hosted HTTPS site, not localhost. Google blocks this loopback redirect flow here."
      );
    }
    if (isExpoGo) {
      return showFormError(
        "Google sign-in is not supported in Expo Go for this OAuth flow. Use the web app or a development build."
      );
    }
    if (Platform.OS === "web" && !googleRedirectUri) {
      return showFormError(
        "Google sign-in is missing a valid hosted redirect URI. Open the deployed HTTPS site and add that exact URI in the Google OAuth web client."
      );
    }
    if (
      Platform.OS !== "web" &&
      (!googlePlatformClientId || googlePlatformClientId === googleWebClientId)
    ) {
      return showFormError(
        "Google sign-in for native builds needs a dedicated Android or iOS OAuth client ID. The current app configuration only has the web client ID."
      );
    }

    if (__DEV__) {
      console.info(`Google OAuth redirect URI: ${googleRedirectUri}`);
    }

    setGoogleLoading(true);
    try {
      const result = await promptGoogleAsync();
      if (result.type !== "success") {
        setGoogleLoading(false);
        if (result.type !== "dismiss") {
          setErrorMessage("Google sign-in was cancelled or could not be completed.");
        }
      }
    } catch (error: any) {
      setGoogleLoading(false);
      showFormError(formatGoogleLoginError(error?.message || error, googleRedirectUri, isLocalhostWeb));
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
      <View style={styles.backgroundWrap}>
        <PropertyMedia image={LOGIN_VIDEO_POSTER} videoUrl={LOGIN_VIDEO_URL} style={styles.backgroundMedia} />
        <View style={styles.backgroundOverlay} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={[styles.shell, isWide && styles.shellWide]}>
            <View style={[styles.brandColumn, isWide && styles.brandColumnWide]}>
              <View style={styles.logoWrap}>
                <Image source={require("../assets/images/rivan-logo.png")} style={styles.logo} resizeMode="contain" />
                <Text style={styles.tagline}>Legacy of trust, legacy of wealth</Text>
              </View>

              <View style={styles.brandCopy}>
                <Text style={styles.title}>Sign in to Rivan</Text>
                <Text style={styles.subtitle}>
                  Continue with your mobile number or Google account to access your properties, visits, and documents.
                </Text>
              </View>

              <View style={styles.securityCard}>
                <View style={styles.securityIcon}>
                  <Feather name="shield" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.securityTitle}>Secure customer access</Text>
                  <Text style={styles.securityText}>
                    Your account syncs across the mobile app and web dashboard with protected sessions.
                  </Text>
                </View>
              </View>
            </View>

            <View style={[styles.formCard, isWide && styles.formCardWide]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
                {AUTH_TABS.map((tab) => (
                  <TouchableOpacity
                    key={tab.key}
                    style={[styles.tabPill, activeTab === tab.key && styles.tabPillActive]}
                    onPress={() => resetTransientState(tab.key)}
                    testID={`login-tab-${tab.key}`}
                  >
                    <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {errorMessage ? (
                <View style={styles.errorBanner}>
                  <Feather name="alert-circle" size={14} color={colors.danger} />
                  <Text style={styles.errorBannerText}>{errorMessage}</Text>
                </View>
              ) : null}

              {activeTab === "phone" ? (
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
                            ? "Firebase test mode is enabled for localhost. You can send OTP to configured test phone numbers now."
                            : "Complete the reCAPTCHA box shown at the bottom-right, then tap Send OTP."
                          : "Loading Firebase test verification..."
                        : "Localhost is only safe for Firebase test phone numbers. Use the hosted site for real OTPs."}
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
                        title="Verify OTP"
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
                      title={otpCooldownSeconds > 0 ? `Send OTP in ${otpCooldownSeconds}s` : "Send OTP"}
                      onPress={handleSendOtp}
                      loading={loading}
                      disabled={otpCooldownSeconds > 0 || (useFirebaseTestPhoneAuth && (!recaptchaReady || !recaptchaSolved))}
                      testID="login-send-otp-button"
                      style={{ marginTop: spacing.sm }}
                    />
                  )}
                </View>
              ) : null}

              {activeTab === "google" ? (
                <View style={styles.formSection}>
                  <View style={styles.googleInfoCard}>
                    <Feather name="globe" size={18} color={colors.primary} />
                    <Text style={styles.googleInfoText}>
                      {isExpoGo
                        ? "Use the hosted web app or a development build for Google sign-in. Expo Go cannot complete this redirect flow."
                        : Platform.OS === "web"
                          ? isLocalhostWeb
                            ? "Google sign-in is blocked on localhost for this OAuth flow. Use the hosted HTTPS web app instead."
                            : `Sign in with your Google account on this hosted site. Authorized redirect URI: ${googleRedirectUri}`
                          : "Native Google sign-in requires platform-specific OAuth client IDs in Firebase or Google Cloud."}
                    </Text>
                  </View>

                  <Button
                    title="Continue With Google"
                    onPress={handleGoogleLogin}
                    loading={googleLoading}
                    disabled={!googleRequest || isExpoGo || (Platform.OS === "web" && isLocalhostWeb)}
                    testID="login-google-button"
                    style={{ marginTop: spacing.sm }}
                    icon={<Feather name="chrome" size={16} color={colors.white} />}
                  />
                </View>
              ) : null}

              <View style={styles.agentPanel}>
                <Text style={styles.agentPanelTitle}>Are you part of the sales network?</Text>
                <Text style={styles.agentPanelText}>
                  Use the separate agent workspace to manage assigned assets, sub-agents, and customer closures.
                </Text>
                <Button
                  title="Open Agent Dashboard Login"
                  variant="secondary"
                  onPress={() => router.push("/agent-login")}
                  testID="login-agent-link"
                />
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

function formatGoogleLoginError(error: any, redirectUri: string, isLocalhostWeb: boolean) {
  const message = String(error || "");
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("loopback flow has been blocked") || lowerMessage.includes("invalid_request")) {
    return isLocalhostWeb
      ? "Google blocked localhost sign-in for this OAuth flow. Use the hosted HTTPS web app for Google login."
      : `Google rejected this OAuth request. Verify that this exact redirect URI is added in the Google OAuth web client: ${redirectUri}`;
  }
  if (lowerMessage.includes("redirect_uri_mismatch")) {
    return `Google rejected the redirect URI. Add this exact URI to the Google OAuth web client: ${redirectUri}`;
  }
  if (lowerMessage.includes("access blocked")) {
    return "Google blocked this request because the OAuth app configuration is incomplete. Verify the web redirect URI and platform client IDs.";
  }
  return message || "Google sign-in could not be completed.";
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
  const idToken = await getIdToken(credential.user, true);
  return api.firebaseAuth(idToken, phoneNumber, name);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  backgroundWrap: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000", pointerEvents: "none" },
  backgroundMedia: { ...StyleSheet.absoluteFillObject },
  backgroundOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(6, 17, 12, 0.58)" },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, padding: spacing.lg, justifyContent: "center" },
  shell: { width: "100%", maxWidth: 1120, alignSelf: "center", gap: spacing.xl },
  shellWide: { flexDirection: "row", alignItems: "stretch" },
  brandColumn: { gap: spacing.lg },
  brandColumnWide: { flex: 1, justifyContent: "center", paddingRight: spacing.lg },
  formCard: {
    backgroundColor: "rgba(247, 248, 246, 0.96)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  formCardWide: { flex: 1, maxWidth: 520 },
  logoWrap: { alignItems: "flex-start", gap: spacing.sm },
  logo: { width: 220, height: 110 },
  tagline: { ...typography.small, color: "#D7F6DE", fontStyle: "italic", fontWeight: "500" },
  brandCopy: { gap: spacing.sm },
  title: { ...typography.h1, color: colors.white, fontWeight: "700" },
  subtitle: { ...typography.body, color: "rgba(255,255,255,0.84)", lineHeight: 22 },
  securityCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  securityIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(230,244,234,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  securityTitle: { ...typography.body, color: colors.white, fontWeight: "700" },
  securityText: { ...typography.small, color: "rgba(255,255,255,0.82)", marginTop: 2, lineHeight: 18 },
  tabRow: { gap: spacing.sm, paddingBottom: spacing.xs },
  tabPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radii.full,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.stone200,
  },
  tabPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { ...typography.small, color: colors.primaryDeepest, fontWeight: "700" },
  tabTextActive: { color: colors.white },
  formSection: { gap: spacing.md },
  inputBlock: { gap: 6 },
  label: { ...typography.small, color: colors.stone600, fontWeight: "600" },
  inputShell: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.stone200,
    borderRadius: radii.md,
  },
  inputShellWithAdornment: { paddingLeft: spacing.md },
  inputAdornment: { marginRight: spacing.sm },
  input: { flex: 1, paddingHorizontal: spacing.md, paddingVertical: 14, fontSize: 16, color: colors.stone900 },
  inputWithAdornment: { paddingLeft: 0 },
  phonePrefix: { ...typography.body, color: colors.stone900, fontWeight: "700" },
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
  googleInfoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.stone100,
  },
  googleInfoText: { flex: 1, ...typography.small, color: colors.stone600, lineHeight: 18 },
  agentPanel: {
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.stone100,
  },
  agentPanelTitle: { ...typography.body, color: colors.primaryDeepest, fontWeight: "700" },
  agentPanelText: { ...typography.small, color: colors.stone600, lineHeight: 18 },
  otpLabel: { ...typography.small, color: colors.stone600, fontWeight: "600", marginTop: spacing.xs },
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
  resend: { alignItems: "center", marginTop: spacing.xs, padding: spacing.sm },
  resendDisabled: { opacity: 0.55 },
  resendText: { ...typography.body, color: colors.primary, fontWeight: "600" },
  recaptchaHint: { ...typography.small, color: colors.stone600, lineHeight: 18 },
  footer: { ...typography.small, color: colors.stone400, textAlign: "center", marginTop: spacing.md, lineHeight: 18 },
});
