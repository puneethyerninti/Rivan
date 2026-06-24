import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView as SafeAreaProviderView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { colors, radii, shadow, spacing, typography } from "@/src/theme";

type PanelKey = "approvals" | "visits" | "bookings" | "analytics";

function statusLabel(value?: string) {
  const raw = String(value || "pending").replace(/_/g, " ");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export default function AdminScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const normalizedRole = String(user?.role || "").toLowerCase();
  const hasAdminAccess = Boolean(user?.is_admin) || ["admin", "manager", "super_admin"].includes(normalizedRole);

  const [agents, setAgents] = useState<any[]>([]);
  const [visits, setVisits] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelKey>("approvals");

  const pendingAgents = useMemo(
    () => agents.filter((agent) => String(agent.approval_status || "pending").toLowerCase() === "pending"),
    [agents]
  );

  const confirmedVisits = useMemo(
    () => visits.filter((visit) => ["scheduled", "confirmed"].includes(String(visit.status || "").toLowerCase())),
    [visits]
  );

  const openBookings = useMemo(
    () => bookings.filter((booking) => !["closed", "completed", "cancelled"].includes(String(booking.status || "").toLowerCase())),
    [bookings]
  );

  const load = useCallback(async () => {
    try {
      const [overview, bookingPayload, statsPayload] = await Promise.all([
        api.adminOverview(),
        api.adminBookings().catch(() => []),
        api.adminStats().catch(() => null),
      ]);

      setAgents(Array.isArray(overview?.agents) ? overview.agents : []);
      setVisits(Array.isArray(overview?.visits) ? overview.visits : []);
      setBookings(Array.isArray(bookingPayload) ? bookingPayload : []);
      setStats(statsPayload);
    } catch (error: any) {
      Alert.alert("Admin dashboard", error?.message || "Unable to load the admin dashboard.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleApprove(agentId: string) {
    try {
      await api.adminApproveAgent(agentId);
      await load();
    } catch (error: any) {
      Alert.alert("Approval failed", error?.message || "Unable to approve this agent.");
    }
  }

  async function handleReject(agentId: string) {
    try {
      await api.adminUpdateAgentStatus(agentId, "rejected");
      await load();
    } catch (error: any) {
      Alert.alert("Update failed", error?.message || "Unable to reject this application.");
    }
  }

  async function handleVisitStatusChange(visitId: string, nextStatus: "confirmed" | "completed") {
    try {
      await api.agentUpdateSiteVisit(visitId, { status: nextStatus });
      await load();
    } catch (error: any) {
      Alert.alert("Visit update failed", error?.message || "Unable to update visit status.");
    }
  }

  async function handleConfirmBooking(bookingId: string) {
    try {
      await api.adminConfirmBooking(bookingId);
      await load();
    } catch (error: any) {
      Alert.alert("Booking update failed", error?.message || "Unable to confirm the booking.");
    }
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/");
  }

  if (!hasAdminAccess) {
    return (
      <SafeAreaProviderView style={styles.safe}>
        <View style={styles.emptyState}>
          <Feather name="lock" size={44} color={colors.stone400} />
          <Text style={styles.emptyTitle}>Admin access required</Text>
          <Text style={styles.emptyBody}>Sign in with the approved admin account to access this dashboard.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace("/admin-login")}>
            <Text style={styles.primaryButtonText}>Open admin login</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaProviderView>
    );
  }

  if (loading) {
    return (
      <SafeAreaProviderView style={styles.safe}>
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaProviderView>
    );
  }

  return (
    <SafeAreaProviderView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.headerEyebrow}>Admin console</Text>
            <Text style={styles.headerTitle}>Approvals, visits, bookings, and oversight.</Text>
            <Text style={styles.headerBody}>A production-facing review surface built around live records instead of preview data.</Text>
          </View>
          <TouchableOpacity style={styles.ghostButton} onPress={handleSignOut}>
            <Text style={styles.ghostButtonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.metricsRow}>
          <MetricCard label="Pending approvals" value={String(pendingAgents.length)} />
          <MetricCard label="Active visit queue" value={String(confirmedVisits.length)} />
          <MetricCard label="Open bookings" value={String(openBookings.length)} />
          <MetricCard label="Users" value={String(stats?.total_users || stats?.users || 0)} />
        </View>

        <View style={styles.panelTabs}>
          {([
            { key: "approvals", label: "Approvals" },
            { key: "visits", label: "Visits" },
            { key: "bookings", label: "Bookings" },
            { key: "analytics", label: "Analytics" },
          ] as const).map((panel) => (
            <TouchableOpacity
              key={panel.key}
              style={[styles.tabButton, activePanel === panel.key && styles.tabButtonActive]}
              onPress={() => setActivePanel(panel.key)}
            >
              <Text style={[styles.tabButtonText, activePanel === panel.key && styles.tabButtonTextActive]}>{panel.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {activePanel === "approvals" ? (
          <View style={styles.surfaceCard}>
            <Text style={styles.sectionTitle}>Agent approvals</Text>
            <Text style={styles.sectionBody}>Approve access and the same phone number can enter the agent dashboard immediately.</Text>
            {pendingAgents.length ? (
              pendingAgents.map((agent) => (
                <View key={agent.id} style={styles.recordCard}>
                  <View style={styles.recordBody}>
                    <Text style={styles.recordTitle}>{agent.name || "Agent application"}</Text>
                    <Text style={styles.recordMeta}>{agent.phone || "-"}</Text>
                    {agent.email ? <Text style={styles.recordMeta}>{agent.email}</Text> : null}
                    {agent.agent_brand_name ? <Text style={styles.recordMeta}>{agent.agent_brand_name}</Text> : null}
                    {agent.occupation ? <Text style={styles.recordMeta}>{agent.occupation}</Text> : null}
                    {agent.address ? <Text style={styles.recordMeta}>{agent.address}</Text> : null}
                    {agent.application_notes ? <Text style={styles.recordMeta}>{agent.application_notes}</Text> : null}
                    {agent.agent_application_submitted_at ? (
                      <Text style={styles.recordMeta}>Submitted {new Date(agent.agent_application_submitted_at).toLocaleString()}</Text>
                    ) : null}
                  </View>
                  <View style={styles.recordActions}>
                    <TouchableOpacity style={styles.secondaryMiniButton} onPress={() => handleReject(agent.id)}>
                      <Text style={styles.secondaryMiniText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.primaryMiniButton} onPress={() => handleApprove(agent.id)}>
                      <Text style={styles.primaryMiniText}>Approve</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            ) : (
              <EmptyCard text="No pending approvals right now." />
            )}
          </View>
        ) : null}

        {activePanel === "visits" ? (
          <View style={styles.surfaceCard}>
            <Text style={styles.sectionTitle}>Visit management</Text>
            <Text style={styles.sectionBody}>Monitor scheduled and confirmed visits, then update progress in real time.</Text>
            {visits.length ? (
              visits.map((visit) => (
                <View key={visit.id} style={styles.recordCard}>
                  <View style={styles.recordBody}>
                    <Text style={styles.recordTitle}>{visit.customer_name || "Customer visit"}</Text>
                    <Text style={styles.recordMeta}>{visit.property_name || "-"}</Text>
                    <Text style={styles.recordMeta}>
                      {visit.visit_date || "-"}{visit.visit_time ? ` • ${visit.visit_time}` : ""}
                    </Text>
                    <Text style={styles.recordMeta}>{statusLabel(visit.status)}</Text>
                  </View>
                  <View style={styles.recordActions}>
                    {String(visit.status || "").toLowerCase() !== "confirmed" ? (
                      <TouchableOpacity style={styles.secondaryMiniButton} onPress={() => handleVisitStatusChange(visit.id, "confirmed")}>
                        <Text style={styles.secondaryMiniText}>Confirm</Text>
                      </TouchableOpacity>
                    ) : null}
                    {String(visit.status || "").toLowerCase() !== "completed" ? (
                      <TouchableOpacity style={styles.primaryMiniButton} onPress={() => handleVisitStatusChange(visit.id, "completed")}>
                        <Text style={styles.primaryMiniText}>Complete</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              ))
            ) : (
              <EmptyCard text="No visits available right now." />
            )}
          </View>
        ) : null}

        {activePanel === "bookings" ? (
          <View style={styles.surfaceCard}>
            <Text style={styles.sectionTitle}>Booking management</Text>
            <Text style={styles.sectionBody}>Review live customer booking requests and confirm when appropriate.</Text>
            {bookings.length ? (
              bookings.map((booking) => (
                <View key={booking.id} style={styles.recordCard}>
                  <View style={styles.recordBody}>
                    <Text style={styles.recordTitle}>{booking.name || "Customer booking"}</Text>
                    <Text style={styles.recordMeta}>{booking.property_name || "-"}</Text>
                    <Text style={styles.recordMeta}>{booking.plot_number || "-"}</Text>
                    <Text style={styles.recordMeta}>{statusLabel(booking.status)}</Text>
                  </View>
                  <View style={styles.recordActions}>
                    <TouchableOpacity style={styles.primaryMiniButton} onPress={() => handleConfirmBooking(booking.id)}>
                      <Text style={styles.primaryMiniText}>Confirm</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            ) : (
              <EmptyCard text="No bookings available right now." />
            )}
          </View>
        ) : null}

        {activePanel === "analytics" ? (
          <View style={styles.surfaceCard}>
            <Text style={styles.sectionTitle}>Analytics panels</Text>
            <Text style={styles.sectionBody}>High-level platform metrics from live admin endpoints.</Text>
            <View style={styles.analyticsGrid}>
              <MetricCard label="Total bookings" value={String(stats?.total_bookings || 0)} compact />
              <MetricCard label="Total agents" value={String(stats?.total_agents || agents.length)} compact />
              <MetricCard label="Total visits" value={String(stats?.total_visits || visits.length)} compact />
              <MetricCard label="Pending services" value={String(stats?.pending_services || 0)} compact />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaProviderView>
  );
}

function MetricCard({ label, value, compact }: { label: string; value: string; compact?: boolean }) {
  return (
    <View style={[styles.metricCard, compact && styles.metricCardCompact]}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <View style={styles.emptyCard}>
      <Feather name="inbox" size={36} color={colors.stone300} />
      <Text style={styles.emptyCardText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.offWhite },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { ...typography.h3, color: colors.primaryDeepest },
  emptyBody: { ...typography.body, color: colors.stone500, textAlign: "center", maxWidth: 320 },
  primaryButton: {
    minHeight: 52,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { ...typography.body, color: colors.white, fontWeight: "800" },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.lg },
  header: { flexDirection: "row", gap: spacing.lg, alignItems: "flex-start" },
  headerCopy: { flex: 1, gap: spacing.sm },
  headerEyebrow: { ...typography.label, color: colors.primary },
  headerTitle: { ...typography.h2, color: colors.primaryDeepest },
  headerBody: { ...typography.body, color: colors.stone500 },
  ghostButton: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  ghostButtonText: { ...typography.small, fontWeight: "700", color: colors.primaryDeepest },
  metricsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  metricCard: {
    flex: 1,
    minWidth: 150,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.xl,
    ...shadow.sm,
  },
  metricCardCompact: { minWidth: 130 },
  metricValue: { ...typography.h3, color: colors.primaryDeepest },
  metricLabel: { marginTop: spacing.xs, ...typography.small, color: colors.stone500 },
  panelTabs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tabButton: {
    minHeight: 42,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  tabButtonActive: { backgroundColor: colors.primaryDeepest, borderColor: colors.primaryDeepest },
  tabButtonText: { ...typography.small, color: colors.primaryDeepest, fontWeight: "700" },
  tabButtonTextActive: { color: colors.white },
  surfaceCard: {
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.xxl,
    gap: spacing.lg,
    ...shadow.sm,
  },
  sectionTitle: { ...typography.h3, color: colors.primaryDeepest },
  sectionBody: { ...typography.body, color: colors.stone500 },
  recordCard: {
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.lg,
    gap: spacing.md,
  },
  recordBody: { gap: 4 },
  recordTitle: { ...typography.body, color: colors.primaryDeepest, fontWeight: "800" },
  recordMeta: { ...typography.small, color: colors.stone500 },
  recordActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  primaryMiniButton: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryMiniText: { ...typography.small, color: colors.white, fontWeight: "800" },
  secondaryMiniButton: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryMiniText: { ...typography.small, color: colors.primaryDeepest, fontWeight: "700" },
  analyticsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  emptyCard: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceAlt,
  },
  emptyCardText: { marginTop: spacing.md, ...typography.body, color: colors.stone500 },
});
