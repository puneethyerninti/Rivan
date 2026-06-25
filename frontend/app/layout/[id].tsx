import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { colors, formatINR, plotStatusColor, plotStatusLabel, radii, shadow, spacing, typography } from "@/src/theme";

const STATUS_KEYS = ["all", "available", "reserved", "booked", "sold"] as const;
type StatusKey = (typeof STATUS_KEYS)[number];

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const normalized = Number(value.replace(/[^\d.]/g, ""));
      if (Number.isFinite(normalized) && normalized > 0) return normalized;
    }
  }
  return undefined;
}

function normalizeUnits(payload: any[]) {
  return payload.map((item: any) => ({
    id: firstString(item.id, item._id),
    number: firstString(item.plot_number, item.plot_no, item.unit_number, item.name),
    status: firstString(item.status, "available").toLowerCase(),
    size: firstString(item.size, item.area, item.size_sqy ? `${item.size_sqy} sq yd` : ""),
    facing: firstString(item.facing, item.orientation),
    price: firstNumber(item.price, item.base_price, item.starting_price),
    propertyId: firstString(item.property_id, item.propertyId),
    tower: firstString(item.tower),
    floor: firstString(item.floor),
    type: firstString(item.unit_type, item.type, "plot"),
  }));
}

function StatusChip({
  label,
  active,
  onPress,
  color,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  color: string;
}) {
  return (
    <TouchableOpacity style={[styles.statusChip, active && styles.statusChipActive]} onPress={onPress}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={[styles.statusChipText, active && styles.statusChipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function LayoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1080;
  const isPhone = width < 520;

  const isAgent = user?.role === "agent" || user?.role === "sub_agent";
  const [property, setProperty] = useState<NormalizedProperty | null>(null);
  const [units, setUnits] = useState<any[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<StatusKey>("all");
  const [selectedUnit, setSelectedUnit] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [propertyPayload, unitsPayload] = await Promise.all([
          api.getProperty(id as string),
          api.getPropertyPlots(id as string),
        ]);
        if (!active) return;
        setProperty(enrichProperty(normalizePropertyRecord(propertyPayload)));
        setUnits(normalizeUnits(Array.isArray(unitsPayload) ? unitsPayload : []));
      } catch (error: any) {
        if (active) {
          Alert.alert("Layout", error?.message || "Unable to load this property layout.");
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

  const mappedLayoutUnits = useMemo(() => {
    if (!property?.mapBlocks?.length) return [];

    return property.mapBlocks.map((block) => {
      const backendUnit =
        units.find((unit) => unit.number === `P-${String(block.label).padStart(3, "0")}`) ||
        units.find((unit) => unit.number === block.label);

      return {
        id: backendUnit?.id || block.id,
        number: backendUnit?.number || `P-${String(block.label).padStart(3, "0")}`,
        status: (backendUnit?.status || block.status || "available").toLowerCase(),
        size: backendUnit?.size || block.size,
        facing: backendUnit?.facing || block.facing,
        price: backendUnit?.price || block.price,
        propertyId: backendUnit?.propertyId || property.id,
        x: block.x,
        y: block.y,
        w: block.w,
        h: block.h,
        hasBackendBooking: Boolean(backendUnit?.id),
      };
    });
  }, [property, units]);

  const filteredUnits = useMemo(() => {
    if (mappedLayoutUnits.length) {
      if (selectedStatus === "all") return mappedLayoutUnits;
      return mappedLayoutUnits.filter((unit) => unit.status === selectedStatus);
    }
    if (selectedStatus === "all") return units;
    return units.filter((unit) => unit.status === selectedStatus);
  }, [mappedLayoutUnits, selectedStatus, units]);

  const counts = useMemo(() => {
    const source = mappedLayoutUnits.length ? mappedLayoutUnits : units;
    return STATUS_KEYS.reduce<Record<string, number>>((acc, key) => {
      acc[key] = key === "all" ? source.length : source.filter((unit) => unit.status === key).length;
      return acc;
    }, {});
  }, [mappedLayoutUnits, units]);

  function handleVisit(unit: any) {
    if (isAgent) {
      router.push({
        pathname: "/agent" as never,
        params: {
          action: "visit",
          propertyId: String(unit.propertyId || property?.id || ""),
          assetId: String(unit.id || ""),
        },
      });
      return;
    }
    router.push(`/centre/site-${unit.propertyId || property?.id}`);
  }

  function handleBook(unit: any) {
    if (!unit?.hasBackendBooking && !String(unit?.id || "").startsWith("plot-")) {
      Alert.alert("Booking", "This plot is visible in the layout map, but live booking is not open for it yet. You can still schedule a visit.");
      return;
    }

    if (isAgent) {
      router.push({
        pathname: "/agent" as never,
        params: {
          action: "booking",
          propertyId: String(unit.propertyId || property?.id || ""),
          assetId: String(unit.id || ""),
        },
      });
      return;
    }
    router.push(`/booking/${unit.id}`);
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
      <ScrollView contentContainerStyle={[styles.content, isPhone && styles.contentPhone]} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
            <Feather name="arrow-left" size={18} color={colors.primaryDeepest} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>{property?.name || "Property layout"}</Text>
            <Text style={styles.headerBody}>Availability explorer</Text>
          </View>
          <TouchableOpacity style={styles.headerButton} onPress={() => router.push(`/property/${id}`)}>
            <Feather name="home" size={18} color={colors.primaryDeepest} />
          </TouchableOpacity>
        </View>

        <View style={[styles.heroCard, isDesktop && styles.heroCardDesktop, isPhone && styles.heroCardPhone]}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>Interactive availability</Text>
            <Text style={styles.heroTitle}>Siripuram Gardens layout explorer with live square-box availability.</Text>
            <Text style={styles.heroBody}>
              Browse the plotted estate through the real Siripuram square-grid structure while keeping the same visit scheduling and booking flow already used across the platform.
            </Text>
          </View>

          <View style={[styles.heroStats, isPhone && styles.heroStatsPhone]}>
            <View style={styles.heroStatCard}>
              <Text style={styles.heroStatValue}>{counts.all}</Text>
              <Text style={styles.heroStatLabel}>Total plots</Text>
            </View>
            <View style={styles.heroStatCard}>
              <Text style={styles.heroStatValue}>{counts.available}</Text>
              <Text style={styles.heroStatLabel}>Available</Text>
            </View>
            <View style={styles.heroStatCard}>
              <Text style={styles.heroStatValue}>{counts.booked + counts.sold}</Text>
              <Text style={styles.heroStatLabel}>Closed inventory</Text>
            </View>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRail}>
          {STATUS_KEYS.map((statusKey) => (
            <StatusChip
              key={statusKey}
              label={statusKey === "all" ? `All (${counts.all})` : `${plotStatusLabel(statusKey)} (${counts[statusKey]})`}
              active={selectedStatus === statusKey}
              onPress={() => setSelectedStatus(statusKey)}
              color={statusKey === "all" ? colors.stone400 : plotStatusColor(statusKey)}
            />
          ))}
        </ScrollView>

        {mappedLayoutUnits.length ? (
          <View style={[styles.mapShell, isPhone && styles.mapShellPhone]}>
            <Text style={styles.mapTitle}>Siripuram Gardens Plot Layout</Text>
            <Text style={styles.mapBody}>Select a plot block to view its facing, size, and next available customer or agent action.</Text>
            <View style={[styles.mapCanvas, isPhone && styles.mapCanvasPhone]}>
              {filteredUnits.map((unit) => (
                <TouchableOpacity
                  key={unit.id}
                  style={[
                    styles.mapPlot,
                    {
                      left: `${unit.x}%`,
                      top: `${unit.y}%`,
                      width: `${unit.w}%`,
                      height: `${unit.h}%`,
                      backgroundColor: `${plotStatusColor(unit.status)}18`,
                      borderColor: plotStatusColor(unit.status),
                    },
                  ]}
                  activeOpacity={0.9}
                  onPress={() => setSelectedUnit(unit)}
                >
                  <Text style={[styles.mapPlotNumber, { color: plotStatusColor(unit.status) }]}>
                    {String(unit.number || "").replace("P-", "")}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <View style={[styles.unitGrid, isDesktop && styles.unitGridDesktop]}>
            {filteredUnits.map((unit) => (
              <TouchableOpacity key={unit.id} style={styles.unitCard} activeOpacity={0.94} onPress={() => setSelectedUnit(unit)}>
                <View style={[styles.unitStatusBar, { backgroundColor: plotStatusColor(unit.status) }]} />
                <View style={styles.unitCardBody}>
                  <View style={styles.unitTopRow}>
                    <Text style={styles.unitNumber}>{unit.number || "Unit"}</Text>
                    <View style={[styles.unitStatusPill, { backgroundColor: `${plotStatusColor(unit.status)}22` }]}>
                      <Text style={[styles.unitStatusText, { color: plotStatusColor(unit.status) }]}>{plotStatusLabel(unit.status)}</Text>
                    </View>
                  </View>
                  <Text style={styles.unitMeta}>{unit.size || "Size on request"}</Text>
                  <Text style={styles.unitMeta}>{unit.facing || "Facing not specified"}</Text>
                  <Text style={styles.unitPrice}>{unit.price ? formatINR(unit.price) : "Price on request"}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {!filteredUnits.length ? (
          <View style={styles.emptyState}>
            <Feather name="inbox" size={42} color={colors.stone300} />
            <Text style={styles.emptyTitle}>No plots in this status</Text>
            <Text style={styles.emptyBody}>Try another availability filter.</Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal transparent visible={Boolean(selectedUnit)} animationType="fade" onRequestClose={() => setSelectedUnit(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, isPhone && styles.modalCardPhone]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalTitle}>{selectedUnit?.number || "Selected plot"}</Text>
                <Text style={styles.modalSubtitle}>{property?.name || "Property"}</Text>
              </View>
              <TouchableOpacity style={styles.modalClose} onPress={() => setSelectedUnit(null)}>
                <Feather name="x" size={18} color={colors.primaryDeepest} />
              </TouchableOpacity>
            </View>

            <View style={[styles.modalGrid, isPhone && styles.modalGridPhone]}>
              <InfoTile label="Status" value={selectedUnit ? plotStatusLabel(selectedUnit.status) : "-"} />
              <InfoTile label="Size" value={selectedUnit?.size || "-"} />
              <InfoTile label="Facing" value={selectedUnit?.facing || "-"} />
              <InfoTile label="Price" value={selectedUnit?.price ? formatINR(selectedUnit.price) : "On request"} />
            </View>

            <View style={[styles.modalActions, isPhone && styles.modalActionsPhone]}>
              <TouchableOpacity style={styles.modalSecondary} onPress={() => selectedUnit && handleVisit(selectedUnit)}>
                <Text style={styles.modalSecondaryText}>Schedule visit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalPrimary,
                  (selectedUnit?.status !== "available" || (!selectedUnit?.hasBackendBooking && !String(selectedUnit?.id || "").startsWith("plot-"))) &&
                    styles.modalDisabled,
                ]}
                onPress={() => selectedUnit?.status === "available" && handleBook(selectedUnit)}
                disabled={
                  selectedUnit?.status !== "available" ||
                  (!selectedUnit?.hasBackendBooking && !String(selectedUnit?.id || "").startsWith("plot-"))
                }
              >
                <Text style={styles.modalPrimaryText}>
                  {!selectedUnit?.hasBackendBooking && !String(selectedUnit?.id || "").startsWith("plot-")
                    ? "Visit only"
                    : isAgent
                      ? "Create booking"
                      : selectedUnit?.status === "available"
                        ? "Book this plot"
                        : "Not available"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoTile}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.offWhite },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  contentPhone: { padding: spacing.md, paddingBottom: spacing.xxl },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1 },
  headerTitle: { ...typography.h3, color: colors.primaryDeepest },
  headerBody: { ...typography.small, color: colors.stone500, marginTop: 2 },
  heroCard: {
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadow.md,
  },
  heroCardPhone: {
    borderRadius: 18,
    padding: spacing.lg,
  },
  heroCardDesktop: { flexDirection: "row", alignItems: "stretch" },
  heroCopy: { flex: 1, gap: spacing.sm },
  heroEyebrow: { ...typography.label, color: colors.primary },
  heroTitle: { ...typography.h3, color: colors.primaryDeepest },
  heroBody: { ...typography.body, color: colors.stone500 },
  heroStats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, flex: 0.92 },
  heroStatsPhone: { gap: spacing.sm },
  heroStatCard: {
    flex: 1,
    minWidth: 120,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
  },
  heroStatValue: { ...typography.h3, color: colors.primaryDeepest },
  heroStatLabel: { ...typography.small, color: colors.stone500, marginTop: spacing.xs },
  chipRail: { gap: spacing.sm, paddingBottom: spacing.xs },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  statusChipActive: { backgroundColor: colors.primaryDeepest, borderColor: colors.primaryDeepest },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusChipText: { ...typography.small, fontWeight: "700", color: colors.primaryDeepest },
  statusChipTextActive: { color: colors.white },
  mapShell: {
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.sm,
  },
  mapShellPhone: {
    borderRadius: 18,
    padding: spacing.md,
  },
  mapTitle: { ...typography.h4, color: colors.primaryDeepest },
  mapBody: { ...typography.body, color: colors.stone500, maxWidth: 760 },
  mapCanvas: {
    position: "relative",
    width: "100%",
    minHeight: 700,
    borderRadius: 20,
    backgroundColor: "#FBF8F2",
    borderWidth: 1,
    borderColor: colors.borderSoft,
    overflow: "hidden",
  },
  mapCanvasPhone: {
    minHeight: 460,
  },
  mapPlot: {
    position: "absolute",
    borderWidth: 1,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  mapPlotNumber: { fontSize: 9, lineHeight: 11, fontWeight: "800" },
  unitGrid: { gap: spacing.md },
  unitGridDesktop: { flexDirection: "row", flexWrap: "wrap" },
  unitCard: {
    width: "100%",
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    ...shadow.sm,
  },
  unitStatusBar: { height: 6, width: "100%" },
  unitCardBody: { padding: spacing.lg },
  unitTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  unitNumber: { ...typography.h4, color: colors.primaryDeepest },
  unitStatusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.pill },
  unitStatusText: { ...typography.small, fontWeight: "800" },
  unitMeta: { ...typography.small, color: colors.stone500, marginTop: spacing.sm },
  unitPrice: { marginTop: spacing.lg, ...typography.body, color: colors.primary, fontWeight: "800" },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  emptyTitle: { marginTop: spacing.md, ...typography.h4, color: colors.primaryDeepest },
  emptyBody: { marginTop: spacing.sm, ...typography.body, color: colors.stone500 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(6,15,11,0.36)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modalCard: {
    width: "100%",
    maxWidth: 480,
    borderRadius: 22,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.lg,
    ...shadow.lg,
  },
  modalCardPhone: {
    borderRadius: 18,
    padding: spacing.md,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md },
  modalHeaderCopy: { flex: 1 },
  modalTitle: { ...typography.h3, color: colors.primaryDeepest },
  modalSubtitle: { ...typography.body, color: colors.stone500, marginTop: 4 },
  modalClose: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  modalGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  modalGridPhone: { gap: spacing.xs },
  infoTile: {
    width: "48%",
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.lg,
  },
  infoLabel: { ...typography.label, color: colors.stone400 },
  infoValue: { marginTop: spacing.sm, ...typography.body, color: colors.primaryDeepest, fontWeight: "700" },
  modalActions: { flexDirection: "row", gap: spacing.sm },
  modalActionsPhone: { flexDirection: "column" },
  modalSecondary: {
    flex: 1,
    minHeight: 50,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  modalSecondaryText: { ...typography.body, fontWeight: "700", color: colors.primaryDeepest },
  modalPrimary: {
    flex: 1,
    minHeight: 50,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  modalDisabled: { backgroundColor: colors.stone300 },
  modalPrimaryText: { ...typography.body, fontWeight: "800", color: colors.white },
});
