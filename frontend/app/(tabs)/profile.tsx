import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Button } from "@/src/components/Button";
import { colors, radii, shadow, spacing, typography } from "@/src/theme";

function ActionRow({
  icon,
  label,
  onPress,
  accent,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  accent?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.menuRow} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.menuIcon, accent && styles.menuIconAccent]}>
        <Feather name={icon} size={16} color={accent ? colors.accentDark : colors.primary} />
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
      <Feather name="chevron-right" size={16} color={colors.stone400} />
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut, refresh } = useAuth();
  const { width } = useWindowDimensions();
  const isPhone = width < 640;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [relationship, setRelationship] = useState<any>(null);
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [address, setAddress] = useState(user?.address || "");

  useEffect(() => {
    api.customerRelationship().then(setRelationship).catch(() => {});
  }, []);

  useEffect(() => {
    setName(user?.name || "");
    setEmail(user?.email || "");
    setAddress(user?.address || "");
  }, [user]);

  const initials = useMemo(() => {
    return (user?.name || "User")
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }, [user?.name]);

  const normalizedRole = String(user?.role || "").toLowerCase();
  const isApprovedAgent = (normalizedRole === "agent" || normalizedRole === "sub_agent") && user?.approval_status === "approved";
  const isApprovedAdmin = Boolean(user?.is_admin) || ["admin", "manager", "super_admin"].includes(normalizedRole);

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateProfile({ name, email, address });
      await refresh();
      setEditing(false);
      Alert.alert("Profile updated", "Your details were saved successfully.");
    } catch (error: any) {
      Alert.alert("Update failed", error?.message || "Unable to save profile changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    const confirmLogout = async () => {
      await signOut();
      router.replace("/");
    };

    if (Platform.OS === "web" && typeof window !== "undefined") {
      if (window.confirm("Sign out of your Rivan account?")) {
        await confirmLogout();
      }
      return;
    }

    Alert.alert("Sign out", "You'll need OTP again to re-enter your account.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: confirmLogout },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.drawerBackdrop}>
        <TouchableOpacity style={styles.backdropPressable} activeOpacity={1} onPress={() => router.back()} />
        <View style={[styles.drawerShell, isPhone ? styles.drawerShellPhone : styles.drawerShellDesktop]}>
          <View style={styles.drawerHeader}>
            <View style={styles.drawerHeaderCopy}>
              <Text style={styles.headerEyebrow}>Account</Text>
              <Text style={styles.headerTitle}>Profile</Text>
              <Text style={styles.headerBody}>A cleaner hub for account details, saved actions, and customer support.</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={() => router.back()} testID="profile-close-button">
              <Feather name="x" size={18} color={colors.primaryDeepest} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={[styles.content, isPhone && styles.contentPhone]} showsVerticalScrollIndicator={false}>
            <View style={[styles.heroCard, isPhone && styles.heroCardPhone]}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <View style={styles.heroCopy}>
                <Text style={styles.heroName}>{user?.name || "Rivan user"}</Text>
                <Text style={styles.heroMeta}>{user?.phone ? `+91 ${user.phone}` : "Phone not available"}</Text>
                <Text style={styles.heroMeta}>{user?.email || "Email not added yet"}</Text>
                <View style={styles.badgeRow}>
                  <View style={[styles.statusBadge, user?.kyc_status === "verified" ? styles.statusBadgeSuccess : styles.statusBadgePending]}>
                    <Text style={[styles.statusBadgeText, user?.kyc_status === "verified" ? styles.statusBadgeTextSuccess : styles.statusBadgeTextPending]}>
                      KYC {user?.kyc_status === "verified" ? "Verified" : "Pending"}
                    </Text>
                  </View>
                  {isApprovedAgent || isApprovedAdmin ? (
                    <View style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText}>{String(user?.role || "").replace(/_/g, " ")}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <TouchableOpacity style={[styles.editButton, isPhone && styles.editButtonPhone]} onPress={() => setEditing(true)} testID="profile-edit-button">
                <Feather name="edit-2" size={16} color={colors.primaryDeepest} />
              </TouchableOpacity>
            </View>

            {(relationship?.assigned_agent || relationship?.assigned_sub_agent || relationship?.primary_link) && (
              <View style={styles.surfaceCard}>
                <Text style={styles.sectionEyebrow}>Relationship owner</Text>
                <Text style={styles.sectionTitle}>
                  {relationship?.assigned_sub_agent?.name || relationship?.assigned_agent?.name || "Rivan advisor"}
                </Text>
                <Text style={styles.sectionBody}>
                  {relationship?.assigned_sub_agent ? "Sub-agent support" : "Primary relationship support"}
                </Text>
                {relationship?.open_tasks?.[0]?.title ? (
                  <View style={styles.inlineNotice}>
                    <Feather name="clock" size={14} color={colors.primary} />
                    <Text style={styles.inlineNoticeText}>Next step: {relationship.open_tasks[0].title}</Text>
                  </View>
                ) : null}
              </View>
            )}

            <View style={styles.surfaceCard}>
              <Text style={styles.sectionEyebrow}>Shortcuts</Text>
              <Text style={styles.sectionTitle}>Everything important, grouped clearly</Text>
              <View style={styles.menuGroup}>
                <ActionRow icon="heart" label="Saved Properties" onPress={() => router.push("/wishlist")} />
                <ActionRow icon="file-text" label="Document Locker" onPress={() => router.push("/documents")} />
                <ActionRow icon="tool" label="Property Services" onPress={() => router.push("/services")} />
                <ActionRow icon="bell" label="Notifications" onPress={() => router.push("/notifications")} />
              </View>
            </View>

            <View style={styles.surfaceCard}>
              <Text style={styles.sectionEyebrow}>Account actions</Text>
              <Text style={styles.sectionTitle}>Manage your account</Text>
              <View style={styles.menuGroup}>
                <ActionRow icon="user" label="Personal Information" onPress={() => setEditing(true)} />
                <ActionRow icon="shield" label="KYC Verification" onPress={() => Alert.alert("KYC", "KYC documents can be managed from the Document Locker.")} />
                <ActionRow icon="settings" label="Notification Settings" onPress={() => Alert.alert("Settings", "Notification preferences are currently enabled by default.")} />
                {isApprovedAgent ? (
                  <ActionRow icon="briefcase" label="Agent Dashboard" onPress={() => router.push("/agent" as never)} accent />
                ) : null}
                {isApprovedAdmin ? <ActionRow icon="grid" label="Admin Dashboard" onPress={() => router.push("/admin")} accent /> : null}
              </View>
            </View>

            <View style={styles.surfaceCard}>
              <Text style={styles.sectionEyebrow}>Support</Text>
              <Text style={styles.sectionTitle}>Rivan account help</Text>
              <View style={styles.menuGroup}>
                <ActionRow icon="info" label="About Rivan Reality" onPress={() => Alert.alert("Rivan Reality LLP", "Legacy of trust, legacy of wealth.")} />
                <ActionRow icon="message-square" label="Customer Support" onPress={() => Alert.alert("Support", "Call: +91 9876543210\nEmail: support@rivanreality.com")} />
                <ActionRow icon="award" label="Testimonials" onPress={() => Alert.alert("Customer Love", "Rated highly by property buyers across premium Rivan projects.")} />
              </View>
            </View>

            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} testID="profile-logout-button">
              <Feather name="log-out" size={16} color={colors.danger} />
              <Text style={styles.logoutText}>Sign Out</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>

      <Modal visible={editing} animationType="slide" transparent onRequestClose={() => setEditing(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, isPhone && styles.modalCardPhone]}>
            <Text style={styles.modalTitle}>Edit profile</Text>

            <Field label="Full name">
              <TextInput testID="profile-edit-name" style={styles.input} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={colors.stone400} />
            </Field>

            <Field label="Email">
              <TextInput
                testID="profile-edit-email"
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.stone400}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </Field>

            <Field label="Address">
              <TextInput
                testID="profile-edit-address"
                style={[styles.input, styles.textarea]}
                value={address}
                onChangeText={setAddress}
                placeholder="Your address"
                placeholderTextColor={colors.stone400}
                multiline
                textAlignVertical="top"
              />
            </Field>

            <View style={[styles.modalActions, isPhone && styles.modalActionsPhone]}>
              <Button title="Cancel" variant="ghost" onPress={() => setEditing(false)} fullWidth={false} style={{ flex: 1 }} testID="profile-edit-cancel" />
              <Button title="Save" onPress={handleSave} loading={saving} fullWidth={false} style={{ flex: 1 }} testID="profile-edit-save" />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.offWhite },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(6,15,11,0.18)",
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  backdropPressable: { flex: 1 },
  drawerShell: {
    backgroundColor: colors.offWhite,
    borderLeftWidth: 1,
    borderLeftColor: colors.borderSoft,
    ...shadow.lg,
  },
  drawerShellDesktop: {
    width: "100%",
    maxWidth: 760,
  },
  drawerShellPhone: {
    width: "100%",
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  drawerHeaderCopy: { flex: 1, gap: spacing.sm },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.lg },
  contentPhone: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl },
  headerEyebrow: { ...typography.label, color: colors.primary },
  headerTitle: { ...typography.h1, color: colors.primaryDeepest },
  headerBody: { ...typography.body, color: colors.stone500, maxWidth: 620 },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    borderRadius: 30,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.xxl,
    ...shadow.sm,
  },
  heroCardPhone: {
    flexDirection: "column",
    alignItems: "flex-start",
    padding: spacing.lg,
    borderRadius: 22,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.white, fontSize: 24, fontWeight: "800" },
  heroCopy: { flex: 1, gap: 4 },
  heroName: { ...typography.h3, color: colors.primaryDeepest },
  heroMeta: { ...typography.body, color: colors.stone500 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  statusBadge: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.pill },
  statusBadgeSuccess: { backgroundColor: colors.approvedBg },
  statusBadgePending: { backgroundColor: colors.pendingBg },
  statusBadgeText: { ...typography.small, fontWeight: "800" },
  statusBadgeTextSuccess: { color: colors.approvedText },
  statusBadgeTextPending: { color: colors.pendingText },
  roleBadge: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.surfaceMuted },
  roleBadgeText: { ...typography.small, fontWeight: "700", color: colors.primaryDeepest, textTransform: "capitalize" },
  editButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  editButtonPhone: {
    alignSelf: "flex-end",
  },
  surfaceCard: {
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.xxl,
    ...shadow.sm,
  },
  sectionEyebrow: { ...typography.label, color: colors.primary },
  sectionTitle: { marginTop: spacing.sm, ...typography.h4, color: colors.primaryDeepest },
  sectionBody: { marginTop: spacing.sm, ...typography.body, color: colors.stone500 },
  menuGroup: { marginTop: spacing.lg, overflow: "hidden", borderRadius: radii.lg, borderWidth: 1, borderColor: colors.borderSoft },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  menuIconAccent: { backgroundColor: colors.accentSoft },
  menuLabel: { flex: 1, ...typography.body, color: colors.primaryDeepest, fontWeight: "600" },
  inlineNotice: {
    marginTop: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
    padding: spacing.lg,
  },
  inlineNoticeText: { flex: 1, ...typography.small, color: colors.primaryDeepest },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 56,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "#F2C4C4",
  },
  logoutText: { ...typography.body, color: colors.danger, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.38)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  modalCardPhone: {
    padding: spacing.lg,
  },
  modalTitle: { ...typography.h3, color: colors.primaryDeepest },
  field: { gap: spacing.sm },
  fieldLabel: { ...typography.small, color: colors.stone500, fontWeight: "700" },
  input: {
    minHeight: 54,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    color: colors.primaryDeepest,
    fontSize: 15,
  },
  textarea: { minHeight: 96, paddingTop: spacing.lg },
  modalActions: { flexDirection: "row", gap: spacing.sm },
  modalActionsPhone: { flexDirection: "column" },
});
