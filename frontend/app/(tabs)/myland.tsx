import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api } from "@/src/api";
import { colors, radii, spacing, typography, shadow, formatINR, formatINRFull } from "@/src/theme";

export default function MyLandScreen() {
  const router = useRouter();
  const [lands, setLands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.myLand();
      setLands(data as any[]);
    } catch (e: any) {
      console.warn("myland", e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handlePayNext(instId: string) {
    setPaying(instId);
    try {
      await api.payInstallment(instId);
      Alert.alert("Payment Successful", "Installment paid. Receipt generated.");
      await load();
    } catch (e: any) {
      Alert.alert("Payment failed", e.message);
    } finally {
      setPaying(null);
    }
  }

  if (loading) {
    return <SafeAreaView style={styles.safe}><View style={styles.loader}><ActivityIndicator color={colors.primary} size="large" /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="myland-screen">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        <View style={styles.header}>
          <Text style={styles.heading}>My Land</Text>
          <Text style={styles.subheading}>Your owned & booked properties</Text>
        </View>

        {lands.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="map" size={64} color={colors.stone300} />
            <Text style={styles.emptyTitle}>No properties yet</Text>
            <Text style={styles.emptyText}>Explore our premium properties and book your dream plot.</Text>
            <TouchableOpacity
              testID="myland-browse-button"
              style={styles.exploreBtn}
              onPress={() => router.push("/(tabs)")}
            >
              <Text style={styles.exploreBtnText}>Explore Properties</Text>
              <Feather name="arrow-right" size={16} color={colors.white} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.list}>
            {lands.map((land) => {
              const progress = (land.payment_progress || 0) * 100;
              return (
                <View key={land.id} style={styles.card} testID={`myland-${land.id}`}>
                  {/* Header */}
                  <View style={styles.cardImageWrap}>
                    <Image source={{ uri: land.property?.image }} style={styles.cardImage} />
                    <View style={styles.cardImageOverlay}>
                      <View style={[styles.statusPill, { backgroundColor: land.purchase_complete ? colors.sold : colors.booked }]}>
                        <Text style={styles.statusText}>{land.purchase_complete ? "OWNED" : "BOOKED"}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.propertyName}>{land.property?.name}</Text>
                    <View style={styles.row}>
                      <Feather name="map-pin" size={12} color={colors.stone500} />
                      <Text style={styles.metaText}>{land.property?.location}</Text>
                    </View>

                    <View style={styles.detailsGrid}>
                      <Detail label={land.unit_type === "flat" ? "Flat No." : land.unit_type === "villa" ? "Villa No." : "Plot No."} value={land.plot_number} />
                      <Detail label="Size" value={land.size} />
                      <Detail label="Facing" value={land.facing} />
                      <Detail label="Survey" value={land.survey_number} />
                    </View>

                    {/* Payment Progress */}
                    <View style={styles.progressBlock}>
                      <View style={styles.progressTopRow}>
                        <Text style={styles.progressLabel}>Payment Progress</Text>
                        <Text style={styles.progressPct}>{progress.toFixed(0)}%</Text>
                      </View>
                      <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${progress}%` }]} />
                      </View>
                      <View style={styles.progressStats}>
                        <View style={styles.progressStat}>
                          <Text style={styles.progressStatLabel}>Paid</Text>
                          <Text style={styles.progressStatValue}>{formatINR(land.paid_amount || 0)}</Text>
                        </View>
                        <View style={styles.progressStat}>
                          <Text style={styles.progressStatLabel}>Balance</Text>
                          <Text style={[styles.progressStatValue, { color: colors.accent }]}>{formatINR(land.balance_amount || 0)}</Text>
                        </View>
                        <View style={styles.progressStat}>
                          <Text style={styles.progressStatLabel}>Total</Text>
                          <Text style={styles.progressStatValue}>{formatINR(land.total_amount || land.price || 0)}</Text>
                        </View>
                      </View>
                    </View>

                    {/* Next Due */}
                    {land.next_due ? (
                      <View style={styles.dueBox}>
                        <View style={styles.dueLeft}>
                          <View style={[styles.dueIcon, { backgroundColor: land.next_due.status === "overdue" ? "#FEE2E2" : "#FEF3C7" }]}>
                            <Feather name="calendar" size={16} color={land.next_due.status === "overdue" ? colors.danger : "#D97706"} />
                          </View>
                          <View>
                            <Text style={styles.dueTitle}>Next Installment #{land.next_due.installment_number}</Text>
                            <Text style={styles.dueMeta}>Due {land.next_due.due_date}</Text>
                          </View>
                        </View>
                        <View style={styles.dueRight}>
                          <Text style={styles.dueAmount}>{formatINRFull(land.next_due.amount)}</Text>
                          <TouchableOpacity
                            testID={`myland-paynow-${land.next_due.id}`}
                            style={styles.payNowBtn}
                            onPress={() => handlePayNext(land.next_due.id)}
                            disabled={paying === land.next_due.id}
                          >
                            {paying === land.next_due.id ? (
                              <ActivityIndicator size="small" color={colors.white} />
                            ) : (
                              <>
                                <Text style={styles.payNowText}>Pay</Text>
                                <Feather name="arrow-right" size={12} color={colors.white} />
                              </>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : null}

                    {/* Registration Timeline */}
                    <View style={styles.timeline}>
                      <Text style={styles.timelineTitle}>Registration & Ownership Timeline</Text>
                      {(land.registration_timeline || []).map((step: any, i: number) => (
                        <View key={i} style={styles.timelineStep}>
                          <View style={styles.timelineLeft}>
                            <View style={[styles.timelineDot, step.done ? styles.timelineDotDone : styles.timelineDotPending]}>
                              {step.done ? <Feather name="check" size={10} color={colors.white} /> : null}
                            </View>
                            {i < (land.registration_timeline?.length || 0) - 1 ? (
                              <View style={[styles.timelineLine, step.done ? { backgroundColor: colors.primary } : null]} />
                            ) : null}
                          </View>
                          <View style={styles.timelineRight}>
                            <Text style={[styles.timelineStepText, step.done && { color: colors.primaryDeepest, fontWeight: "700" }]}>{step.step}</Text>
                            {step.date ? <Text style={styles.timelineStepDate}>{step.date}</Text> : null}
                          </View>
                        </View>
                      ))}
                    </View>

                    {/* Quick Actions */}
                    <View style={styles.actions}>
                      <TouchableOpacity testID={`myland-docs-${land.id}`} style={styles.actionBtn} onPress={() => router.push("/documents")}>
                        <Feather name="file-text" size={16} color={colors.primary} />
                        <Text style={styles.actionText}>Docs</Text>
                      </TouchableOpacity>
                      <TouchableOpacity testID={`myland-services-${land.id}`} style={styles.actionBtn} onPress={() => router.push("/services")}>
                        <Feather name="tool" size={16} color={colors.primary} />
                        <Text style={styles.actionText}>Services</Text>
                      </TouchableOpacity>
                      <TouchableOpacity testID={`myland-payments-${land.id}`} style={styles.actionBtn} onPress={() => router.push("/(tabs)/payments")}>
                        <Feather name="credit-card" size={16} color={colors.primary} />
                        <Text style={styles.actionText}>Payments</Text>
                      </TouchableOpacity>
                      <TouchableOpacity testID={`myland-visit-${land.id}`} style={styles.actionBtn} onPress={() => router.push(`/centre/site-${land.property_id}`)}>
                        <Feather name="calendar" size={16} color={colors.primary} />
                        <Text style={styles.actionText}>Visit</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Detail({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.detailItem}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || "-"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.offWhite },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { padding: spacing.lg, paddingBottom: 0 },
  heading: { ...typography.h1, color: colors.primaryDeepest, fontWeight: "700" },
  subheading: { ...typography.body, color: colors.stone500, marginTop: 4 },
  list: { padding: spacing.lg, gap: spacing.md },
  card: { backgroundColor: colors.white, borderRadius: radii.lg, overflow: "hidden", ...shadow.md },
  cardImageWrap: { position: "relative" },
  cardImage: { width: "100%", height: 140 },
  cardImageOverlay: { position: "absolute", top: spacing.md, right: spacing.md },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.sm },
  statusText: { color: colors.white, fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  cardBody: { padding: spacing.md, gap: spacing.sm },
  propertyName: { ...typography.h3, color: colors.primaryDeepest, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { ...typography.small, color: colors.stone600 },
  detailsGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: spacing.sm, gap: spacing.sm },
  detailItem: { flex: 1, minWidth: "45%", backgroundColor: colors.offWhite, padding: spacing.sm, borderRadius: radii.sm },
  detailLabel: { ...typography.small, color: colors.stone500, fontSize: 11 },
  detailValue: { ...typography.body, color: colors.primaryDeepest, fontWeight: "600", marginTop: 2 },
  // Progress
  progressBlock: { marginTop: spacing.sm, padding: spacing.md, backgroundColor: colors.primaryDeepest, borderRadius: radii.md },
  progressTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressLabel: { ...typography.small, color: "rgba(255,255,255,0.7)", fontWeight: "600", letterSpacing: 0.6 },
  progressPct: { ...typography.h3, color: colors.accent, fontWeight: "800" },
  progressBar: { height: 6, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 3, marginTop: 6, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.accent },
  progressStats: { flexDirection: "row", marginTop: spacing.sm, gap: spacing.md },
  progressStat: { flex: 1 },
  progressStatLabel: { ...typography.small, color: "rgba(255,255,255,0.6)", fontSize: 10 },
  progressStatValue: { ...typography.body, color: colors.white, fontWeight: "700", marginTop: 2 },
  // Due
  dueBox: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.sm, backgroundColor: "#FFFBEB", borderRadius: radii.md, borderLeftWidth: 3, borderLeftColor: colors.accent },
  dueLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  dueIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  dueTitle: { ...typography.small, color: colors.primaryDeepest, fontWeight: "700" },
  dueMeta: { ...typography.small, color: colors.stone500, fontSize: 11 },
  dueRight: { alignItems: "flex-end", gap: 4 },
  dueAmount: { ...typography.body, color: colors.primary, fontWeight: "700" },
  payNowBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.sm, minWidth: 60, justifyContent: "center" },
  payNowText: { color: colors.white, fontSize: 11, fontWeight: "700" },
  // Timeline
  timeline: { marginTop: spacing.sm, padding: spacing.md, backgroundColor: colors.offWhite, borderRadius: radii.md },
  timelineTitle: { ...typography.small, color: colors.stone600, fontWeight: "700", marginBottom: spacing.sm, letterSpacing: 0.6 },
  timelineStep: { flexDirection: "row", gap: spacing.sm, minHeight: 32 },
  timelineLeft: { alignItems: "center", width: 18 },
  timelineDot: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  timelineDotDone: { backgroundColor: colors.primary },
  timelineDotPending: { backgroundColor: colors.white, borderWidth: 2, borderColor: colors.stone300 },
  timelineLine: { width: 2, flex: 1, backgroundColor: colors.stone200, marginTop: 2 },
  timelineRight: { flex: 1, paddingBottom: 8 },
  timelineStepText: { ...typography.small, color: colors.stone500, fontWeight: "600" },
  timelineStepDate: { ...typography.small, color: colors.stone400, fontSize: 10, marginTop: 2 },
  // Actions
  actions: { flexDirection: "row", gap: 6, marginTop: spacing.sm },
  actionBtn: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 4, paddingVertical: 10, backgroundColor: colors.offWhite, borderRadius: radii.md, borderWidth: 1, borderColor: colors.stone100 },
  actionText: { ...typography.small, color: colors.primary, fontWeight: "600", fontSize: 11 },
  // Empty
  empty: { padding: spacing.xl, alignItems: "center", gap: spacing.sm, marginTop: spacing.xl },
  emptyTitle: { ...typography.h3, color: colors.primaryDeepest, fontWeight: "700", marginTop: spacing.md },
  emptyText: { ...typography.body, color: colors.stone500, textAlign: "center", maxWidth: 280 },
  exploreBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: 14, borderRadius: radii.md, marginTop: spacing.md },
  exploreBtnText: { ...typography.body, color: colors.white, fontWeight: "700" },
});
