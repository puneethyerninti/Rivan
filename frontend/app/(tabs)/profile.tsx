import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, TextInput, Modal, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { colors, radii, spacing, typography, shadow } from "@/src/theme";
import { Button } from "@/src/components/Button";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut, refresh } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [address, setAddress] = useState(user?.address || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateProfile({ name, email, address });
      await refresh();
      setEditing(false);
      Alert.alert("Saved", "Profile updated successfully");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    const performSignOut = async () => {
      await signOut();
      router.replace("/login");
    };

    if (Platform.OS === "web" && typeof window !== "undefined") {
      if (window.confirm("Sign out of your Rivan account?")) {
        await performSignOut();
      }
      return;
    }

    Alert.alert("Sign out?", "You'll need to verify OTP to sign in again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: performSignOut,
      },
    ]);
  }

  const initials = (user?.name || "U").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="profile-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.header}>
          <Text style={styles.heading}>Profile</Text>
        </View>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.name}</Text>
            <Text style={styles.profilePhone}>+91 {user?.phone}</Text>
            <View style={styles.kycBadge}>
              <Feather
                name={user?.kyc_status === "verified" ? "check-circle" : "alert-circle"}
                size={11}
                color={user?.kyc_status === "verified" ? colors.success : colors.warning}
              />
              <Text style={[styles.kycText, { color: user?.kyc_status === "verified" ? colors.success : colors.warning }]}>
                KYC {user?.kyc_status === "verified" ? "Verified" : "Pending"}
              </Text>
            </View>
          </View>
          <TouchableOpacity testID="profile-edit-button" style={styles.editBtn} onPress={() => setEditing(true)}>
            <Feather name="edit-2" size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Menu Sections */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Access</Text>
          <View style={styles.menu}>
            <MenuItem icon="heart" label="Saved Properties" testID="profile-wishlist" onPress={() => router.push("/wishlist")} />
            <MenuItem icon="file-text" label="Document Locker" testID="profile-documents" onPress={() => router.push("/documents")} />
            <MenuItem icon="tool" label="Property Services" testID="profile-services" onPress={() => router.push("/services")} />
            <MenuItem icon="bell" label="Notifications" testID="profile-notifications" onPress={() => router.push("/notifications")} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.menu}>
            <MenuItem icon="user" label="Personal Information" testID="profile-info" onPress={() => setEditing(true)} />
            <MenuItem icon="shield" label="KYC Verification" testID="profile-kyc" onPress={() => Alert.alert("KYC", "KYC documents can be uploaded via Document Locker")} />
            <MenuItem icon="settings" label="Notification Settings" testID="profile-settings" onPress={() => Alert.alert("Settings", "All notifications enabled")} />
            {user?.role === "agent" || user?.role === "sub_agent" ? (
              <MenuItem icon="briefcase" label="Agent Dashboard" testID="profile-agent" onPress={() => router.push("/agent")} accent />
            ) : null}
            {user?.is_admin ? (
              <MenuItem icon="grid" label="Admin Dashboard" testID="profile-admin" onPress={() => router.push("/admin")} accent />
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About Rivan</Text>
          <View style={styles.menu}>
            <MenuItem icon="info" label="About Rivan Reality" testID="profile-about" onPress={() => Alert.alert("Rivan Reality LLP", "Legacy of trust, legacy of wealth.\n\nRivan Reality LLP is a premium real estate company committed to building landmark projects and delivering long-term value to our customers.")} />
            <MenuItem icon="message-square" label="Customer Support" testID="profile-support" onPress={() => Alert.alert("Support", "Call: +91 9876543210\nEmail: support@rivanreality.com")} />
            <MenuItem icon="award" label="Testimonials" testID="profile-testimonials" onPress={() => Alert.alert("Customer Love", "Rated 4.8/5 by 1200+ happy customers across Hyderabad.")} />
          </View>
        </View>

        <TouchableOpacity testID="profile-logout-button" style={styles.logoutBtn} onPress={handleLogout}>
          <Feather name="log-out" size={16} color={colors.danger} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>Rivan Reality LLP · Legacy of trust, legacy of wealth</Text>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={editing} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <View style={styles.inputBlock}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput testID="profile-edit-name" style={styles.input} value={name} onChangeText={setName} placeholder="Your name" />
            </View>
            <View style={styles.inputBlock}>
              <Text style={styles.label}>Email</Text>
              <TextInput testID="profile-edit-email" style={styles.input} value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
            </View>
            <View style={styles.inputBlock}>
              <Text style={styles.label}>Address</Text>
              <TextInput testID="profile-edit-address" style={[styles.input, { height: 80 }]} value={address} onChangeText={setAddress} placeholder="Your address" multiline />
            </View>
            <View style={styles.modalActions}>
              <Button title="Cancel" variant="ghost" onPress={() => setEditing(false)} fullWidth={false} style={{ flex: 1 }} testID="profile-edit-cancel" />
              <Button title="Save" onPress={handleSave} loading={saving} fullWidth={false} style={{ flex: 1 }} testID="profile-edit-save" />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function MenuItem({ icon, label, testID, onPress, accent }: { icon: any; label: string; testID: string; onPress: () => void; accent?: boolean }) {
  return (
    <TouchableOpacity testID={testID} style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.menuIcon, accent && { backgroundColor: colors.accentSoft }]}>
        <Feather name={icon} size={16} color={accent ? colors.accent : colors.primary} />
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
      <Feather name="chevron-right" size={16} color={colors.stone400} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.offWhite },
  header: { padding: spacing.lg, paddingBottom: 0 },
  heading: { ...typography.h1, color: colors.primaryDeepest, fontWeight: "700" },
  profileCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, margin: spacing.lg, backgroundColor: colors.white, borderRadius: radii.lg, padding: spacing.md, ...shadow.sm },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.white, fontSize: 22, fontWeight: "700" },
  profileInfo: { flex: 1 },
  profileName: { ...typography.h3, color: colors.primaryDeepest, fontWeight: "700" },
  profilePhone: { ...typography.body, color: colors.stone600, marginTop: 2 },
  kycBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, alignSelf: "flex-start", backgroundColor: colors.offWhite, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.sm },
  kycText: { ...typography.label, fontSize: 9 },
  editBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.offWhite, alignItems: "center", justifyContent: "center" },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.md },
  sectionTitle: { ...typography.label, color: colors.stone500, marginBottom: spacing.sm },
  menu: { backgroundColor: colors.white, borderRadius: radii.md, overflow: "hidden", ...shadow.sm },
  menuItem: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.stone100 },
  menuIcon: { width: 32, height: 32, borderRadius: radii.sm, backgroundColor: colors.offWhite, alignItems: "center", justifyContent: "center" },
  menuLabel: { flex: 1, ...typography.body, color: colors.primaryDeepest, fontWeight: "500" },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, margin: spacing.lg, padding: spacing.md, backgroundColor: colors.white, borderRadius: radii.md, borderWidth: 1, borderColor: "#FEE2E2" },
  logoutText: { ...typography.body, color: colors.danger, fontWeight: "700" },
  footer: { ...typography.small, color: colors.stone400, textAlign: "center", marginBottom: spacing.lg, fontStyle: "italic" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.white, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, padding: spacing.lg, gap: spacing.md },
  modalTitle: { ...typography.h2, color: colors.primaryDeepest, fontWeight: "700" },
  inputBlock: { gap: 6 },
  label: { ...typography.small, color: colors.stone600, fontWeight: "600" },
  input: { backgroundColor: colors.offWhite, borderWidth: 1, borderColor: colors.stone200, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, color: colors.stone900 },
  modalActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
});
