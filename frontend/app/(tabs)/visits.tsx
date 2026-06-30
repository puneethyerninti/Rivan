import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Linking,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api } from "@/src/api";
import { normalizePropertyCollection } from "@/src/property-presenter";
import { enrichPropertyCollection } from "@/src/real-property-overrides";
import { colors, radii, spacing, typography, shadow } from "@/src/theme";

type Tab = "centres" | "history";

function getVisitStatusTone(status?: string) {
  const normalized = String(status || "").trim().toLowerCase();
  switch (normalized) {
    case "pending":
    case "pending_agent_approval":
      return {
        label: "Pending Agent Approval",
        bg: colors.pendingBg,
        text: colors.pendingText,
        icon: "clock" as const,
      };
    case "agent_approved":
      return {
        label: "Agent Approved",
        bg: colors.primarySoft,
        text: colors.primaryDark,
        icon: "check-circle" as const,
      };
    case "admin_approved":
      return {
        label: "Admin Approved",
        bg: colors.primarySoft,
        text: colors.primaryDark,
        icon: "shield" as const,
      };
    case "scheduled":
    case "rescheduled":
      return {
        label: normalized === "rescheduled" ? "Rescheduled" : "Scheduled",
        bg: colors.pendingBg,
        text: colors.pendingText,
        icon: "clock" as const,
      };
    case "completed":
      return { label: "Completed", bg: colors.approvedBg, text: colors.approvedText, icon: "check" as const };
    case "rejected":
      return { label: "Rejected", bg: colors.rejectedBg, text: colors.rejectedText, icon: "x-circle" as const };
    case "cancelled":
      return { label: "Cancelled", bg: colors.rejectedBg, text: colors.rejectedText, icon: "x-circle" as const };
    default:
      return { label: "Pending", bg: colors.pendingBg, text: colors.pendingText, icon: "clock" as const };
  }
}

