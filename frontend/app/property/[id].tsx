import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { normalizePropertyRecord, type NormalizedProperty } from "@/src/property-presenter";
import { enrichProperty } from "@/src/real-property-overrides";
import { PropertyMedia } from "@/src/components/PropertyMedia";
import { colors, formatINR, radii, shadow, spacing, typography } from "@/src/theme";

const SALES_CONTACT_NUMBER = "+919966826567";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export default function PropertyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1100;
  const isTablet = width >= 760;
  const isPhone = width < 520;

  const [property, setProperty] = useState<NormalizedProperty | null>(null);
  const [plotCount, setPlotCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [propertyPayload, plotPayload] = await Promise.all([
          api.getProperty(id as string),
          api.getPropertyPlots(id as string).catch(() => []),
        ]);

        const normalized = enrichProperty(normalizePropertyRecord(propertyPayload));
        const plots = Array.isArray(plotPayload) ? plotPayload : [];

        if (active) {
          if (normalized) setProperty(normalized);
          setPlotCount(plots.length || null);
        }
      } catch {
        if (active) {
          setProperty(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [id]);

  const amenityList = useMemo(() => property?.amenities.slice(0, 6) || [], [property]);
  const nearbyList = useMemo(() => property?.nearby.slice(0, 4) || [], [property]);
  const approvalList = useMemo(() => property?.approvals.slice(0, 4) || [], [property]);

  function callSales() {
    Linking.openURL(`tel:${SALES_CONTACT_NUMBER}`).catch(() => Alert.alert("Call unavailable", SALES_CONTACT_NUMBER));
  }

  function openLayout() {
    if (!property?.id) return;
    router.push(`/layout/${property.id}`);
  }

  function openVisit() {
    if (!property?.id) return;
    router.push(`/centre/site-${property.id}`);
  }

  function openBooking() {
    if (user?.role === "agent" || user?.role === "sub_agent") {
      router.push({
        pathname: "/agent" as never,
        params: { action: "booking", propertyId: String(property?.id || "") },
      });
      return;
    }
    openLayout();
  }

  if (loading && !property) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!property) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Property not available</Text>
          <Text style={styles.emptyBody}>We could not load this listing right now.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace("/")}>
            <Text style={styles.primaryButtonText}>Back to home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={[styles.content, isPhone && styles.contentPhone]} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
            <Feather name="arrow-left" size={18} color={colors.primaryDeepest} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={callSales}>
            <Feather name="phone" size={18} color={colors.primaryDeepest} />
          </TouchableOpacity>
        </View>

        <View style={[styles.heroSection, isDesktop && styles.heroSectionDesktop]}>
          <View style={[styles.heroMediaWrap, isPhone && styles.heroMediaWrapPhone]}>
            {property.image ? (
              <PropertyMedia image={property.image} videoUrl={property.videoUrl} style={styles.heroMedia} />
            ) : (
              <View style={styles.heroMediaFallback} />
            )}
          </View>

          <View style={[styles.heroCopy, isPhone && styles.heroCopyPhone]}>
            <Text style={styles.kicker}>{property.category || "Property"}</Text>
            <Text style={[styles.title, isPhone && styles.titlePhone]}>{property.name}</Text>
            <Text style={styles.location}>{property.location || "Premium real estate location"}</Text>
            <Text style={styles.body}>
              {property.description ||
                property.highlights ||
                "A premium project with clearer discovery, stronger decision support, and direct access to layout, visits, and next steps."}
            </Text>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.primaryButton} onPress={openLayout}>
                <Text style={styles.primaryButtonText}>View layout</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={openVisit}>
                <Text style={styles.secondaryButtonText}>Schedule visit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={[styles.statsRow, isTablet && styles.statsRowTablet]}>
          <StatCard label="Starting price" value={property.startingPrice ? formatINR(property.startingPrice) : "On request"} />
          <StatCard label="Availability" value={property.availability || (plotCount ? `${plotCount} units listed` : "Open for enquiry")} />
          <StatCard label="Facing" value={property.facing || "Multiple options"} />
          <StatCard label="Road width" value={property.roadWidth || "Project road access"} />
        </View>

        <View style={[styles.detailGrid, isDesktop && styles.detailGridDesktop]}>
          <View style={styles.mainColumn}>
            {property.layoutPlans.length ? (
              <View style={styles.surfaceCard}>
                <Text style={styles.sectionEyebrow}>Plans</Text>
                <Text style={styles.sectionTitle}>Layout options</Text>
                <View style={styles.planStack}>
                  {property.layoutPlans.slice(0, 2).map((plan) => (
                    <TouchableOpacity key={plan.id} style={styles.planCard} activeOpacity={0.92} onPress={openLayout}>
                      {plan.image ? <PropertyMedia image={plan.image} style={styles.planImage} /> : <View style={styles.planImageFallback} />}
                      <View style={styles.planBody}>
                        <Text style={styles.planTitle}>{plan.title}</Text>
                        <Text style={styles.planCopy} numberOfLines={3}>
                          {plan.description || "Open the interactive layout to compare inventory and position."}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.surfaceCard}>
              <Text style={styles.sectionEyebrow}>Overview</Text>
              <Text style={styles.sectionTitle}>What makes this property easier to trust</Text>
              <Text style={styles.sectionBody}>
                Important project information is grouped into approvals, amenities, and location cues so users can decide without scanning a noisy page.
              </Text>
            </View>
          </View>

          <View style={styles.sideColumn}>
            <View style={styles.surfaceCard}>
              <Text style={styles.sideTitle}>Approvals</Text>
              {approvalList.length ? (
                approvalList.map((item) => (
                  <View key={item} style={styles.listItem}>
                    <Feather name="shield" size={16} color={colors.primary} />
                    <Text style={styles.listItemText}>{item}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.mutedText}>Approval details will appear here when available.</Text>
              )}
            </View>

            <View style={styles.surfaceCard}>
              <Text style={styles.sideTitle}>Amenities</Text>
              {amenityList.length ? (
                amenityList.map((item) => (
                  <View key={item} style={styles.listItem}>
                    <Feather name="check-circle" size={16} color={colors.primary} />
                    <Text style={styles.listItemText}>{item}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.mutedText}>Amenities are not available for this listing yet.</Text>
              )}
            </View>

            <View style={styles.surfaceCard}>
              <Text style={styles.sideTitle}>Nearby</Text>
              {nearbyList.length ? (
                nearbyList.map((item) => (
                  <View key={item} style={styles.listItem}>
                    <Feather name="map-pin" size={16} color={colors.accentDark} />
                    <Text style={styles.listItemText}>{item}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.mutedText}>Nearby landmarks will appear here when available.</Text>
              )}
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.actionBar, isPhone && styles.actionBarPhone]}>
        <TouchableOpacity style={styles.actionIcon} onPress={callSales}>
          <Feather name="phone" size={18} color={colors.primaryDeepest} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionSecondary} onPress={openVisit}>
          <Text style={styles.actionSecondaryText}>Visit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionPrimary} onPress={openBooking}>
          <Text style={styles.actionPrimaryText}>{user?.role === "agent" || user?.role === "sub_agent" ? "Create booking" : "See available units"}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.offWhite },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 108, gap: spacing.lg },
  contentPhone: { paddingHorizontal: spacing.md, paddingBottom: 144, gap: spacing.md },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { ...typography.h3, color: colors.primaryDeepest },
  emptyBody: { ...typography.body, color: colors.stone500, textAlign: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: spacing.lg,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  heroSection: { gap: spacing.lg },
  heroSectionDesktop: { flexDirection: "row", alignItems: "stretch" },
  heroMediaWrap: {
    flex: 1,
    minHeight: 280,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: colors.surfaceMuted,
    ...shadow.lg,
  },
  heroMediaWrapPhone: {
    minHeight: 200,
    borderRadius: 18,
  },
  heroMedia: { width: "100%", height: "100%" },
  heroMediaFallback: { flex: 1, backgroundColor: colors.surfaceMuted },
  heroCopy: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadow.sm,
  },
  heroCopyPhone: {
    borderRadius: 18,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  kicker: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    ...typography.small,
    fontWeight: "700",
    color: colors.primaryDark,
  },
  title: { ...typography.h1, color: colors.primaryDeepest, fontSize: 32, lineHeight: 38 },
  titlePhone: { fontSize: 24, lineHeight: 30 },
  location: { ...typography.bodyLarge, color: colors.stone500 },
  body: { ...typography.body, color: colors.stone600 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  primaryButton: {
    minHeight: 54,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { ...typography.body, fontWeight: "800", color: colors.white },
  secondaryButton: {
    minHeight: 54,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: { ...typography.body, fontWeight: "700", color: colors.primaryDeepest },
  statsRow: { gap: spacing.sm },
  statsRowTablet: { flexDirection: "row", flexWrap: "wrap" },
  statCard: {
    flex: 1,
    minWidth: 170,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.lg,
    ...shadow.sm,
  },
  statLabel: { ...typography.label, color: colors.stone400 },
  statValue: { marginTop: spacing.sm, ...typography.h4, color: colors.primaryDeepest },
  detailGrid: { gap: spacing.md },
  detailGridDesktop: { flexDirection: "row", alignItems: "flex-start" },
  mainColumn: { flex: 1.15, gap: spacing.lg },
  sideColumn: { flex: 0.85, gap: spacing.lg },
  surfaceCard: {
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.lg,
    ...shadow.sm,
  },
  sectionEyebrow: { ...typography.label, color: colors.primary },
  sectionTitle: { marginTop: spacing.sm, ...typography.h3, color: colors.primaryDeepest },
  sectionBody: { marginTop: spacing.md, ...typography.body, color: colors.stone500 },
  planStack: { marginTop: spacing.lg, gap: spacing.md },
  planCard: {
    borderRadius: radii.xl,
    overflow: "hidden",
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  planImage: { width: "100%", height: 180 },
  planImageFallback: { width: "100%", height: 180, backgroundColor: colors.surfaceMuted },
  planBody: { padding: spacing.md },
  planTitle: { ...typography.h4, color: colors.primaryDeepest },
  planCopy: { marginTop: spacing.sm, ...typography.body, color: colors.stone500 },
  sideTitle: { ...typography.h4, color: colors.primaryDeepest },
  listItem: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, marginTop: spacing.lg },
  listItemText: { flex: 1, ...typography.body, color: colors.stone500 },
  mutedText: { marginTop: spacing.md, ...typography.body, color: colors.stone500 },
  actionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  actionBarPhone: {
    padding: spacing.xs,
    alignItems: "stretch",
  },
  actionIcon: {
    width: 46,
    height: 46,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  actionSecondary: {
    minWidth: 88,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  actionSecondaryText: { ...typography.body, fontWeight: "700", color: colors.primaryDeepest },
  actionPrimary: {
    flex: 1,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  actionPrimaryText: { ...typography.body, fontWeight: "800", color: colors.white },
});
