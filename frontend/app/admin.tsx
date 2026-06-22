import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { colors, radii, spacing, typography, shadow } from "@/src/theme";

type Tab = "stats" | "bookings" | "services" | "users" | "agents" | "leads" | "pipeline" | "tasks" | "reports";

export default function AdminScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("stats");
  const [stats, setStats] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [crm, setCrm] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const pendingAgents = useMemo(() => agents.filter((agent) => agent.approval_status !== "approved"), [agents]);
  const approvedAgents = useMemo(() => agents.filter((agent) => agent.approval_status === "approved"), [agents]);

  const load = useCallback(async () => {
    try {
      const [s, b, sr, u, a, crmDashboard] = await Promise.all([
        api.adminStats().catch(() => null),
        api.adminBookings().catch(() => []),
        api.adminServices().catch(() => []),
        api.adminUsers().catch(() => []),
        api.adminAgents().catch(() => []),
        api.crmAdminDashboard().catch(() => null),
      ]);
      setStats(s);
      setBookings(b as any[]);
      setServices(sr as any[]);
      setUsers(u as any[]);
      setAgents(a as any[]);
      setCrm(crmDashboard);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => {
      load();
    }, 15000);
    return () => clearInterval(timer);
  }, [load]);

  async function confirmBooking(id: string) {
    Alert.alert("Confirm Booking", "This will assign the plot to the customer and mark it as booked.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Confirm",
        onPress: async () => {
          try {
            await api.adminConfirmBooking(id);
            Alert.alert("Confirmed", "Booking confirmed and plot assigned.");
            await load();
          } catch (e: any) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);
  }

  async function updateService(id: string, newStatus: string) {
    try {
      await api.adminUpdateService(id, newStatus);
      await load();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  }

  async function approveAgent(id: string) {
    try {
      await api.adminApproveAgent(id);
      Alert.alert("Approved", "Agent access has been activated.");
      await load();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  }

  async function updateAgentStatus(id: string, approvalStatus: string, successTitle: string, successMessage: string) {
    try {
      await api.adminUpdateAgentStatus(id, approvalStatus);
      Alert.alert(successTitle, successMessage);
      await load();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  }

  if (!user?.is_admin) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.empty}>
          <Feather name="lock" size={48} color={colors.stone400} />
          <Text style={styles.emptyTitle}>Admin Access Required</Text>
          <Text style={styles.emptyText}>This dashboard is for Rivan Reality staff only.</Text>
          <Text style={styles.emptyText}>Open /admin-login and sign in with the registered admin mobile number and password.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="admin-screen">
      <View style={styles.header}>
        <TouchableOpacity testID="admin-back" style={styles.headerBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color={colors.primaryDeepest} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Admin Dashboard</Text>
          <Text style={styles.headerSub}>Rivan Reality Operations</Text>
        </View>
        <View style={styles.adminBadge}>
          <Feather name="shield" size={12} color={colors.accent} />
          <Text style={styles.adminBadgeText}>ADMIN</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarInner}>
        {(["stats", "bookings", "services", "users", "agents", "leads", "pipeline", "tasks", "reports"] as Tab[]).map((t) => (
          <TouchableOpacity key={t} testID={`admin-tab-${t}`} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === "stats"
                ? "Overview"
                : t === "bookings"
                  ? `Bookings (${bookings.length})`
                  : t === "services"
                    ? `Services (${services.length})`
                    : t === "users"
                      ? `Users (${users.length})`
                      : t === "agents"
                        ? `Agents (${agents.length})`
                        : t === "leads"
                          ? `Leads (${crm?.leads?.length || 0})`
                          : t === "pipeline"
                            ? `Pipeline (${crm?.opportunities?.length || 0})`
                            : t === "tasks"
                              ? `Tasks (${crm?.tasks?.length || 0})`
                              : "Reports"}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {tab === "stats" && stats ? (
          <View style={styles.statsGrid}>
            <StatCard icon="users" label="Customers" value={stats.users} color={colors.primary} />
            <StatCard icon="home" label="Properties" value={stats.properties} color={colors.accent} />
            <StatCard icon="grid" label="Total Plots" value={stats.plots} color={colors.info} />
            <StatCard icon="check-circle" label="Sold" value={stats.plots_sold} color={colors.sold} />
            <StatCard icon="bookmark" label="Booked" value={stats.plots_booked} color={colors.booked} />
            <StatCard icon="clock" label="Reserved" value={stats.plots_reserved} color={colors.reserved} />
            <StatCard icon="circle" label="Available" value={stats.plots_available} color={colors.available} />
            <StatCard icon="file-text" label="Bookings" value={stats.bookings} color={colors.primary} />
            <StatCard icon="tool" label="Service Reqs" value={stats.service_requests} color={colors.accent} />
            <StatCard icon="calendar" label="Visits" value={stats.visits} color={colors.info} />
          </View>
        ) : null}

        {tab === "bookings" ? (
          <View style={{ gap: spacing.sm }}>
            {bookings.length === 0 ? <EmptyState text="No bookings yet" /> : bookings.map((b) => (
              <View key={b.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.cardTitle}>{b.name}</Text>
                    <Text style={styles.cardSub}>+91 {b.mobile}</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: b.status === "confirmed" ? "#E6F4EA" : "#FEF3C7" }]}>
                    <Text style={[styles.statusText, { color: b.status === "confirmed" ? colors.success : "#D97706" }]}>
                      {b.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardMeta}>Plot: {b.plot_id} | {b.created_at?.slice(0, 10)}</Text>
                {b.message ? <Text style={styles.cardMessage}>"{b.message}"</Text> : null}
                {b.status === "pending" ? (
                  <TouchableOpacity testID={`admin-confirm-${b.id}`} style={styles.confirmBtn} onPress={() => confirmBooking(b.id)}>
                    <Feather name="check" size={14} color={colors.white} />
                    <Text style={styles.confirmBtnText}>Confirm and Assign</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {tab === "services" ? (
          <View style={{ gap: spacing.sm }}>
            {services.length === 0 ? <EmptyState text="No service requests yet" /> : services.map((s) => (
              <View key={s.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{s.service_type}</Text>
                    <Text style={styles.cardSub}>{s.contact} | {s.preferred_date}</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: getSvcBg(s.status) }]}>
                    <Text style={[styles.statusText, { color: getSvcColor(s.status) }]}>{s.status.replace("_", " ").toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.cardMessage}>{s.description}</Text>
                <View style={styles.statusBtns}>
                  {s.status !== "in_progress" && s.status !== "completed" ? (
                    <TouchableOpacity testID={`admin-svc-progress-${s.id}`} style={[styles.smallBtn, { backgroundColor: "#FEF3C7" }]} onPress={() => updateService(s.id, "in_progress")}>
                      <Text style={[styles.smallBtnText, { color: "#D97706" }]}>Start</Text>
                    </TouchableOpacity>
                  ) : null}
                  {s.status !== "completed" ? (
                    <TouchableOpacity testID={`admin-svc-complete-${s.id}`} style={[styles.smallBtn, { backgroundColor: "#E6F4EA" }]} onPress={() => updateService(s.id, "completed")}>
                      <Text style={[styles.smallBtnText, { color: colors.success }]}>Complete</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {tab === "users" ? (
          <View style={{ gap: spacing.sm }}>
            {users.map((u) => (
              <View key={u.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.userAvatar}>
                    <Text style={styles.userAvatarText}>{(u.name || "U")[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{u.name}</Text>
                    <Text style={styles.cardSub}>+91 {u.phone} | {u.kyc_status}</Text>
                  </View>
                  {u.is_admin ? (
                    <View style={styles.adminPill}>
                      <Text style={styles.adminPillText}>ADMIN</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {tab === "agents" ? (
          <View style={{ gap: spacing.sm }}>
            <View style={styles.agentQueueHeader}>
              <View style={styles.agentQueueMetric}>
                <Text style={styles.agentQueueValue}>{pendingAgents.length}</Text>
                <Text style={styles.agentQueueLabel}>Pending Review</Text>
              </View>
              <View style={styles.agentQueueMetric}>
                <Text style={styles.agentQueueValue}>{approvedAgents.length}</Text>
                <Text style={styles.agentQueueLabel}>Approved</Text>
              </View>
              <View style={styles.agentQueueMetric}>
                <Text style={styles.agentQueueValue}>{agents.length}</Text>
                <Text style={styles.agentQueueLabel}>Total Agents</Text>
              </View>
            </View>

            {agents.length === 0 ? <EmptyState text="No agents available" /> : null}

            {pendingAgents.length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={styles.sectionTitle}>Approval Queue</Text>
                {pendingAgents.map((agent) => (
                  <View key={agent.id} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <View style={[styles.userAvatar, { backgroundColor: getApprovalAccent(agent.approval_status) }]}>
                        <Text style={styles.userAvatarText}>{(agent.name || "A")[0]?.toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>{agent.name}</Text>
                        <Text style={styles.cardSub}>{agent.email || agent.phone}</Text>
                        <Text style={styles.cardMeta}>{agent.role === "sub_agent" ? "Sub-Agent" : "Agent"} | Manager: {agent.manager_name || "Rivan Admin"}</Text>
                        {agent.agent_brand_name ? <Text style={styles.cardMeta}>Brand: {agent.agent_brand_name}</Text> : null}
                        {agent.occupation ? <Text style={styles.cardMeta}>Occupation: {agent.occupation}</Text> : null}
                      </View>
                      <View style={[styles.statusPill, { backgroundColor: getApprovalBg(agent.approval_status) }]}>
                        <Text style={[styles.statusText, { color: getApprovalText(agent.approval_status) }]}>
                          {String(agent.approval_status || "pending").toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.cardMeta}>Aadhaar: {agent.aadhaar_number || "-"} | Bank: {agent.bank_details || "-"}</Text>
                    {agent.address ? <Text style={styles.cardMeta}>Address: {agent.address}</Text> : null}
                    {agent.application_notes ? <Text style={styles.cardMessage}>Application note: {agent.application_notes}</Text> : null}
                    {agent.review_notes ? <Text style={styles.cardMeta}>Last review note: {agent.review_notes}</Text> : null}
                    <View style={styles.statusBtns}>
                      <TouchableOpacity testID={`admin-approve-agent-${agent.id}`} style={styles.confirmBtn} onPress={() => approveAgent(agent.id)}>
                        <Feather name="check-circle" size={14} color={colors.white} />
                        <Text style={styles.confirmBtnText}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.smallBtn, styles.rejectBtn]} onPress={() => updateAgentStatus(agent.id, "rejected", "Rejected", "The agent application has been rejected.")}>
                        <Text style={[styles.smallBtnText, { color: colors.danger }]}>Reject</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.smallBtn, styles.suspendBtn]} onPress={() => updateAgentStatus(agent.id, "suspended", "Suspended", "The agent account has been suspended.")}>
                        <Text style={[styles.smallBtnText, { color: "#92400E" }]}>Suspend</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {approvedAgents.length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={styles.sectionTitle}>Approved Agents</Text>
                {approvedAgents.map((agent) => (
                  <View key={agent.id} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <View style={[styles.userAvatar, { backgroundColor: colors.primary }]}>
                        <Text style={styles.userAvatarText}>{(agent.name || "A")[0]?.toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>{agent.name}</Text>
                        <Text style={styles.cardSub}>{agent.email || agent.phone}</Text>
                        <Text style={styles.cardMeta}>{agent.role === "sub_agent" ? "Sub-Agent" : "Agent"} | Manager: {agent.manager_name || "Rivan Admin"}</Text>
                        <Text style={styles.cardMeta}>Approved by: {agent.approved_by_manager || "Manager"}</Text>
                        {agent.occupation ? <Text style={styles.cardMeta}>Occupation: {agent.occupation}</Text> : null}
                      </View>
                      <View style={[styles.statusPill, { backgroundColor: "#E6F4EA" }]}>
                        <Text style={[styles.statusText, { color: colors.success }]}>APPROVED</Text>
                      </View>
                    </View>
                    <Text style={styles.cardMeta}>Aadhaar: {agent.aadhaar_number || "-"} | Bank: {agent.bank_details || "-"}</Text>
                    <View style={styles.statusBtns}>
                      <TouchableOpacity style={[styles.smallBtn, styles.suspendBtn]} onPress={() => updateAgentStatus(agent.id, "suspended", "Suspended", "The agent account has been suspended.")}>
                        <Text style={[styles.smallBtnText, { color: "#92400E" }]}>Suspend Access</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {tab === "leads" ? (
          <View style={{ gap: spacing.sm }}>
            {(crm?.leads || []).length === 0 ? <EmptyState text="No CRM leads yet" /> : (crm?.leads || []).map((lead: any) => (
              <View key={lead.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{lead.name}</Text>
                    <Text style={styles.cardSub}>{lead.phone || lead.email || "No contact"} | {lead.source || "manual"}</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: "#E0E7FF" }]}>
                    <Text style={[styles.statusText, { color: colors.info }]}>{String(lead.status || "new").toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.cardMeta}>Assigned Agent: {lead.assigned_agent_id || "Unassigned"}</Text>
                {lead.notes_summary ? <Text style={styles.cardMessage}>{lead.notes_summary}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        {tab === "pipeline" ? (
          <View style={{ gap: spacing.sm }}>
            {(crm?.opportunities || []).length === 0 ? <EmptyState text="No CRM opportunities yet" /> : (crm?.opportunities || []).map((item: any) => (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.property_id}</Text>
                    <Text style={styles.cardSub}>Lead: {item.lead_id} | Agent: {item.assigned_agent_id || "Unassigned"}</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: "#E6F4EA" }]}>
                    <Text style={[styles.statusText, { color: colors.success }]}>{String(item.stage || "new").toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.cardMeta}>Expected Value: {item.expected_value ? `Rs ${Number(item.expected_value).toLocaleString("en-IN")}` : "TBD"}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {tab === "tasks" ? (
          <View style={{ gap: spacing.sm }}>
            {(crm?.tasks || []).length === 0 ? <EmptyState text="No CRM tasks yet" /> : (crm?.tasks || []).map((task: any) => (
              <View key={task.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{task.title}</Text>
                    <Text style={styles.cardSub}>{task.task_type} | {task.assigned_to_user_id}</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: task.status === "completed" ? "#E6F4EA" : "#FEF3C7" }]}>
                    <Text style={[styles.statusText, { color: task.status === "completed" ? colors.success : "#D97706" }]}>{String(task.status || "open").toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.cardMeta}>Due: {task.due_at ? task.due_at.slice(0, 10) : "Not set"}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {tab === "reports" ? (
          <View style={{ gap: spacing.sm }}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Stage Counts</Text>
              {Object.entries(crm?.stage_counts || {}).map(([stage, count]: any) => (
                <Text key={stage} style={styles.cardMeta}>{stage}: {String(count)}</Text>
              ))}
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Opportunities By Agent</Text>
              {Object.entries(crm?.reports?.by_agent || {}).map(([agentId, count]: any) => (
                <Text key={agentId} style={styles.cardMeta}>{agentId}: {String(count)}</Text>
              ))}
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Lost Reasons</Text>
              {Object.entries(crm?.reports?.lost_reasons || {}).length === 0 ? (
                <Text style={styles.cardMeta}>No lost opportunities yet.</Text>
              ) : Object.entries(crm?.reports?.lost_reasons || {}).map(([reason, count]: any) => (
                <Text key={reason} style={styles.cardMeta}>{reason}: {String(count)}</Text>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: `${color}15` }]}>
        <Feather name={icon} size={18} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={{ padding: 40, alignItems: "center" }}>
      <Feather name="inbox" size={48} color={colors.stone300} />
      <Text style={{ ...typography.body, color: colors.stone500, marginTop: 8 }}>{text}</Text>
    </View>
  );
}

function getSvcBg(s: string) {
  return s === "completed" ? "#E6F4EA" : s === "in_progress" ? "#FEF3C7" : "#E0E7FF";
}

function getSvcColor(s: string) {
  return s === "completed" ? colors.success : s === "in_progress" ? "#D97706" : colors.info;
}

function getApprovalBg(status?: string) {
  const value = String(status || "pending").toLowerCase();
  if (value === "approved") return "#E6F4EA";
  if (value === "rejected") return "#FEECEC";
  if (value === "suspended") return "#FFF2E2";
  return "#FEF3C7";
}

function getApprovalText(status?: string) {
  const value = String(status || "pending").toLowerCase();
  if (value === "approved") return colors.success;
  if (value === "rejected") return colors.danger;
  if (value === "suspended") return "#92400E";
  return "#D97706";
}

function getApprovalAccent(status?: string) {
  const value = String(status || "pending").toLowerCase();
  if (value === "approved") return colors.primary;
  if (value === "rejected") return colors.danger;
  if (value === "suspended") return "#C27C2C";
  return colors.accent;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.offWhite },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.stone100,
  },
  headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.offWhite, alignItems: "center", justifyContent: "center" },
  headerTitle: { ...typography.h3, color: colors.primaryDeepest, fontWeight: "700" },
  headerSub: { ...typography.small, color: colors.stone500 },
  adminBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.accentSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.sm },
  adminBadgeText: { color: colors.accentDark, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  tabBar: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.stone100, maxHeight: 50 },
  tabBarInner: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  tab: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radii.full, backgroundColor: colors.offWhite },
  tabActive: { backgroundColor: colors.primary },
  tabText: { ...typography.small, color: colors.stone700, fontWeight: "600" },
  tabTextActive: { color: colors.white },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  statCard: { width: "31%", backgroundColor: colors.white, padding: spacing.md, borderRadius: radii.md, gap: 6, ...shadow.sm },
  statIcon: { width: 32, height: 32, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" },
  statValue: { ...typography.h2, color: colors.primaryDeepest, fontWeight: "700" },
  statLabel: { ...typography.small, color: colors.stone500, fontWeight: "600" },
  card: { backgroundColor: colors.white, padding: spacing.md, borderRadius: radii.md, gap: 6, ...shadow.sm },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cardTitle: { ...typography.body, color: colors.primaryDeepest, fontWeight: "700" },
  cardSub: { ...typography.small, color: colors.stone500, marginTop: 2 },
  cardMeta: { ...typography.small, color: colors.stone500, marginTop: 2 },
  cardMessage: { ...typography.small, color: colors.stone600, fontStyle: "italic", marginTop: 4 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.sm },
  statusText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    marginTop: spacing.sm,
  },
  confirmBtnText: { ...typography.small, color: colors.white, fontWeight: "700" },
  statusBtns: { flexDirection: "row", gap: 8, marginTop: 6, flexWrap: "wrap" },
  smallBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: radii.sm },
  smallBtnText: { ...typography.label, fontSize: 10 },
  rejectBtn: { backgroundColor: "#FEECEC" },
  suspendBtn: { backgroundColor: "#FFF2E2" },
  userAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  userAvatarText: { color: colors.white, fontWeight: "700", fontSize: 16 },
  adminPill: { backgroundColor: colors.accent, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.sm },
  adminPillText: { color: colors.white, fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  agentQueueHeader: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  agentQueueMetric: { flex: 1, minWidth: 110, backgroundColor: colors.white, padding: spacing.md, borderRadius: radii.md, ...shadow.sm },
  agentQueueValue: { ...typography.h2, color: colors.primaryDeepest, fontWeight: "800" },
  agentQueueLabel: { ...typography.small, color: colors.stone500, fontWeight: "700" },
  sectionTitle: { ...typography.h3, color: colors.primaryDeepest, fontWeight: "700", marginTop: spacing.xs },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { ...typography.h3, color: colors.primaryDeepest, fontWeight: "700", marginTop: spacing.md },
  emptyText: { ...typography.body, color: colors.stone500, textAlign: "center" },
});
