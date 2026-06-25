import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { colors, radii, shadow, spacing, typography } from "@/src/theme";

type SidebarUser = {
  name?: string;
  phone?: string;
  email?: string;
  role?: string;
  kyc_status?: string;
  approval_status?: string;
  is_admin?: boolean;
};

type Props = {
  visible: boolean;
  user: SidebarUser | null;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onSavedProperties: () => void;
  onSiteVisits: () => void;
  onSupport: () => void;
  onLogout: () => Promise<void>;
};

function getInitials(name?: string) {
  return String(name || "Rivan User")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "RU";
}

function getRoleLabel(user: SidebarUser | null) {
  const role = String(user?.role || "").toLowerCase();
  if (user?.is_admin || ["admin", "manager", "super_admin"].includes(role)) return "Admin";
  if (["agent", "sub_agent"].includes(role) && String(user?.approval_status || "").toLowerCase() === "approved") return "Agent";
  return "Customer";
}

export default function ProfileSidebar({
  visible,
  user,
  onClose,
  onRefresh,
  onSavedProperties,
  onSiteVisits,
  onSupport,
  onLogout,
}: Props) {
  const { updateUser } = useAuth();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const isPhone = width < 640;
  const [mounted, setMounted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  function isPlaceholderEmail(value?: string) {
    const normalized = String(value || "").trim().toLowerCase();
    return !normalized || normalized === "pendingagent@rivaan.com" || normalized.endsWith("@rivaan.com");
  }

  useEffect(() => {
    setName(user?.name || "");
    setEmail(isPlaceholderEmail(user?.email) ? "" : String(user?.email || ""));
  }, [user]);

  useEffect(() => {
    if (!visible) {
      setEditing(false);
      setSaving(false);
    }
  }, [visible]);

  const roleLabel = useMemo(() => getRoleLabel(user), [user]);
  const kycVerified = String(user?.kyc_status || "").toLowerCase() === "verified";

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Record<string, any> = { name: name.trim() };
      const trimmedEmail = email.trim();
      if (trimmedEmail && trimmedEmail !== String(user?.email || "").trim()) {
        payload.email = trimmedEmail;
      }
      const updatedUser = await api.updateProfile(payload);
      await updateUser(updatedUser);
      await onRefresh();
      setEditing(false);
    } catch (error: any) {
      Alert.alert("Profile", error?.message || "Unable to save profile details right now.");
    } finally {
      setSaving(false);
    }
  }

  const displayEmail = isPlaceholderEmail(user?.email) ? "Enter your email" : String(user?.email || "");

  const sidebarBody = (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.drawer, isPhone ? styles.drawerPhone : styles.drawerDesktop]}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Account</Text>
            <Text style={styles.title}>Profile</Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Feather name="x" size={18} color={colors.primaryDeepest} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials(user?.name)}</Text>
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroName}>{user?.name || "Rivan User"}</Text>
              <Text style={styles.heroMeta}>{user?.phone || "Phone not available"}</Text>
              <Text style={styles.heroMeta}>{displayEmail}</Text>
              <View style={styles.badgeRow}>
                <View style={[styles.badge, kycVerified ? styles.badgeApproved : styles.badgePending]}>
                  <Text style={[styles.badgeText, kycVerified ? styles.badgeTextApproved : styles.badgeTextPending]}>
                    {kycVerified ? "KYC Verified" : "KYC Pending"}
                  </Text>
                </View>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>{roleLabel}</Text>
                </View>
              </View>
            </View>
          </View>

          {editing ? (
            <View style={styles.editCardInline}>
              <View style={styles.editHeaderRow}>
                <Text style={styles.editTitle}>Edit Profile</Text>
                <TouchableOpacity style={styles.inlineCloseButton} onPress={() => setEditing(false)}>
                  <Feather name="x" size={16} color={colors.primaryDeepest} />
                </TouchableOpacity>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Full name</Text>
                <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="Your name" placeholderTextColor={colors.stone400} />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  style={styles.input}
                  placeholder="Enter your email"
                  placeholderTextColor={colors.stone400}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>
              <View style={[styles.editActions, isPhone && styles.editActionsPhone]}>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => setEditing(false)}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.primaryButton, saving && styles.primaryButtonDisabled]} onPress={handleSave} disabled={saving}>
                  <Text style={styles.primaryButtonText}>{saving ? "Saving..." : "Save"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <View style={styles.menuGroup}>
            <SidebarRow icon="edit-2" label="Edit Profile" onPress={() => setEditing(true)} />
            <SidebarRow icon="heart" label="Saved Properties" onPress={onSavedProperties} />
            <SidebarRow icon="calendar" label="Site Visits" onPress={onSiteVisits} />
            <SidebarRow icon="help-circle" label="Help & Support" onPress={onSupport} />
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
            <Feather name="log-out" size={16} color={colors.danger} />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  );

  if (!mounted) return null;

  return (
    <>
      {isWeb ? (visible ? sidebarBody : null) : <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>{sidebarBody}</Modal>}
    </>
  );
}

