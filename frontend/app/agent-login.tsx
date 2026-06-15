import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, Alert, ScrollView, TouchableOpacity, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { Button } from "@/src/components/Button";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { colors, radii, shadow, spacing, typography } from "@/src/theme";

export default function AgentLoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const isHostedWebPreview =
    typeof window !== "undefined" &&
    ["rivan-auth-live.web.app", "rivan-auth-live.firebaseapp.com"].includes(window.location.hostname);
  const [email, setEmail] = useState("agent@rivaan.com");
  const [password, setPassword] = useState("Agent@123");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Missing details", "Enter your agent email and password.");
      return;
    }

    setLoading(true);
    try {
      const session = await api.login(email.trim(), password);
      if (session.user?.role !== "agent" && session.user?.role !== "sub_agent") {
        throw new Error("These credentials do not belong to an agent account.");
      }
      await signIn(session.access_token, session.user);
      router.replace("/agent");
    } catch (error: any) {
      Alert.alert("Agent login failed", error.message || "Unable to sign in.");
    } finally {
      setLoading(false);
    }
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
            <Text style={styles.eyebrow}>Premium field operations</Text>
            <Text style={styles.title}>Rivan Crest Partners</Text>
            <Text style={styles.subtitle}>
              Dedicated dashboard for high-intent real estate sales teams to manage leads, visits, bookings, and sub-agent operations in one premium workflow.
            </Text>

            <View style={styles.heroHighlights}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>Live</Text>
                <Text style={styles.heroStatLabel}>CRM actions</Text>
              </View>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>Fast</Text>
                <Text style={styles.heroStatLabel}>site workflow</Text>
              </View>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>Secure</Text>
                <Text style={styles.heroStatLabel}>agent access</Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.badgeRow}>
              <View style={styles.badge}>
                <Feather name="briefcase" size={14} color={colors.accentDark} />
                <Text style={styles.badgeText}>APPROVED ACCESS</Text>
              </View>
              <TouchableOpacity onPress={() => router.replace("/login")} testID="agent-login-back">
                <Text style={styles.backLink}>Customer Login</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.cardTitle}>Enter Agent Dashboard</Text>
            <Text style={styles.cardSubtitle}>Use your approved workspace credentials to open the premium agent command center.</Text>

            <View style={styles.quickRow}>
              <TouchableOpacity
                style={styles.quickButton}
                onPress={() => {
                  setEmail("agent@rivaan.com");
                  setPassword("Agent@123");
                }}
              >
                <Text style={styles.quickButtonText}>Primary Agent</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickButton}
                onPress={() => {
                  setEmail("subagent@rivaan.com");
                  setPassword("Agent@123");
                }}
              >
                <Text style={styles.quickButtonText}>Sub-Agent</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputBlock}>
              <Text style={styles.label}>Agent Email</Text>
              <TextInput
                testID="agent-login-email"
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                placeholder="agent@rivaan.com"
                placeholderTextColor={colors.stone400}
              />
            </View>

            <View style={styles.inputBlock}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                testID="agent-login-password"
                style={styles.input}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                placeholder="Enter password"
                placeholderTextColor={colors.stone400}
              />
            </View>

            <Button title="Enter Agent Dashboard" onPress={handleLogin} loading={loading} testID="agent-login-submit" />

            {isHostedWebPreview ? (
              <Button
                title="Open Temporary Preview Dashboard"
                variant="secondary"
                onPress={() => router.replace("/agent")}
                testID="agent-login-preview"
              />
            ) : null}

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>Manager approval workflow</Text>
              <Text style={styles.infoText}>Agents can log in only after a manager approves their submitted profile and banking details.</Text>
              <Text style={styles.infoText}>Approved Agent: `agent@rivaan.com` / `Agent@123`</Text>
              <Text style={styles.infoText}>Pending Agent: `pendingagent@rivaan.com` / `Agent@123`</Text>
              <Text style={styles.infoTitle}>Demo active credentials</Text>
              <Text style={styles.infoText}>Primary Agent: `agent@rivaan.com` / `Agent@123`</Text>
              <Text style={styles.infoText}>Sub-Agent: `subagent@rivaan.com` / `Agent@123`</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
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
  input: {
    backgroundColor: "#FCFBF8",
    borderWidth: 1,
    borderColor: "#E6DED1",
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    color: colors.stone900,
    fontSize: 15,
  },
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
});