export default function VisitsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isPhone = width < 640;
  const isTablet = width >= 640 && width < 1024;
  const [tab, setTab] = useState<Tab>("centres");
  const [centres, setCentres] = useState<any[]>([]);
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, v, properties] = await Promise.all([api.centres(), api.myVisits(), api.listProperties().catch(() => [])]);
      const propertyMap = new Map(
        enrichPropertyCollection(normalizePropertyCollection(properties as any[])).map((property) => [property.id, property])
      );
      const normalizedVisits = (v as any[]).map((visit) => {
        const property = propertyMap.get(String(visit.property_id || ""));
        return property
          ? {
              ...visit,
              property_name: property.name,
            }
          : visit;
      });
      setCentres(c as any[]);
      setVisits(normalizedVisits);
    } catch (e: any) {
      console.warn("visits", e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function callNumber(num: string) {
    Linking.openURL(`tel:${num}`).catch(() => Alert.alert("Cannot make call"));
  }

  function openDirections(url: string) {
    Linking.openURL(url).catch(() => Alert.alert("Cannot open maps"));
  }

  function continueVisitFlow(visit: any) {
    if (visit.type === "site" && visit.property_id) {
      router.push(`/layout/${visit.property_id}`);
      return;
    }
    if (visit.centre_id) {
      router.push(`/centre/${visit.centre_id}`);
    }
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
    <SafeAreaView style={styles.safe} edges={["top"]} testID="visits-screen">
      <ScrollView
        contentContainerStyle={[styles.content, isPhone && styles.contentPhone]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.heading}>Visits</Text>
          <Text style={styles.subheading}>Schedule visits, track status updates, and continue into booking when you are ready.</Text>
        </View>

        <View style={[styles.tabs, isPhone && styles.tabsPhone]}>
          <TouchableOpacity testID="visits-tab-centres" style={[styles.tab, tab === "centres" && styles.tabActive]} onPress={() => setTab("centres")}>
            <Text style={[styles.tabText, tab === "centres" && styles.tabTextActive]}>Schedule Visit</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="visits-tab-history" style={[styles.tab, tab === "history" && styles.tabActive]} onPress={() => setTab("history")}>
            <Text style={[styles.tabText, tab === "history" && styles.tabTextActive]}>Visit Status ({visits.length})</Text>
          </TouchableOpacity>
        </View>

        {tab === "centres" ? (
          <View style={[styles.list, isTablet && styles.listTablet]}>
            {centres.map((c) => (
              <View key={c.id} style={[styles.card, isTablet && styles.cardTablet]} testID={`visits-centre-${c.id}`}>
                <Image source={{ uri: c.image }} style={styles.cardImage} />
                <View style={styles.cardBody}>
                  <Text style={styles.centreName}>{c.name}</Text>
                  <View style={styles.row}>
                    <Feather name="map-pin" size={12} color={colors.stone500} />
                    <Text style={styles.metaText} numberOfLines={2}>{c.address}</Text>
                  </View>
                  <View style={styles.row}>
                    <Feather name="clock" size={12} color={colors.stone500} />
                    <Text style={styles.metaText}>{c.timings}</Text>
                  </View>
                  <View style={styles.row}>
                    <Feather name="user" size={12} color={colors.stone500} />
                    <Text style={styles.metaText}>{c.manager}</Text>
                  </View>

                  <View style={styles.actionsGrid}>
                    <TouchableOpacity testID={`visits-call-${c.id}`} style={styles.miniBtn} onPress={() => callNumber(c.phone)}>
                      <Feather name="phone" size={14} color={colors.primary} />
                      <Text style={styles.miniBtnText}>Call</Text>
                    </TouchableOpacity>
                    <TouchableOpacity testID={`visits-directions-${c.id}`} style={styles.miniBtn} onPress={() => openDirections(c.directions_url)}>
                      <Feather name="navigation" size={14} color={colors.accent} />
                      <Text style={styles.miniBtnText}>Maps</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity testID={`visits-book-${c.id}`} style={styles.bookBtn} onPress={() => router.push(`/centre/${c.id}`)}>
                    <Text style={styles.bookBtnText}>Book Visit Slot</Text>
                    <Feather name="arrow-right" size={16} color={colors.white} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.list}>
            {visits.length === 0 ? (
              <View style={styles.empty}>
                <Feather name="calendar" size={48} color={colors.stone300} />
                <Text style={styles.emptyTitle}>No visits scheduled yet</Text>
                <Text style={styles.emptyText}>Book your first centre or site visit to start the customer journey.</Text>
              </View>
            ) : (
              visits.map((v) => {
                const tone = getVisitStatusTone(v.status);
                const normalizedStatus = String(v.status || "").toLowerCase();
                const canContinue = v.type === "site" && v.property_id && ["scheduled", "rescheduled", "completed"].includes(normalizedStatus);
                return (
                  <View key={v.id} style={[styles.visitCard, isPhone && styles.visitCardPhone]} testID={`visits-history-${v.id}`}>
                    <View style={[styles.visitIcon, { backgroundColor: tone.text }]}>
                      <Feather name={v.type === "centre" ? "home" : "map-pin"} size={16} color={colors.white} />
                    </View>
                    <View style={styles.visitBody}>
                      <View style={styles.visitTop}>
                      <Text style={styles.visitTitle}>{v.centre_name || v.property_name || "Scheduled visit"}</Text>
                        <View style={[styles.visitStatus, { backgroundColor: tone.bg }]}>
                          <Feather name={tone.icon} size={12} color={tone.text} />
                          <Text style={[styles.visitStatusText, { color: tone.text }]}>{tone.label}</Text>
                        </View>
                      </View>
                      <Text style={styles.visitMeta}>
                        {v.visit_date}{v.visit_time ? ` at ${v.visit_time}` : ""}
                      </Text>
                      <Text style={styles.visitType}>{v.type === "centre" ? "Experience centre visit" : "Site visit"}</Text>
                      {normalizedStatus === "pending_agent_approval" ? (
                        <Text style={styles.visitApprovalHint}>Your request is waiting for agent review before it moves to the admin queue.</Text>
                      ) : null}
                      {normalizedStatus === "agent_approved" ? (
                        <Text style={styles.visitApprovalHint}>The agent approved your request. The admin team will schedule it next.</Text>
                      ) : null}
                      {normalizedStatus === "admin_approved" ? (
                        <Text style={styles.visitApprovalHint}>The manager approved your request. Scheduling details will update shortly.</Text>
                      ) : null}
                      {["scheduled", "rescheduled"].includes(normalizedStatus) ? (
                        <Text style={styles.visitApprovalHint}>Your visit is scheduled. You can continue to the property flow after completion.</Text>
                      ) : null}
                      {["pending", "approval requested"].includes(normalizedStatus) ? (
                        <Text style={styles.visitApprovalHint}>Your request is waiting for review.</Text>
                      ) : null}
                      <View style={styles.visitActions}>
                        <TouchableOpacity style={styles.visitActionGhost} onPress={() => router.push("/notifications")}>
                          <Text style={styles.visitActionGhostText}>View updates</Text>
                        </TouchableOpacity>
                        {canContinue ? (
                          <TouchableOpacity style={styles.visitActionPrimary} onPress={() => continueVisitFlow(v)}>
                            <Text style={styles.visitActionPrimaryText}>Continue to booking</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.offWhite },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.lg },
  contentPhone: { padding: spacing.md, paddingBottom: spacing.xxl },
  header: { gap: spacing.sm },
  heading: { ...typography.h1, color: colors.primaryDeepest, fontWeight: "700" },
  subheading: { ...typography.body, color: colors.stone500, maxWidth: 720 },
  tabs: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  tabsPhone: { flexDirection: "column", gap: 4 },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: radii.md },
  tabActive: { backgroundColor: colors.primary },
  tabText: { ...typography.small, color: colors.stone600, fontWeight: "700" },
  tabTextActive: { color: colors.white },
  list: { gap: spacing.md },
  listTablet: { flexDirection: "row", flexWrap: "wrap" },
  card: { backgroundColor: colors.surface, borderRadius: radii.xl, overflow: "hidden", ...shadow.sm, borderWidth: 1, borderColor: colors.borderSoft },
  cardTablet: { width: "48%" },
  cardImage: { width: "100%", height: 172 },
  cardBody: { padding: spacing.lg, gap: 8 },
  centreName: { ...typography.h3, color: colors.primaryDeepest, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  metaText: { ...typography.small, color: colors.stone600, flex: 1 },
  actionsGrid: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  miniBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    backgroundColor: colors.offWhite,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  miniBtnText: { ...typography.small, color: colors.stone700, fontWeight: "600" },
  bookBtn: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radii.md,
    marginTop: spacing.sm,
  },
  bookBtnText: { ...typography.body, color: colors.white, fontWeight: "700" },
  visitCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg,
    ...shadow.sm,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  visitCardPhone: { flexDirection: "column" },
  visitIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  visitBody: { flex: 1, gap: spacing.sm },
  visitTop: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.sm, alignItems: "center" },
  visitTitle: { ...typography.bodyLarge, color: colors.primaryDeepest, fontWeight: "700", flexShrink: 1 },
  visitMeta: { ...typography.small, color: colors.stone600 },
  visitType: { ...typography.label, color: colors.accentDark, fontSize: 9 },
  visitApprovalHint: { ...typography.small, color: colors.pendingText, fontWeight: "600" },
  visitStatus: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill },
  visitStatusText: { ...typography.small, fontWeight: "800", lineHeight: 16 },
  visitActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  visitActionGhost: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  visitActionGhostText: { ...typography.small, color: colors.primaryDeepest, fontWeight: "700" },
  visitActionPrimary: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  visitActionPrimaryText: { ...typography.small, color: colors.white, fontWeight: "700" },
  empty: { padding: spacing.xl, alignItems: "center", gap: spacing.sm },
  emptyTitle: { ...typography.h4, color: colors.primaryDeepest },
  emptyText: { ...typography.body, color: colors.stone500, textAlign: "center", maxWidth: 360 },
});