function SidebarRow({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.rowIcon}>
        <Feather name={icon} size={16} color={colors.primary} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      <Feather name="chevron-right" size={16} color={colors.stone400} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(6,15,11,0.24)", flexDirection: "row", justifyContent: "flex-end" },
  backdrop: { flex: 1 },
  drawer: { backgroundColor: colors.offWhite, borderLeftWidth: 1, borderLeftColor: colors.borderSoft, ...shadow.lg },
  drawerDesktop: { width: "100%", maxWidth: 420 },
  drawerPhone: { width: "100%" },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", padding: spacing.lg, gap: spacing.md },
  eyebrow: { ...typography.label, color: colors.primary },
  title: { ...typography.h3, color: colors.primaryDeepest, marginTop: 4 },
  closeButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSoft, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  heroCard: { borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSoft, padding: spacing.lg, gap: spacing.md },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.white, fontSize: 22, fontWeight: "800" },
  heroCopy: { gap: 4 },
  heroName: { ...typography.h4, color: colors.primaryDeepest },
  heroMeta: { ...typography.small, color: colors.stone500 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  badge: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.pill },
  badgeApproved: { backgroundColor: colors.approvedBg },
  badgePending: { backgroundColor: colors.pendingBg },
  badgeText: { ...typography.small, fontWeight: "800" },
  badgeTextApproved: { color: colors.approvedText },
  badgeTextPending: { color: colors.pendingText },
  roleBadge: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.surfaceMuted },
  roleBadgeText: { ...typography.small, color: colors.primaryDeepest, fontWeight: "700" },
  menuGroup: { borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  rowIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  rowLabel: { flex: 1, ...typography.body, color: colors.primaryDeepest, fontWeight: "600" },
  logoutButton: { minHeight: 52, borderRadius: 18, borderWidth: 1, borderColor: "#F2C4C4", backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  logoutText: { ...typography.body, color: colors.danger, fontWeight: "700" },
  editCardInline: {
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.lg,
    gap: spacing.md,
  },
  editHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  inlineCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  editTitle: { ...typography.h4, color: colors.primaryDeepest },
  field: { gap: spacing.sm },
  label: { ...typography.small, color: colors.stone500, fontWeight: "700" },
  input: { minHeight: 52, borderRadius: radii.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderSoft, paddingHorizontal: spacing.lg, color: colors.primaryDeepest, fontSize: 15 },
  editActions: { flexDirection: "row", gap: spacing.sm },
  editActionsPhone: { flexDirection: "column" },
  secondaryButton: { flex: 1, minHeight: 50, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  secondaryButtonText: { ...typography.body, color: colors.primaryDeepest, fontWeight: "700" },
  primaryButton: { flex: 1, minHeight: 50, borderRadius: radii.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  primaryButtonDisabled: { opacity: 0.65 },
  primaryButtonText: { ...typography.body, color: colors.white, fontWeight: "800" },
});
