import React, { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { AuthSplitShell } from "@/src/components/AuthSplitShell";
import { colors, shadow, spacing } from "@/src/theme";
import { blurActiveWebElement } from "@/src/utils/web-focus";

export default function AdminLoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const phoneDigits = useMemo(() => phone.replace(/\D/g, "").slice(-10), [phone]);

  async function handleAdminLogin() {
    setLoading(true);
    setErrorMessage("");
    try {
      if (phoneDigits.length !== 10) throw new Error("Enter the 10-digit admin number.");
      if (!password.trim()) throw new Error("Enter the admin password.");

      const session = await api.adminLogin(`+91${phoneDigits}`, password.trim());
      if (!session.user?.is_admin) throw new Error("This account does not have admin access.");

      await signIn(session.access_token, session.user);
      router.replace("/admin");
    } catch (error: any) {
      setErrorMessage(String(error?.message || "Admin login failed."));
    } finally {
      setLoading(false);
    }
  }

  async function handleSeededAccess() {
    setLoading(true);
    setErrorMessage("");
    try {
      const session = await api.adminDemoAccess();
      await signIn(session.access_token, session.user);
      router.replace("/admin");
    } catch (error: any) {
      setErrorMessage(String(error?.message || "Unable to open the admin dashboard."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <AuthSplitShell
          eyebrow="Rivan Admin Access"
          title="Secure entry for approvals, operations, and oversight."
          body="Use the approved admin mobile number and password to open the real-time approval queue and dashboard."
          points={[
            { icon: "shield", text: "Protected access for approved admin identities only" },
            { icon: "check-square", text: "Open live approval queues and operational review screens" },
            { icon: "bar-chart-2", text: "Continue into the existing admin dashboard without backend changes" },
          ]}
          formEyebrow="Admin login"
        formTitle="Secure access"
        formSubtitle="Live admin authentication connected to the current backend."
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
              <Text style={styles.label}>Admin mobile number</Text>
              <View style={styles.inputShell}>
                <Text style={styles.phonePrefix}>+91</Text>
                <TextInput
                  value={phone}
                  onChangeText={(text) => setPhone(text.replace(/\D/g, ""))}
                  keyboardType="phone-pad"
                  maxLength={10}
                  style={styles.input}
                  placeholder="Enter admin mobile number"
                  placeholderTextColor={colors.stone400}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Admin password</Text>
              <View style={styles.inputShell}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  style={styles.input}
                  placeholder="Enter admin password"
                  placeholderTextColor={colors.stone400}
                />
              </View>
            </View>

            <TouchableOpacity style={[styles.primaryButton, loading && styles.primaryButtonDisabled]} onPress={handleAdminLogin} disabled={loading}>
              <Text style={styles.primaryButtonText}>{loading ? "Opening..." : "Open Admin Dashboard"}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={handleSeededAccess} disabled={loading}>
              <Text style={styles.secondaryButtonText}>Use current seeded admin access</Text>
            </TouchableOpacity>

            <Text style={styles.helperText}>Live seeded admin phone: `9491348973` and current seeded password: `Admin@123`.</Text>
          </View>
        </AuthSplitShell>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
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
    borderRadius: 18,
    paddingHorizontal: spacing.lg,
    minHeight: 82,
  },
  input: { flex: 1, paddingVertical: 14, fontSize: 17, color: colors.primaryDeepest },
  phonePrefix: { color: colors.primaryDeepest, fontSize: 17, fontWeight: "700", marginRight: spacing.sm },
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
  primaryButton: {
    minHeight: 78,
    borderRadius: 39,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
    ...shadow.md,
  },
  primaryButtonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: colors.white, fontSize: 17, fontWeight: "800" },
  secondaryButton: {
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: { color: colors.primaryDeepest, fontSize: 15, fontWeight: "700" },
  helperText: { color: colors.stone500, fontSize: 12, lineHeight: 20 },
});
