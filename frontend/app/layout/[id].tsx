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
        setProperty(normalizePropertyRecord(propertyPayload));
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

  const filteredUnits = useMemo(() => {
    if (selectedStatus === "all") return units;
    return units.filter((unit) => unit.status === selectedStatus);
  }, [selectedStatus, units]);

  const counts = useMemo(() => {
    return STATUS_KEYS.reduce<Record<string, number>>((acc, key) => {
      acc[key] = key === "all" ? units.length : units.filter((unit) => unit.status === key).length;
      return acc;
    }, {});
  }, [units]);

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
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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

        <View style={[styles.heroCard, isDesktop && styles.heroCardDesktop]}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>Interactive availability</Text>
            <Text style={styles.heroTitle}>Choose available units with a cleaner layout view.</Text>
            <Text style={styles.heroBody}>
              Instead of a dense technical map, this screen now surfaces inventory in a clearer, faster-to-scan format while preserving the same booking and visit actions.
            </Text>
          </View>

          <View style={styles.heroStats}>
            <View style={styles.heroStatCard}>
              <Text style={styles.heroStatValue}>{counts.all}</Text>
              <Text style={styles.heroStatLabel}>Total units</Text>
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

        <View style={[styles.unitGrid, isDesktop && styles.unitGridDesktop]}>
          {filteredUnits.map((unit) => (
            <TouchableOpacity
              key={unit.id}
              style={styles.unitCard}
              activeOpacity={0.94}
              onPress={() => setSelectedUnit(unit)}
            >
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
                {unit.tower || unit.floor ? (
                  <Text style={styles.unitMeta}>
                    {[unit.tower, unit.floor].filter(Boolean).join(" • ")}
                  </Text>
                ) : null}
                <Text style={styles.unitPrice}>{unit.price ? formatINR(unit.price) : "Price on request"}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {!filteredUnits.length ? (
          <View style={styles.emptyState}>
            <Feather name="inbox" size={42} color={colors.stone300} />
            <Text style={styles.emptyTitle}>No units in this status</Text>
            <Text style={styles.emptyBody}>Try another availability filter.</Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal transparent visible={Boolean(selectedUnit)} animationType="fade" onRequestClose={() => setSelectedUnit(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalTitle}>{selectedUnit?.number || "Selected unit"}</Text>
                <Text style={styles.modalSubtitle}>{property?.name || "Property"}</Text>
              </View>
              <TouchableOpacity style={styles.modalClose} onPress={() => setSelectedUnit(null)}>
                <Feather name="x" size={18} color={colors.primaryDeepest} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalGrid}>
              <InfoTile label="Status" value={selectedUnit ? plotStatusLabel(selectedUnit.status) : "-"} />
              <InfoTile label="Size" value={selectedUnit?.size || "-"} />
              <InfoTile label="Facing" value={selectedUnit?.facing || "-"} />
              <InfoTile label="Price" value={selectedUnit?.price ? formatINR(selectedUnit.price) : "On request"} />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalSecondary} onPress={() => selectedUnit && handleVisit(selectedUnit)}>
                <Text style={styles.modalSecondaryText}>Schedule visit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalPrimary, selectedUnit?.status !== "available" && styles.modalDisabled]}
                onPress={() => selectedUnit?.status === "available" && handleBook(selectedUnit)}
                disabled={selectedUnit?.status !== "available"}
              >
                <Text style={styles.modalPrimaryText}>
                  {isAgent ? "Create booking" : selectedUnit?.status === "available" ? "Book this unit" : "Not available"}
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
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.lg },
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
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.xxl,
    gap: spacing.xl,
    ...shadow.md,
  },
  heroCardDesktop: { flexDirection: "row", alignItems: "stretch" },
  heroCopy: { flex: 1, gap: spacing.sm },
  heroEyebrow: { ...typography.label, color: colors.primary },
  heroTitle: { ...typography.h2, color: colors.primaryDeepest },
  heroBody: { ...typography.body, color: colors.stone500 },
  heroStats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, flex: 0.92 },
  heroStatCard: {
    flex: 1,
    minWidth: 120,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.lg,
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
  unitGrid: { gap: spacing.md },
  unitGridDesktop: { flexDirection: "row", flexWrap: "wrap" },
  unitCard: {
    width: "100%",
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    ...shadow.sm,
  },
  unitStatusBar: { height: 6, width: "100%" },
  unitCardBody: { padding: spacing.xl },
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
    borderRadius: 28,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadow.lg,
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
  infoTile: {
    width: "48%",
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.lg,
  },
  infoLabel: { ...typography.label, color: colors.stone400 },
  infoValue: { marginTop: spacing.sm, ...typography.body, color: colors.primaryDeepest, fontWeight: "700" },
  modalActions: { flexDirection: "row", gap: spacing.sm },
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
