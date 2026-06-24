import React, { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { Button } from "@/src/components/Button";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { colors, radii, shadow, spacing, typography } from "@/src/theme";

export default function AdminLoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= 920;

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const phoneDigits = useMemo(() => phone.replace(/\D/g, "").slice(-10), [phone]);

  async function handleAdminLogin() {
    setLoading(true);
    setErrorMessage("");
    try {
      if (phoneDigits.length !== 10) {
        throw new Error("Enter the 10-digit admin number.");
      }
      if (!password.trim()) {
        throw new Error("Enter the admin password.");
      }

      const session = await api.adminLogin(`+91${phoneDigits}`, password.trim());
      if (!session.user?.is_admin) {
        throw new Error("This account does not have admin access.");
      }

      await signIn(session.access_token, session.user);
      router.replace("/admin");
    } catch (error: any) {
      const message = String(error?.message || "Admin login failed.");
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]} showsVerticalScrollIndicator={false}>
          <View style={[styles.shell, isWide && styles.shellWide]}>
            <View style={styles.hero}>
              <Text style={styles.heroEyebrow}>Admin access</Text>
              <Text style={styles.heroTitle}>Secure entry for approvals, operations, and oversight.</Text>
              <Text style={styles.heroBody}>
                Sign in with the approved admin number to open the review console, approvals queue, visit monitoring, and analytics surfaces.
              </Text>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.cardTitle}>Admin login</Text>
                  <Text style={styles.cardSubtitle}>Production access linked to the live admin identity.</Text>
                </View>
                <TouchableOpacity onPress={() => router.replace("/")}>
                  <Text style={styles.backLink}>Home</Text>
                </TouchableOpacity>
              </View>

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

              <Button title="Open Admin Dashboard" onPress={handleAdminLogin} loading={loading} />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.offWhite },
  scroll: { flexGrow: 1, padding: spacing.xl },
  scrollWide: { justifyContent: "center", paddingVertical: spacing.xxxl },
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
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    minHeight: 56,
  },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, color: colors.primaryDeepest },
  phonePrefix: { ...typography.body, color: colors.primaryDeepest, fontWeight: "700", marginRight: spacing.sm },
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
});
