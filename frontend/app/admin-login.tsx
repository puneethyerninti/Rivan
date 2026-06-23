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
    if (phoneDigits.length !== 10) {
      setErrorMessage("Enter the 10-digit admin mobile number.");
      return;
    }
    if (!password.trim()) {
      setErrorMessage("Enter the admin password.");
      return;
    }

    setLoading(true);
    setErrorMessage("");
    try {
      let session;
      try {
        session = await api.adminLogin(`+91${phoneDigits}`, password);
      } catch (error: any) {
        const rawMessage = String(error?.message || "");
        const normalizedMessage = rawMessage.toLowerCase();
        const shouldUseLegacyFallback =
          rawMessage === "Not Found" ||
          rawMessage.includes("HTTP 404") ||
          rawMessage.includes("HTTP 401") ||
          normalizedMessage.includes("invalid admin phone or password");
        if (!shouldUseLegacyFallback) {
          throw error;
        }

        // Older live backends may not expose /auth/admin/login yet, and some
        // live databases only have the legacy email-based admin seeded.
        // Fall back so the admin page remains usable in both cases.
        session = await api.login("admin@rivanreality.com", password);
      }

      if (!session.user?.is_admin) {
        throw new Error("This account does not have admin access.");
      }
      await signIn(session.access_token, session.user);
      router.replace("/admin");
    } catch (error: any) {
      const rawMessage = String(error?.message || "");
      const message = rawMessage || "Admin login failed.";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]}>
          <View style={[styles.shell, isWide && styles.shellWide]}>
            <View style={styles.hero}>
              <View style={styles.heroBadge}>
                <Feather name="shield" size={14} color={colors.white} />
                <Text style={styles.heroBadgeText}>MANAGEMENT ACCESS</Text>
              </View>
              <Text style={styles.heroTitle}>Admin control for approvals, bookings, and live operations.</Text>
              <Text style={styles.heroBody}>
                Use the registered admin mobile number and password to open the management dashboard. From there you can review agent applications, approve access, and monitor live activity.
              </Text>

              <View style={styles.heroStats}>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatValue}>Agents</Text>
                  <Text style={styles.heroStatLabel}>approval queue</Text>
                </View>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatValue}>Bookings</Text>
                  <Text style={styles.heroStatLabel}>confirmation flow</Text>
                </View>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatValue}>CRM</Text>
                  <Text style={styles.heroStatLabel}>pipeline visibility</Text>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View>
                  <Text style={styles.cardTitle}>Admin Sign In</Text>
                  <Text style={styles.cardSubtitle}>Phone number plus password access for Rivan management.</Text>
                </View>
                <TouchableOpacity onPress={() => router.replace("/")}>
                  <Text style={styles.backLink}>Back to Home</Text>
                </TouchableOpacity>
              </View>

              {errorMessage ? (
                <View style={styles.errorBanner}>
                  <Feather name="alert-circle" size={14} color={colors.danger} />
                  <Text style={styles.errorBannerText}>{errorMessage}</Text>
                </View>
              ) : null}

              <View style={styles.inputBlock}>
                <Text style={styles.label}>Admin Mobile Number</Text>
                <View style={styles.inputShell}>
                  <Text style={styles.phonePrefix}>+91</Text>
                  <TextInput
                    value={phone}
                    onChangeText={(value) => setPhone(value.replace(/\D/g, ""))}
                    placeholder="9000000000"
                    placeholderTextColor={colors.stone400}
                    keyboardType="phone-pad"
                    maxLength={10}
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={styles.inputBlock}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter admin password"
                  placeholderTextColor={colors.stone400}
                  secureTextEntry
                  style={styles.passwordInput}
                />
              </View>

              <Button title="Open Admin Dashboard" onPress={handleAdminLogin} loading={loading} />

              <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>Demo credentials for admin access</Text>
                <Text style={styles.infoText}>Mobile: `9000000000`</Text>
                <Text style={styles.infoText}>Password: `Admin@123`</Text>
                <Text style={styles.infoText}>Legacy email fallback: `admin@rivanreality.com`</Text>
                <Text style={styles.infoText}>If your live database has a different admin user, use that real phone number and password instead.</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F6F1E8" },
  scroll: { flexGrow: 1, padding: spacing.lg },
  scrollWide: { justifyContent: "center", paddingVertical: spacing.xl },
  shell: { gap: spacing.lg },
  shellWide: { flexDirection: "row", alignItems: "stretch" },
  hero: {
    flex: 1,
    minHeight: 300,
    borderRadius: radii.xl,
    backgroundColor: "#102F24",
    padding: spacing.xl,
    gap: spacing.md,
    justifyContent: "space-between",
  },
  heroBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: radii.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroBadgeText: { ...typography.label, color: colors.white, fontSize: 10 },
  heroTitle: { ...typography.h1, color: colors.white, fontWeight: "800" },
  heroBody: { ...typography.body, color: "#D8E7DE", lineHeight: 22 },
  heroStats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  heroStat: {
    minWidth: 110,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  heroStatValue: { color: colors.white, fontWeight: "800", fontSize: 18 },
  heroStatLabel: { color: "#D8E7DE", fontSize: 11, fontWeight: "600" },
  card: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: "#EADFCC",
    ...shadow.md,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  cardTitle: { ...typography.h3, color: colors.primaryDeepest, fontWeight: "800" },
  cardSubtitle: { ...typography.body, color: colors.stone600, lineHeight: 21, maxWidth: 520 },
  backLink: { color: colors.primary, fontWeight: "700" },
  inputBlock: { gap: 6 },
  label: { ...typography.small, color: colors.stone600, fontWeight: "700" },
  inputShell: {
    minHeight: 54,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "#E6DED1",
    backgroundColor: "#FCFBF8",
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: spacing.md,
  },
  phonePrefix: { ...typography.body, color: colors.primaryDeepest, fontWeight: "800" },
  input: { flex: 1, paddingHorizontal: spacing.md, color: colors.primaryDeepest, fontSize: 15 },
  passwordInput: {
    minHeight: 54,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "#E6DED1",
    backgroundColor: "#FCFBF8",
    paddingHorizontal: spacing.md,
    color: colors.primaryDeepest,
    fontSize: 15,
  },
  infoBox: {
    gap: 5,
    backgroundColor: "#FBF6EE",
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "#EEDFC6",
  },
  infoTitle: { ...typography.small, color: colors.primaryDeepest, fontWeight: "800" },
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
