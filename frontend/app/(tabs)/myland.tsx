import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl, ActivityIndicator, Alert, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api } from "@/src/api";
import { colors, radii, spacing, typography, shadow, formatINR, formatINRFull } from "@/src/theme";

const SERVICE_ICONS: Record<string, any> = {
  Cleaning: "feather",
  "CCTV Installation": "video",
  "Compound Wall": "grid",
  Construction: "tool",
  Borewell: "droplet",
  Fencing: "shield",
  "Electricity Connection": "zap",
  "Water Connection": "droplet",
  "Property Maintenance": "settings",
  "Legal Documentation": "file-text",
};

export default function MyLandScreen() {
  const router = useRouter();
  const [lands, setLands] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [landRes, svcRes, notifRes] = await Promise.all([
        api.myLand(),
        api.servicesCatalog().catch(() => []),
        api.notifications().catch(() => []),
      ]);
      setLands(landRes as any[]);
      setServices(svcRes as any[]);
      setNotifications(notifRes as any[]);
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
          <Text style={styles.subheading}>Your owned & under-purchase properties</Text>
        </View>

        {lands.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="map" size={64} color={colors.stone300} />
            <Text style={styles.emptyTitle}>No properties yet</Text>
            <Text style={styles.emptyText}>Explore our premium properties and book your dream plot.</Text>
            <TouchableOpacity testID="myland-browse-button" style={styles.exploreBtn} onPress={() => router.push("/(tabs)")}>
              <Text style={styles.exploreBtnText}>Explore Properties</Text>
              <Feather name="arrow-right" size={16} color={colors.white} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.list}>
            {lands.map((land) =>
              land.purchase_complete ? (
                <PurchasedCard
                  key={land.id}
                  land={land}
                  services={services}
                  notifications={notifications}
                  router={router}
                />
              ) : (
                <OngoingCard
                  key={land.id}
                  land={land}
                  router={router}
                  onPay={handlePayNext}
                  paying={paying}
                  notifications={notifications}
                />
              )
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ====================================================
// PURCHASED PROPERTY CARD (premium, full-featured)
// ====================================================
function PurchasedCard({ land, services, notifications, router }: any) {
  const recentNotifs = notifications.slice(0, 3);

  function openMaps() {
    Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(land.property?.location || "")}`).catch(() => Alert.alert("Cannot open maps"));
  }
  function callSupport() {
    Linking.openURL("tel:+919876543210").catch(() => Alert.alert("Cannot call"));
  }

  return (
    <View style={styles.purchasedCard} testID={`myland-purchased-${land.id}`}>
      {/* Banner Hero */}
      <View style={styles.heroWrap}>
        <Image source={{ uri: land.property?.image }} style={styles.hero} />
        <View style={styles.heroGradient} />
        <View style={styles.ownedBadge}>
          <Feather name="award" size={11} color={colors.primaryDeepest} />
          <Text style={styles.ownedBadgeText}>PURCHASE COMPLETED</Text>
        </View>
        <View style={styles.heroContent}>
          <Text style={styles.heroName}>{land.property?.name}</Text>
          <View style={styles.heroRow}>
            <Feather name="map-pin" size={12} color={colors.white} />
            <Text style={styles.heroSub}>{land.property?.location}</Text>
          </View>
        </View>
      </View>

      <View style={styles.cardInner}>
        {/* Plot Details */}
        <View style={styles.detailsCard}>
          <DetailItem icon="hash" label={land.unit_type === "villa" ? "Villa No." : land.unit_type === "flat" ? "Flat No." : "Plot No."} value={land.plot_number} accent />
          <DetailItem icon="maximize-2" label="Size" value={land.size} />
          <DetailItem icon="compass" label="Facing" value={land.facing} />
          <DetailItem icon="file-text" label="Survey" value={land.survey_number} />
        </View>

        {/* Ownership status banner */}
        <View style={styles.ownershipBanner}>
          <View style={styles.ownershipIcon}>
            <Feather name="check-circle" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.ownershipTitle}>Registration Complete</Text>
            <Text style={styles.ownershipSub}>Sale deed registered · Possession handed over</Text>
          </View>
          <View style={styles.priceBadge}>
            <Text style={styles.priceBadgeLabel}>Property Value</Text>
            <Text style={styles.priceBadgeValue}>{formatINR(land.price)}</Text>
          </View>
        </View>

        {/* Quick Action Buttons */}
        <View style={styles.quickRow}>
          <QuickBtn icon="map" label="Open Layout" onPress={() => router.push(`/layout/${land.property_id}`)} testID={`myland-open-layout-${land.id}`} />
          <QuickBtn icon="navigation" label="Directions" onPress={openMaps} testID={`myland-directions-${land.id}`} />
          <QuickBtn icon="calendar" label="Site Visit" onPress={() => router.push(`/centre/site-${land.property_id}`)} testID={`myland-sitevisit-${land.id}`} />
          <QuickBtn icon="phone" label="Support" onPress={callSupport} testID={`myland-support-${land.id}`} />
        </View>

        {/* Documents Section */}
        <SectionHeader title="Property Documents" actionLabel="View All" onAction={() => router.push("/documents")} testID={`myland-docs-${land.id}`} />
        <View style={styles.docRow}>
          <DocChip label="Sale Deed" icon="award" color="#7E22CE" onPress={() => router.push("/documents")} />
          <DocChip label="Agreement" icon="file-text" color={colors.primary} onPress={() => router.push("/documents")} />
          <DocChip label="Registration" icon="check-circle" color="#BE185D" onPress={() => router.push("/documents")} />
          <DocChip label="KYC" icon="user-check" color="#D97706" onPress={() => router.push("/documents")} />
          <DocChip label="Receipts" icon="credit-card" color={colors.info} onPress={() => router.push("/(tabs)/payments")} />
        </View>

        {/* Payment Summary (compact) */}
        <SectionHeader title="Payment Summary" actionLabel="History" onAction={() => router.push("/(tabs)/payments")} testID={`myland-payhist-${land.id}`} />
        <View style={styles.paySummary}>
          <View style={styles.paySummaryItem}>
            <Text style={styles.paySummaryLabel}>Paid</Text>
            <Text style={styles.paySummaryValue}>{formatINR(land.paid_amount || land.price)}</Text>
          </View>
          <View style={styles.paySummaryDivider} />
          <View style={styles.paySummaryItem}>
            <Text style={styles.paySummaryLabel}>Balance</Text>
            <Text style={[styles.paySummaryValue, { color: colors.success }]}>₹0</Text>
          </View>
          <View style={styles.paySummaryDivider} />
          <View style={styles.paySummaryItem}>
            <Text style={styles.paySummaryLabel}>Status</Text>
            <Text style={[styles.paySummaryValue, { color: colors.success, fontSize: 13 }]}>FULLY PAID</Text>
          </View>
        </View>

        {/* Services Section (Unlocked) */}
        <View style={styles.servicesUnlockBanner}>
          <View style={styles.serviceUnlockIcon}>
            <Feather name="unlock" size={14} color={colors.white} />
          </View>
          <Text style={styles.serviceUnlockText}>Premium Property Services — Unlocked</Text>
        </View>
        <SectionHeader title="Property Services" actionLabel="My Requests" onAction={() => router.push("/services")} testID={`myland-services-${land.id}`} />
        <View style={styles.serviceGrid}>
          {services.map((s: any) => (
            <TouchableOpacity
              key={s.type}
              testID={`myland-service-${s.type}`}
              style={styles.serviceTile}
              onPress={() => router.push(`/services/${encodeURIComponent(s.type)}`)}
              activeOpacity={0.85}
            >
              <View style={styles.serviceIcon}>
                <Feather name={SERVICE_ICONS[s.type] || "tool"} size={18} color={colors.primary} />
              </View>
              <Text style={styles.serviceTitle} numberOfLines={1}>{s.type}</Text>
              <View style={styles.serviceRequest}>
                <Text style={styles.serviceRequestText}>Request</Text>
                <Feather name="arrow-right" size={11} color={colors.accent} />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent Notifications */}
        {recentNotifs.length > 0 ? (
          <>
            <SectionHeader title="Recent Updates" actionLabel="View All" onAction={() => router.push("/notifications")} testID={`myland-notifs-${land.id}`} />
            <View style={styles.notifList}>
              {recentNotifs.map((n: any) => (
                <View key={n.id} style={styles.notifRow}>
                  <View style={styles.notifDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.notifTitle} numberOfLines={1}>{n.title}</Text>
                    <Text style={styles.notifBody} numberOfLines={1}>{n.body}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

// ====================================================
// ONGOING PROPERTY CARD (payment-focused)
// ====================================================
function OngoingCard({ land, router, onPay, paying, notifications }: any) {
  const progress = (land.payment_progress || 0) * 100;
  const recentPays = notifications.filter((n: any) => n.type === "payment").slice(0, 2);

  return (
    <View style={styles.ongoingCard} testID={`myland-ongoing-${land.id}`}>
      {/* Banner */}
      <View style={styles.heroWrap}>
        <Image source={{ uri: land.property?.image }} style={styles.hero} />
        <View style={styles.heroGradient} />
        <View style={styles.ongoingBadge}>
          <View style={styles.ongoingBadgeDot} />
          <Text style={styles.ongoingBadgeText}>PAYMENT ONGOING</Text>
        </View>
        <View style={styles.heroContent}>
          <Text style={styles.heroName}>{land.property?.name}</Text>
          <View style={styles.heroRow}>
            <Feather name="map-pin" size={12} color={colors.white} />
            <Text style={styles.heroSub}>{land.property?.location}</Text>
          </View>
        </View>
      </View>

      <View style={styles.cardInner}>
        {/* Quick details */}
        <View style={styles.detailsCard}>
          <DetailItem icon="hash" label={land.unit_type === "villa" ? "Villa No." : land.unit_type === "flat" ? "Flat No." : "Plot No."} value={land.plot_number} accent />
          <DetailItem icon="maximize-2" label="Size" value={land.size} />
          <DetailItem icon="compass" label="Facing" value={land.facing} />
          <DetailItem icon="file-text" label="Survey" value={land.survey_number} />
        </View>

        {/* Big Payment Progress Card */}
        <View style={styles.progressCard}>
          <View style={styles.progressTopRow}>
            <Text style={styles.progressLabel}>Payment Progress</Text>
            <Text style={styles.progressPct}>{progress.toFixed(0)}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <View style={styles.progressStats}>
            <View style={styles.progressStat}>
              <Text style={styles.progressStatLabel}>Property Value</Text>
              <Text style={styles.progressStatValue}>{formatINR(land.total_amount || land.price || 0)}</Text>
            </View>
            <View style={styles.progressStat}>
              <Text style={styles.progressStatLabel}>Amount Paid</Text>
              <Text style={[styles.progressStatValue, { color: colors.accentLight }]}>{formatINR(land.paid_amount || 0)}</Text>
            </View>
            <View style={styles.progressStat}>
              <Text style={styles.progressStatLabel}>Balance</Text>
              <Text style={[styles.progressStatValue, { color: colors.accent }]}>{formatINR(land.balance_amount || 0)}</Text>
            </View>
          </View>
        </View>

        {/* Next Due — prominent */}
        {land.next_due ? (
          <View style={styles.nextDueCard}>
            <View style={styles.nextDueHeader}>
              <View style={styles.nextDueIcon}>
                <Feather name="clock" size={16} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nextDueLabel}>Upcoming Installment</Text>
                <Text style={styles.nextDueNumber}>Installment #{land.next_due.installment_number}</Text>
              </View>
              <View style={[styles.nextDueStatus, { backgroundColor: land.next_due.status === "overdue" ? "#FEE2E2" : "#FEF3C7" }]}>
                <Text style={[styles.nextDueStatusText, { color: land.next_due.status === "overdue" ? colors.danger : "#D97706" }]}>
                  {land.next_due.status === "overdue" ? "OVERDUE" : "DUE SOON"}
                </Text>
              </View>
            </View>
            <View style={styles.nextDueAmountRow}>
              <View>
                <Text style={styles.nextDueAmountLabel}>Amount Due</Text>
                <Text style={styles.nextDueAmount}>{formatINRFull(land.next_due.amount)}</Text>
                <Text style={styles.nextDueDate}>Due on {land.next_due.due_date}</Text>
              </View>
              <TouchableOpacity
                testID={`myland-paynow-${land.next_due.id}`}
                style={[styles.payNowBtnBig, land.next_due.status === "overdue" && { backgroundColor: colors.danger }]}
                onPress={() => onPay(land.next_due.id)}
                disabled={paying === land.next_due.id}
              >
                {paying === land.next_due.id ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <Feather name="credit-card" size={14} color={colors.white} />
                    <Text style={styles.payNowBigText}>Pay Now</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* Action Buttons */}
        <View style={styles.actionsRow}>
          <TouchableOpacity testID={`myland-timeline-${land.id}`} style={styles.actionPill} onPress={() => router.push("/(tabs)/payments")}>
            <Feather name="trending-up" size={14} color={colors.primary} />
            <Text style={styles.actionPillText}>Payment Timeline</Text>
          </TouchableOpacity>
          <TouchableOpacity testID={`myland-receipts-${land.id}`} style={styles.actionPill} onPress={() => router.push("/(tabs)/payments")}>
            <Feather name="download" size={14} color={colors.primary} />
            <Text style={styles.actionPillText}>Receipts</Text>
          </TouchableOpacity>
          <TouchableOpacity testID={`myland-support-${land.id}`} style={styles.actionPill} onPress={() => Linking.openURL("tel:+919876543210")}>
            <Feather name="phone" size={14} color={colors.primary} />
            <Text style={styles.actionPillText}>Support</Text>
          </TouchableOpacity>
        </View>

        {/* Registration Progress */}
        <SectionHeader title="Registration Progress" />
        <View style={styles.timeline}>
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
                {step.done ? <Text style={styles.timelineStepDone}>Completed</Text> : <Text style={styles.timelineStepPending}>Pending</Text>}
              </View>
            </View>
          ))}
        </View>

        {/* Services Locked notice */}
        <View style={styles.servicesLocked}>
          <View style={styles.lockedIcon}>
            <Feather name="lock" size={14} color={colors.stone500} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.lockedTitle}>Property Services Locked</Text>
            <Text style={styles.lockedText}>Compound Wall, CCTV, Cleaning & more unlock after purchase completion.</Text>
          </View>
        </View>

        {/* Recent activity */}
        {recentPays.length > 0 ? (
          <>
            <SectionHeader title="Recent Payment Activity" actionLabel="View All" onAction={() => router.push("/notifications")} />
            <View style={styles.notifList}>
              {recentPays.map((n: any) => (
                <View key={n.id} style={styles.notifRow}>
                  <View style={[styles.notifDot, { backgroundColor: colors.success }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.notifTitle} numberOfLines={1}>{n.title}</Text>
                    <Text style={styles.notifBody} numberOfLines={1}>{n.body}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

function DetailItem({ icon, label, value, accent }: { icon: any; label: string; value?: string; accent?: boolean }) {
  return (
    <View style={[styles.detailItem, accent && { backgroundColor: colors.accentSoft }]}>
      <Feather name={icon} size={12} color={accent ? colors.accent : colors.primary} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, accent && { color: colors.accentDark }]}>{value || "-"}</Text>
    </View>
  );
}

function QuickBtn({ icon, label, onPress, testID }: { icon: any; label: string; onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity testID={testID} style={styles.quickBtn} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.quickBtnIcon}>
        <Feather name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={styles.quickBtnLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function DocChip({ label, icon, color, onPress }: { label: string; icon: any; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.docChip} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.docChipIcon, { backgroundColor: `${color}18` }]}>
        <Feather name={icon} size={16} color={color} />
      </View>
      <Text style={styles.docChipLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function SectionHeader({ title, actionLabel, onAction, testID }: { title: string; actionLabel?: string; onAction?: () => void; testID?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity testID={testID} onPress={onAction}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.offWhite },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { padding: spacing.lg, paddingBottom: 0 },
  heading: { ...typography.h1, color: colors.primaryDeepest, fontWeight: "700" },
  subheading: { ...typography.body, color: colors.stone500, marginTop: 4 },
  list: { padding: spacing.lg, gap: spacing.lg },

  // Card wrappers
  purchasedCard: { backgroundColor: colors.white, borderRadius: radii.lg, overflow: "hidden", borderWidth: 1.5, borderColor: "#E6F4EA", ...shadow.md },
  ongoingCard: { backgroundColor: colors.white, borderRadius: radii.lg, overflow: "hidden", borderWidth: 1.5, borderColor: colors.accentSoft, ...shadow.md },

  // Hero
  heroWrap: { position: "relative" },
  hero: { width: "100%", height: 160 },
  heroGradient: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(5,47,15,0.45)" },
  heroContent: { position: "absolute", bottom: 0, left: 0, right: 0, padding: spacing.md, gap: 4 },
  heroName: { ...typography.h2, color: colors.white, fontWeight: "700" },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  heroSub: { ...typography.small, color: "rgba(255,255,255,0.85)" },

  // Badges
  ownedBadge: { position: "absolute", top: spacing.md, right: spacing.md, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FCD34D", paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.sm },
  ownedBadgeText: { ...typography.label, color: colors.primaryDeepest, fontSize: 9, fontWeight: "800" },
  ongoingBadge: { position: "absolute", top: spacing.md, right: spacing.md, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.accent, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.sm },
  ongoingBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.white },
  ongoingBadgeText: { ...typography.label, color: colors.white, fontSize: 9, fontWeight: "800" },

  cardInner: { padding: spacing.md, gap: spacing.sm },

  // Details
  detailsCard: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  detailItem: { flexBasis: "48%", flexDirection: "row", alignItems: "center", gap: 6, padding: spacing.sm, backgroundColor: colors.offWhite, borderRadius: radii.sm },
  detailLabel: { ...typography.small, color: colors.stone500, fontSize: 10 },
  detailValue: { ...typography.small, color: colors.primaryDeepest, fontWeight: "700", marginLeft: "auto" },

  // Ownership banner
  ownershipBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, backgroundColor: "#E6F4EA", borderRadius: radii.md, marginTop: 6 },
  ownershipIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  ownershipTitle: { ...typography.body, color: colors.primaryDeepest, fontWeight: "700" },
  ownershipSub: { ...typography.small, color: colors.stone600, marginTop: 2 },
  priceBadge: { alignItems: "flex-end" },
  priceBadgeLabel: { ...typography.small, color: colors.stone500, fontSize: 10 },
  priceBadgeValue: { ...typography.body, color: colors.primary, fontWeight: "700" },

  // Quick actions
  quickRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  quickBtn: { flex: 1, alignItems: "center", gap: 4, padding: 8, backgroundColor: colors.offWhite, borderRadius: radii.md, borderWidth: 1, borderColor: colors.stone100 },
  quickBtnIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  quickBtnLabel: { ...typography.small, color: colors.primaryDeepest, fontWeight: "600", fontSize: 10 },

  // Section headers
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md, marginBottom: 4 },
  sectionTitle: { ...typography.h4, color: colors.primaryDeepest, fontWeight: "700" },
  sectionAction: { ...typography.small, color: colors.accent, fontWeight: "700" },

  // Docs
  docRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  docChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.offWhite, borderRadius: radii.md, borderWidth: 1, borderColor: colors.stone100 },
  docChipIcon: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  docChipLabel: { ...typography.small, color: colors.primaryDeepest, fontWeight: "600" },

  // Payment summary (purchased)
  paySummary: { flexDirection: "row", padding: spacing.md, backgroundColor: colors.offWhite, borderRadius: radii.md },
  paySummaryItem: { flex: 1, alignItems: "center" },
  paySummaryLabel: { ...typography.small, color: colors.stone500, fontSize: 10 },
  paySummaryValue: { ...typography.body, color: colors.primaryDeepest, fontWeight: "700", marginTop: 2 },
  paySummaryDivider: { width: 1, backgroundColor: colors.stone200 },

  // Services unlock banner
  servicesUnlockBanner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: spacing.md, paddingVertical: 8, backgroundColor: colors.primary, borderRadius: radii.md, marginTop: spacing.sm },
  serviceUnlockIcon: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  serviceUnlockText: { ...typography.small, color: colors.white, fontWeight: "700", letterSpacing: 0.5 },

  // Service tiles (purchased)
  serviceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  serviceTile: { width: "48%", padding: 10, backgroundColor: colors.white, borderRadius: radii.md, borderWidth: 1, borderColor: colors.stone100, gap: 4 },
  serviceIcon: { width: 32, height: 32, borderRadius: radii.sm, backgroundColor: "#E6F4EA", alignItems: "center", justifyContent: "center" },
  serviceTitle: { ...typography.small, color: colors.primaryDeepest, fontWeight: "700", marginTop: 4 },
  serviceRequest: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 },
  serviceRequestText: { ...typography.small, color: colors.accent, fontWeight: "700", fontSize: 11 },

  // Notif
  notifList: { gap: 6 },
  notifRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: spacing.sm, backgroundColor: colors.offWhite, borderRadius: radii.sm },
  notifDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, marginTop: 5 },
  notifTitle: { ...typography.small, color: colors.primaryDeepest, fontWeight: "700" },
  notifBody: { ...typography.small, color: colors.stone500, marginTop: 1 },

  // ----- Ongoing-specific -----
  progressCard: { backgroundColor: colors.primaryDeepest, padding: spacing.md, borderRadius: radii.md, marginTop: 4 },
  progressTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressLabel: { ...typography.small, color: "rgba(255,255,255,0.7)", fontWeight: "600", letterSpacing: 0.6 },
  progressPct: { ...typography.h2, color: colors.accent, fontWeight: "800" },
  progressBar: { height: 8, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 4, marginTop: 8, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.accent, borderRadius: 4 },
  progressStats: { flexDirection: "row", marginTop: spacing.sm, gap: 8 },
  progressStat: { flex: 1 },
  progressStatLabel: { ...typography.small, color: "rgba(255,255,255,0.6)", fontSize: 10 },
  progressStatValue: { ...typography.body, color: colors.white, fontWeight: "700", marginTop: 2 },

  // Next due (ongoing)
  nextDueCard: { padding: spacing.md, backgroundColor: "#FFFBEB", borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.accentLight, gap: spacing.sm },
  nextDueHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  nextDueIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  nextDueLabel: { ...typography.small, color: colors.stone500, fontSize: 10, letterSpacing: 0.6 },
  nextDueNumber: { ...typography.body, color: colors.primaryDeepest, fontWeight: "700" },
  nextDueStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.sm },
  nextDueStatusText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  nextDueAmountRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  nextDueAmountLabel: { ...typography.small, color: colors.stone500, fontSize: 11 },
  nextDueAmount: { ...typography.h2, color: colors.accent, fontWeight: "800", marginTop: 2 },
  nextDueDate: { ...typography.small, color: colors.stone600, fontSize: 11, marginTop: 2 },
  payNowBtnBig: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: 12, borderRadius: radii.md, minWidth: 110, justifyContent: "center" },
  payNowBigText: { ...typography.body, color: colors.white, fontWeight: "700" },

  // Action pills (ongoing)
  actionsRow: { flexDirection: "row", gap: 6 },
  actionPill: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 10, backgroundColor: colors.offWhite, borderRadius: radii.md, borderWidth: 1, borderColor: colors.stone100 },
  actionPillText: { ...typography.small, color: colors.primary, fontWeight: "600", fontSize: 11 },

  // Timeline
  timeline: { padding: spacing.sm, backgroundColor: colors.offWhite, borderRadius: radii.md },
  timelineStep: { flexDirection: "row", gap: 10, minHeight: 36 },
  timelineLeft: { alignItems: "center", width: 18 },
  timelineDot: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  timelineDotDone: { backgroundColor: colors.primary },
  timelineDotPending: { backgroundColor: colors.white, borderWidth: 2, borderColor: colors.stone300 },
  timelineLine: { width: 2, flex: 1, backgroundColor: colors.stone200, marginTop: 2 },
  timelineRight: { flex: 1, paddingBottom: 10 },
  timelineStepText: { ...typography.small, color: colors.stone500, fontWeight: "600" },
  timelineStepDone: { ...typography.small, color: colors.success, fontSize: 10, marginTop: 2, fontWeight: "600" },
  timelineStepPending: { ...typography.small, color: colors.stone400, fontSize: 10, marginTop: 2 },

  // Services locked (ongoing)
  servicesLocked: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, backgroundColor: "#F9FAF9", borderRadius: radii.md, borderWidth: 1, borderColor: colors.stone200, marginTop: 4 },
  lockedIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.stone200, alignItems: "center", justifyContent: "center" },
  lockedTitle: { ...typography.body, color: colors.stone700, fontWeight: "700" },
  lockedText: { ...typography.small, color: colors.stone500, marginTop: 2 },

  // Empty
  empty: { padding: spacing.xl, alignItems: "center", gap: spacing.sm, marginTop: spacing.xl },
  emptyTitle: { ...typography.h3, color: colors.primaryDeepest, fontWeight: "700", marginTop: spacing.md },
  emptyText: { ...typography.body, color: colors.stone500, textAlign: "center", maxWidth: 280 },
  exploreBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: 14, borderRadius: radii.md, marginTop: spacing.md },
  exploreBtnText: { ...typography.body, color: colors.white, fontWeight: "700" },
});
