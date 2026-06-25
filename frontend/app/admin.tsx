import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { colors, radii, shadow, spacing, typography } from "@/src/theme";

type AdminPanel = "visit_queue" | "agent_queue" | "bookings" | "analytics";

function readableStatus(value?: string) {
  const normalized = String(value || "pending").replace(/_/g, " ").trim();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function badgeTone(status?: string) {
  const normalized = String(status || "").toLowerCase();
  if (["confirmed", "approved", "completed"].includes(normalized)) {
    return { bg: colors.approvedBg, text: colors.approvedText };
  }
  if (["cancelled", "rejected"].includes(normalized)) {
    return { bg: colors.rejectedBg, text: colors.rejectedText };
  }
  return { bg: colors.pendingBg, text: colors.pendingText };
}

export default function AdminScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { width } = useWindowDimensions();
  const isPhone = width < 720;
  const isTablet = width >= 720 && width < 1180;
  const normalizedRole = String(user?.role || "").toLowerCase();
  const hasAdminAccess = Boolean(user?.is_admin) || ["admin", "manager", "super_admin"].includes(normalizedRole);

  const [overview, setOverview] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activePanel, setActivePanel] = useState<AdminPanel>("visit_queue");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const agents = useMemo(() => (Array.isArray(overview?.agents) ? overview.agents : []), [overview]);
  const visits = useMemo(() => (Array.isArray(overview?.visits) ? overview.visits : []), [overview]);
  const reminders = useMemo(() => (Array.isArray(overview?.reminders) ? overview.reminders : []), [overview]);
  const pendingVisits = useMemo(
    () => visits.filter((visit: any) => ["pending", "approval requested"].includes(String(visit.status || "").toLowerCase())),
    [visits]
  );
  const liveVisits = useMemo(
    () => visits.filter((visit: any) => ["confirmed", "scheduled", "completed", "cancelled", "rejected"].includes(String(visit.status || "").toLowerCase())),
    [visits]
  );
  const pendingAgents = useMemo(
    () => agents.filter((agent: any) => String(agent.approval_status || "pending").toLowerCase() === "pending"),
    [agents]
  );
  const openBookings = useMemo(
    () => bookings.filter((booking) => !["closed", "completed", "cancelled"].includes(String(booking.status || "").toLowerCase())),
    [bookings]
  );

  const load = useCallback(async () => {
    try {
      setErrorMessage("");
      const [overviewPayload, bookingPayload, statsPayload] = await Promise.all([
        api.adminOverview(),
        api.adminBookings().catch(() => []),
        api.adminStats().catch(() => null),
      ]);
      setOverview(overviewPayload);
      setBookings(Array.isArray(bookingPayload) ? bookingPayload : []);
      setStats(statsPayload);
    } catch (error: any) {
      setErrorMessage(error?.message || "Unable to load the admin console right now.");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setBusyKey(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleVisitStatus(visitId: string, status: "confirmed" | "completed" | "cancelled") {
    try {
      setErrorMessage("");
      setStatusMessage("");
      setBusyKey(`visit:${visitId}:${status}`);
      await api.adminUpdateVisitStatus(visitId, status);
      setStatusMessage(`Visit ${status} successfully.`);
      await load();
    } catch (error: any) {
      setErrorMessage(error?.message || "Unable to update visit status.");
      setBusyKey(null);
    }
  }

  async function handleApproveAgent(agentId: string) {
    try {
      setErrorMessage("");
      setStatusMessage("");
      setBusyKey(`agent:${agentId}:approve`);
      await api.adminApproveAgent(agentId);
      setStatusMessage("Agent approved successfully.");
      await load();
    } catch (error: any) {
      setErrorMessage(error?.message || "Unable to approve this agent.");
      setBusyKey(null);
    }
  }

  async function handleRejectAgent(agentId: string) {
    try {
      setErrorMessage("");
      setStatusMessage("");
      setBusyKey(`agent:${agentId}:reject`);
      await api.adminUpdateAgentStatus(agentId, "rejected");
      setStatusMessage("Agent application rejected.");
      await load();
    } catch (error: any) {
      setErrorMessage(error?.message || "Unable to reject this application.");
      setBusyKey(null);
    }
  }

  async function handleConfirmBooking(bookingId: string) {
    try {
      setErrorMessage("");
      setStatusMessage("");
      setBusyKey(`booking:${bookingId}:confirm`);
      await api.adminConfirmBooking(bookingId);
      setStatusMessage("Booking confirmed successfully.");
      await load();
    } catch (error: any) {
      setErrorMessage(error?.message || "Unable to confirm the booking.");
      setBusyKey(null);
    }
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/");
  }

  if (!hasAdminAccess) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.guardState}>
          <Feather name="shield-off" size={44} color={colors.stone400} />
          <Text style={styles.guardTitle}>Admin access required</Text>
          <Text style={styles.guardBody}>Use the approved admin account to review live visit requests and approvals.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace("/admin-login")}>
            <Text style={styles.primaryButtonText}>Open admin login</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={[styles.content, isPhone && styles.contentPhone]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, isPhone && styles.heroPhone]}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>Operations dashboard</Text>
            <Text style={styles.heroTitle}>Review every live visit request before the customer moves to a confirmed journey.</Text>
            <Text style={styles.heroBody}>
              Visit approvals, agent onboarding, and booking oversight are grouped into one real-time control surface built on live backend records.
            </Text>
          </View>
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Feather name="log-out" size={16} color={colors.primaryDeepest} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.metricGrid, isPhone && styles.metricGridPhone]}>
          <MetricCard label="Visit approvals" value={String(pendingVisits.length)} note="Requests awaiting admin action" />
          <MetricCard label="Live visits" value={String(liveVisits.length)} note="Confirmed or active visit records" />
          <MetricCard label="Agent approvals" value={String(pendingAgents.length)} note="Pending onboarding queue" />
          <MetricCard label="Open bookings" value={String(openBookings.length)} note="Bookings still in progress" />
        </View>

        {statusMessage ? (
          <View style={styles.successBanner}>
            <Feather name="check-circle" size={16} color={colors.approvedText} />
            <Text style={styles.successBannerText}>{statusMessage}</Text>
          </View>
        ) : null}

        {errorMessage ? (
          <View style={styles.errorBanner}>
            <Feather name="alert-circle" size={16} color={colors.rejectedText} />
            <Text style={styles.errorBannerText}>{errorMessage}</Text>
          </View>
        ) : null}

        {reminders.length ? (
          <View style={[styles.remindersGrid, isPhone && styles.remindersGridPhone]}>
            {reminders.map((reminder: any) => (
              <View key={reminder.id} style={styles.reminderCard}>
                <Text style={styles.reminderTitle}>{reminder.title}</Text>
                <Text style={styles.reminderBody}>{reminder.body}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={[styles.panelTabs, isPhone && styles.panelTabsPhone]}>
          {([
            { key: "visit_queue", label: "Visit Queue" },
            { key: "agent_queue", label: "Agent Queue" },
            { key: "bookings", label: "Bookings" },
            { key: "analytics", label: "Analytics" },
          ] as const).map((panel) => (
            <TouchableOpacity
              key={panel.key}
              style={[styles.panelTab, activePanel === panel.key && styles.panelTabActive]}
              onPress={() => setActivePanel(panel.key)}
            >
              <Text style={[styles.panelTabText, activePanel === panel.key && styles.panelTabTextActive]}>{panel.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {activePanel === "visit_queue" ? (
          <View style={styles.surface}>
            <View style={styles.surfaceHeader}>
              <View style={styles.surfaceHeaderCopy}>
                <Text style={styles.surfaceTitle}>Visit approval queue</Text>
                <Text style={styles.surfaceBody}>Every customer visit request lands here first. Confirm to unlock the confirmed state in the customer Visits tab.</Text>
              </View>
            </View>

            {pendingVisits.length ? (
              <View style={[styles.recordGrid, isTablet && styles.recordGridTablet]}>
                {pendingVisits.map((visit: any) => (
                  <View key={visit.id} style={[styles.recordCard, isTablet && styles.recordCardTablet]}>
                    <View style={styles.recordTop}>
                      <Text style={styles.recordTitle}>{visit.customer_name || visit.name || "Visit request"}</Text>
                      <StatusBadge status={visit.status} />
                    </View>
                    <Text style={styles.recordMeta}>{visit.property_name || visit.centre_name || "Selected location"}</Text>
                    <Text style={styles.recordMeta}>{visit.visit_date || "-"}{visit.visit_time ? ` at ${visit.visit_time}` : ""}</Text>
                    <Text style={styles.recordMeta}>{visit.customer_phone || visit.mobile || "-"}</Text>
                    {visit.review_notes ? <Text style={styles.recordMeta}>{visit.review_notes}</Text> : null}
                    <View style={styles.actionRow}>
                      <ActionButton
                        label="Reject"
                        variant="secondary"
                        loading={busyKey === `visit:${visit.id}:cancelled`}
                        onPress={() => handleVisitStatus(visit.id, "cancelled")}
                      />
                      <ActionButton
                        label="Confirm"
                        loading={busyKey === `visit:${visit.id}:confirmed`}
                        onPress={() => handleVisitStatus(visit.id, "confirmed")}
                      />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <EmptyPanel title="No visit approvals waiting" text="New customer visit requests will appear here automatically." />
            )}

            <Text style={styles.subSectionTitle}>Confirmed and completed visits</Text>
            {liveVisits.length ? (
              <View style={[styles.recordGrid, isTablet && styles.recordGridTablet]}>
                {liveVisits.map((visit: any) => (
                  <View key={visit.id} style={[styles.recordCard, isTablet && styles.recordCardTablet]}>
                    <View style={styles.recordTop}>
                      <Text style={styles.recordTitle}>{visit.customer_name || visit.name || "Visit record"}</Text>
                      <StatusBadge status={visit.status} />
                    </View>
                    <Text style={styles.recordMeta}>{visit.property_name || visit.centre_name || "Selected location"}</Text>
                    <Text style={styles.recordMeta}>{visit.visit_date || "-"}{visit.visit_time ? ` at ${visit.visit_time}` : ""}</Text>
                    <Text style={styles.recordMeta}>{visit.customer_phone || visit.mobile || "-"}</Text>
                    {String(visit.status || "").toLowerCase() === "confirmed" ? (
                      <View style={styles.actionRow}>
                        <ActionButton
                          label="Mark Completed"
                          loading={busyKey === `visit:${visit.id}:completed`}
                          onPress={() => handleVisitStatus(visit.id, "completed")}
                        />
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : (
              <EmptyPanel title="No confirmed visits yet" text="Confirmed visits will move here after approval." />
            )}
          </View>
        ) : null}

        {activePanel === "agent_queue" ? (
          <View style={styles.surface}>
            <Text style={styles.surfaceTitle}>Agent approval queue</Text>
            <Text style={styles.surfaceBody}>Approve the phone number here and agent login unlocks immediately for that same user.</Text>
            {pendingAgents.length ? (
              <View style={[styles.recordGrid, isTablet && styles.recordGridTablet]}>
                {pendingAgents.map((agent: any) => (
                  <View key={agent.id} style={[styles.recordCard, isTablet && styles.recordCardTablet]}>
                    <View style={styles.recordTop}>
                      <Text style={styles.recordTitle}>{agent.name || "Agent application"}</Text>
                      <StatusBadge status={agent.approval_status || "pending"} />
                    </View>
                    <Text style={styles.recordMeta}>{agent.phone || "-"}</Text>
                    {agent.email ? <Text style={styles.recordMeta}>{agent.email}</Text> : null}
                    {agent.agent_brand_name ? <Text style={styles.recordMeta}>{agent.agent_brand_name}</Text> : null}
                    {agent.address ? <Text style={styles.recordMeta}>{agent.address}</Text> : null}
                    <View style={styles.actionRow}>
                      <ActionButton
                        label="Reject"
                        variant="secondary"
                        loading={busyKey === `agent:${agent.id}:reject`}
                        onPress={() => handleRejectAgent(agent.id)}
                      />
                      <ActionButton
                        label="Approve"
                        loading={busyKey === `agent:${agent.id}:approve`}
                        onPress={() => handleApproveAgent(agent.id)}
                      />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <EmptyPanel title="No agent approvals waiting" text="The queue is clear right now." />
            )}
          </View>
        ) : null}

        {activePanel === "bookings" ? (
          <View style={styles.surface}>
            <Text style={styles.surfaceTitle}>Booking review</Text>
            <Text style={styles.surfaceBody}>Customer bookings stay here until your operations team confirms them.</Text>
            {bookings.length ? (
              <View style={[styles.recordGrid, isTablet && styles.recordGridTablet]}>
                {bookings.map((booking: any) => (
                  <View key={booking.id} style={[styles.recordCard, isTablet && styles.recordCardTablet]}>
                    <View style={styles.recordTop}>
                      <Text style={styles.recordTitle}>{booking.name || "Booking request"}</Text>
                      <StatusBadge status={booking.status || "pending"} />
                    </View>
                    <Text style={styles.recordMeta}>{booking.property_name || "-"}</Text>
                    <Text style={styles.recordMeta}>{booking.plot_number || booking.plot_id || "-"}</Text>
                    <Text style={styles.recordMeta}>{booking.mobile || "-"}</Text>
                    {!["closed", "completed", "cancelled", "confirmed"].includes(String(booking.status || "").toLowerCase()) ? (
                      <View style={styles.actionRow}>
                        <ActionButton
                          label="Confirm Booking"
                          loading={busyKey === `booking:${booking.id}:confirm`}
                          onPress={() => handleConfirmBooking(booking.id)}
                        />
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : (
              <EmptyPanel title="No booking requests" text="Bookings will appear here once the customer flow reaches reservation stage." />
            )}
          </View>
        ) : null}

        {activePanel === "analytics" ? (
          <View style={styles.surface}>
            <Text style={styles.surfaceTitle}>Live analytics</Text>
            <Text style={styles.surfaceBody}>A compact high-level pulse of the production platform.</Text>
            <View style={[styles.metricGrid, isPhone && styles.metricGridPhone]}>
              <MetricCard label="Users" value={String(stats?.total_users || stats?.users || 0)} note="Registered accounts" compact />
              <MetricCard label="Agents" value={String(stats?.total_agents || agents.length)} note="Agent records" compact />
              <MetricCard label="Visits" value={String(stats?.total_visits || visits.length)} note="All visit records" compact />
              <MetricCard label="Bookings" value={String(stats?.total_bookings || bookings.length)} note="Booking records" compact />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function MetricCard({ label, value, note, compact }: { label: string; value: string; note: string; compact?: boolean }) {
  return (
    <View style={[styles.metricCard, compact && styles.metricCardCompact]}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricNote}>{note}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const tone = badgeTone(status);
  return (
    <View style={[styles.statusBadge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.statusBadgeText, { color: tone.text }]}>{readableStatus(status)}</Text>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  loading,
  variant,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  variant?: "primary" | "secondary";
}) {
  const secondary = variant === "secondary";
  return (
    <TouchableOpacity style={[styles.actionButton, secondary ? styles.actionButtonSecondary : styles.actionButtonPrimary, loading && styles.actionButtonDisabled]} onPress={onPress} disabled={loading}>
      <Text style={[styles.actionButtonText, secondary ? styles.actionButtonTextSecondary : styles.actionButtonTextPrimary]}>
        {loading ? "Working..." : label}
      </Text>
    </TouchableOpacity>
  );
}

function EmptyPanel({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.emptyPanel}>
      <Feather name="inbox" size={34} color={colors.stone300} />
      <Text style={styles.emptyPanelTitle}>{title}</Text>
      <Text style={styles.emptyPanelBody}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.offWhite },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  guardState: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  guardTitle: { ...typography.h3, color: colors.primaryDeepest },
  guardBody: { ...typography.body, color: colors.stone500, textAlign: "center", maxWidth: 340 },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.lg },
  contentPhone: { padding: spacing.md, paddingBottom: spacing.xxl },
  hero: {
    borderRadius: 32,
    padding: spacing.xxl,
    backgroundColor: colors.primaryDeepest,
    gap: spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    ...shadow.lg,
  },
  heroPhone: { padding: spacing.lg, flexDirection: "column" },
  heroCopy: { flex: 1, gap: spacing.sm },
  heroEyebrow: { ...typography.label, color: colors.accent },
  heroTitle: { ...typography.h2, color: colors.white, maxWidth: 820 },
  heroBody: { ...typography.body, color: "rgba(255,255,255,0.76)", maxWidth: 720 },
  signOutButton: {
    minHeight: 46,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  signOutText: { ...typography.small, color: colors.primaryDeepest, fontWeight: "800" },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  metricGridPhone: { flexDirection: "column" },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 18,
    backgroundColor: colors.approvedBg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  successBannerText: { flex: 1, ...typography.small, color: colors.approvedText, fontWeight: "700" },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 18,
    backgroundColor: colors.rejectedBg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  errorBannerText: { flex: 1, ...typography.small, color: colors.rejectedText, fontWeight: "700" },
  metricCard: {
    flex: 1,
    minWidth: 180,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.xl,
    gap: spacing.xs,
    ...shadow.sm,
  },
  metricCardCompact: { minWidth: 150 },
  metricValue: { ...typography.h3, color: colors.primaryDeepest },
  metricLabel: { ...typography.small, color: colors.primaryDeepest, fontWeight: "800" },
  metricNote: { ...typography.small, color: colors.stone500 },
  remindersGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  remindersGridPhone: { flexDirection: "column" },
  reminderCard: {
    flex: 1,
    minWidth: 240,
    borderRadius: 22,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  reminderTitle: { ...typography.body, color: colors.primaryDeepest, fontWeight: "800" },
  reminderBody: { ...typography.small, color: colors.stone500 },
  panelTabs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  panelTabsPhone: { flexDirection: "column" },
  panelTab: {
    minHeight: 42,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  panelTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  panelTabText: { ...typography.small, color: colors.primaryDeepest, fontWeight: "700" },
  panelTabTextActive: { color: colors.white },
  surface: {
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadow.sm,
  },
  surfaceHeader: { gap: spacing.sm },
  surfaceHeaderCopy: { gap: spacing.xs },
  surfaceTitle: { ...typography.h3, color: colors.primaryDeepest },
  surfaceBody: { ...typography.body, color: colors.stone500, maxWidth: 760 },
  subSectionTitle: { ...typography.h4, color: colors.primaryDeepest, marginTop: spacing.sm },
  recordGrid: { gap: spacing.md },
  recordGridTablet: { flexDirection: "row", flexWrap: "wrap" },
  recordCard: {
    borderRadius: 22,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  recordCardTablet: { width: "48%" },
  recordTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm },
  recordTitle: { flex: 1, ...typography.bodyLarge, color: colors.primaryDeepest, fontWeight: "800" },
  recordMeta: { ...typography.small, color: colors.stone500 },
  statusBadge: { alignSelf: "flex-start", paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radii.pill },
  statusBadgeText: { ...typography.small, fontWeight: "800" },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  actionButton: {
    minHeight: 42,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonPrimary: { backgroundColor: colors.primary },
  actionButtonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  actionButtonDisabled: { opacity: 0.65 },
  actionButtonText: { ...typography.small, fontWeight: "800" },
  actionButtonTextPrimary: { color: colors.white },
  actionButtonTextSecondary: { color: colors.primaryDeepest },
  emptyPanel: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.xxl,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceAlt,
  },
  emptyPanelTitle: { ...typography.h4, color: colors.primaryDeepest },
  emptyPanelBody: { ...typography.body, color: colors.stone500, textAlign: "center", maxWidth: 420 },
  primaryButton: {
    minHeight: 52,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { ...typography.body, color: colors.white, fontWeight: "800" },
});
