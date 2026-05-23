import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { Button } from "@/src/components/Button";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { colors, radii, spacing, typography } from "@/src/theme";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const otpRefs = useRef<(TextInput | null)[]>([]);

  const validPhone = phone.replace(/\D/g, "").length >= 10;
  const validOtp = otp.every((d) => d.length === 1);

  async function handleSendOtp() {
    if (!validPhone) {
      Alert.alert("Invalid phone", "Please enter a valid 10-digit mobile number");
      return;
    }
    setLoading(true);
    try {
      const cleaned = phone.replace(/\D/g, "").slice(-10);
      const res: any = await api.sendOtp(cleaned);
      setDevOtp(res.dev_otp || "123456");
      setStep("otp");
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (!validOtp) {
      Alert.alert("Invalid OTP", "Enter the 6-digit OTP");
      return;
    }
    setLoading(true);
    try {
      const cleaned = phone.replace(/\D/g, "").slice(-10);
      const res = await api.verifyOtp(cleaned, otp.join(""), name || undefined);
      await signIn(res.access_token, res.user);
    } catch (e: any) {
      Alert.alert("Verification failed", e.message || "Invalid OTP");
    } finally {
      setLoading(false);
    }
  }

  function handleOtpChange(idx: number, value: string) {
    const v = value.replace(/\D/g, "").slice(0, 1);
    const next = [...otp];
    next[idx] = v;
    setOtp(next);
    if (v && idx < 5) otpRefs.current[idx + 1]?.focus();
    if (!v && idx > 0) otpRefs.current[idx - 1]?.focus();
  }

  return (
    <SafeAreaView style={styles.safe} testID="login-screen">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.logoWrap}>
            <Image source={require("../assets/images/rivan-logo.png")} style={styles.logo} resizeMode="contain" />
            <Text style={styles.tagline}>Legacy of trust, legacy of wealth</Text>
          </View>

          {step === "phone" ? (
            <View style={styles.form}>
              <Text style={styles.title}>Welcome</Text>
              <Text style={styles.subtitle}>Sign in to discover premium properties</Text>

              <View style={styles.inputBlock}>
                <Text style={styles.label}>Mobile Number</Text>
                <View style={styles.phoneRow}>
                  <View style={styles.countryCode}>
                    <Text style={styles.countryCodeText}>+91</Text>
                  </View>
                  <TextInput
                    testID="login-phone-input"
                    style={styles.phoneInput}
                    placeholder="Enter 10-digit number"
                    placeholderTextColor={colors.stone400}
                    keyboardType="phone-pad"
                    maxLength={10}
                    value={phone}
                    onChangeText={(t) => setPhone(t.replace(/\D/g, ""))}
                  />
                </View>
              </View>

              <View style={styles.inputBlock}>
                <Text style={styles.label}>Your Name (optional)</Text>
                <TextInput
                  testID="login-name-input"
                  style={styles.input}
                  placeholder="e.g. Rajesh Kumar"
                  placeholderTextColor={colors.stone400}
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <Button
                testID="login-send-otp-button"
                title="Send OTP"
                onPress={handleSendOtp}
                loading={loading}
                disabled={!validPhone}
                style={{ marginTop: spacing.md }}
              />

              <View style={styles.hintBox}>
                <Feather name="info" size={14} color={colors.primary} />
                <Text style={styles.hintText}>
                  Try the demo account: <Text style={styles.hintBold}>9999900001</Text> (Rajesh Kumar with active plot, payments & documents)
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.form}>
              <TouchableOpacity onPress={() => setStep("phone")} style={styles.backLink} testID="login-back-button">
                <Feather name="arrow-left" size={16} color={colors.primary} />
                <Text style={styles.backLinkText}>Change number</Text>
              </TouchableOpacity>
              <Text style={styles.title}>Enter OTP</Text>
              <Text style={styles.subtitle}>6-digit code sent to +91 {phone}</Text>

              <View style={styles.otpRow}>
                {otp.map((digit, i) => (
                  <TextInput
                    key={i}
                    ref={(r) => { otpRefs.current[i] = r; }}
                    testID={`login-otp-digit-${i}`}
                    style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
                    keyboardType="number-pad"
                    maxLength={1}
                    value={digit}
                    onChangeText={(t) => handleOtpChange(i, t)}
                    onKeyPress={(e) => {
                      if (e.nativeEvent.key === "Backspace" && !digit && i > 0) {
                        otpRefs.current[i - 1]?.focus();
                      }
                    }}
                  />
                ))}
              </View>

              {devOtp ? (
                <TouchableOpacity
                  testID="login-autofill-otp"
                  style={styles.devOtp}
                  onPress={() => {
                    setOtp(devOtp.split(""));
                  }}
                >
                  <Feather name="zap" size={14} color={colors.accent} />
                  <Text style={styles.devOtpText}>Dev OTP: {devOtp} (tap to autofill)</Text>
                </TouchableOpacity>
              ) : null}

              <Button
                testID="login-verify-button"
                title="Verify & Continue"
                onPress={handleVerify}
                loading={loading}
                disabled={!validOtp}
                style={{ marginTop: spacing.md }}
              />

              <TouchableOpacity onPress={handleSendOtp} style={styles.resend} testID="login-resend-button">
                <Text style={styles.resendText}>Resend OTP</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.footer}>By continuing, you agree to Rivan Reality's Terms & Privacy Policy</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, padding: spacing.lg, justifyContent: "center" },
  logoWrap: { alignItems: "center", marginBottom: spacing.xl },
  logo: { width: 220, height: 110, marginBottom: spacing.sm },
  tagline: { ...typography.small, color: colors.accent, marginTop: 4, fontStyle: "italic", fontWeight: "500" },
  form: { gap: spacing.md },
  title: { ...typography.h1, color: colors.primaryDeepest, fontWeight: "700" },
  subtitle: { ...typography.body, color: colors.stone500, marginBottom: spacing.md },
  inputBlock: { gap: 6 },
  label: { ...typography.small, color: colors.stone600, fontWeight: "600" },
  input: {
    backgroundColor: colors.offWhite,
    borderWidth: 1,
    borderColor: colors.stone200,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.stone900,
  },
  phoneRow: { flexDirection: "row", gap: 8 },
  countryCode: {
    backgroundColor: colors.offWhite,
    borderWidth: 1,
    borderColor: colors.stone200,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
  },
  countryCodeText: { ...typography.bodyLarge, color: colors.stone900, fontWeight: "600" },
  phoneInput: {
    flex: 1,
    backgroundColor: colors.offWhite,
    borderWidth: 1,
    borderColor: colors.stone200,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.stone900,
  },
  hintBox: {
    flexDirection: "row",
    gap: 8,
    padding: spacing.md,
    backgroundColor: colors.accentSoft,
    borderRadius: radii.md,
    alignItems: "flex-start",
    marginTop: spacing.sm,
  },
  hintText: { flex: 1, ...typography.small, color: colors.primaryDark, lineHeight: 18 },
  hintBold: { fontWeight: "700", color: colors.primary },
  otpRow: { flexDirection: "row", justifyContent: "space-between", marginVertical: spacing.md },
  otpBox: {
    width: 48,
    height: 56,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.stone200,
    backgroundColor: colors.offWhite,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
    color: colors.primary,
  },
  otpBoxFilled: { borderColor: colors.primary, backgroundColor: colors.white },
  devOtp: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: spacing.sm,
    backgroundColor: colors.accentSoft,
    borderRadius: radii.md,
  },
  devOtpText: { ...typography.small, color: colors.accentDark, fontWeight: "600" },
  resend: { alignItems: "center", marginTop: spacing.sm, padding: spacing.sm },
  resendText: { ...typography.body, color: colors.primary, fontWeight: "600" },
  backLink: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm },
  backLinkText: { ...typography.body, color: colors.primary, fontWeight: "600" },
  footer: { ...typography.small, color: colors.stone400, textAlign: "center", marginTop: spacing.xl, lineHeight: 18 },
});
