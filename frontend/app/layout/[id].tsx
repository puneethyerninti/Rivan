import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { colors, radii, spacing, typography, shadow, plotStatusColor, plotStatusLabel, formatINR, formatINRFull } from "@/src/theme";

const STATUS_KEYS = ["all", "available", "reserved", "booked", "sold"] as const;
type StatusKey = (typeof STATUS_KEYS)[number];

function extractNumericSize(size?: string) {
  if (!size) return null;
  const match = size.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function normalizePlotUnits(units: any[]) {
  const autoCols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(Math.max(units.length, 1)))));
  return units.map((unit, index) => ({
    ...unit,
    row: typeof unit.row === "number" ? unit.row : Math.floor(index / autoCols),
    col: typeof unit.col === "number" ? unit.col : index % autoCols,
    size_sqy: unit.size_sqy || extractNumericSize(unit.size),
  }));
}

export default function LayoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const isDesktop = width >= 1100;
  const isAgent = user?.role === "agent" || user?.role === "sub_agent";

  const [property, setProperty] = useState<any>(null);
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [filter, setFilter] = useState<StatusKey>("all");
  const [activeTower, setActiveTower] = useState<string | null>(null);
  const [activeFloor, setActiveFloor] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [propertyRes, unitsRes] = await Promise.all([api.getProperty(id as string), api.getPropertyPlots(id as string)]);
        const loadedUnits = unitsRes as any[];
        setProperty(propertyRes);
        setUnits(loadedUnits);
        const firstTower = loadedUnits.find((unit) => unit.tower)?.tower;
        if (firstTower) setActiveTower(firstTower);
        setSelected(null);
      } catch (e: any) {
        Alert.alert("Error", e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const unitType = units[0]?.unit_type || "plot";
  const openCount = units.filter((unit) => unit.status === "available").length;

  function handleVisit(unit: any) {
    if (isAgent) {
      router.push(`/agent?action=visit&propertyId=${unit.property_id}&assetId=${unit.id}`);
      return;
    }
    router.push(`/centre/site-${unit.property_id}`);
  }

  function handleBook(unit: any) {
    if (isAgent) {
      router.push(`/agent?action=booking&propertyId=${unit.property_id}&assetId=${unit.id}`);
      return;
    }
    router.push(`/booking/${unit.id}`);
  }

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="layout-screen">
      <View style={styles.header}>
        <TouchableOpacity
          testID="layout-back-button"
          style={styles.headerBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="arrow-left" size={20} color={colors.primaryDeepest} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{property?.name}</Text>
          <Text style={styles.headerSub}>Interactive property layout</Text>
        </View>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() =>
            Alert.alert(
              "Availability",
              "Green is available, amber is reserved, blue is booked, and red is sold."
            )
          }
          accessibilityRole="button"
          accessibilityLabel="Open availability legend"
        >
          <Feather name="layers" size={20} color={colors.primaryDeepest} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.pageScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.pageShell}>
          <View style={styles.mapCard}>
            <View style={styles.mapHeaderBar}>
              <View style={styles.mapLocationChip}>
                <Feather name="map-pin" size={14} color={colors.primary} />
                <Text style={styles.mapLocationText} numberOfLines={1}>
                  {property?.location || "Project location"}
                </Text>
              </View>
              <View style={styles.mapOpenChip}>
                <Feather name="navigation" size={13} color={colors.accentDark} />
                <Text style={styles.mapOpenText}>{openCount} open</Text>
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.legendScroll}>
              {STATUS_KEYS.map((statusKey) => (
                <LegendPill
                  key={statusKey}
                  label={statusKey === "all" ? "All" : statusKey.charAt(0).toUpperCase() + statusKey.slice(1)}
                  color={statusKey === "all" ? colors.stone400 : plotStatusColor(statusKey)}
                  active={filter === statusKey}
                  onPress={() => setFilter(statusKey)}
                  testID={`layout-filter-${statusKey}`}
                />
              ))}
            </ScrollView>

            <View style={styles.mapCanvasShell}>
              {unitType === "plot" ? (
                <PlotGrid
                  units={units}
                  filter={filter}
                  onSelect={setSelected}
                  selectedId={selected?.id}
                  isTablet={isTablet}
                  isDesktop={isDesktop}
                />
              ) : unitType === "flat" ? (
                <FlatTowerView
                  units={units}
                  filter={filter}
                  activeTower={activeTower}
                  setActiveTower={setActiveTower}
                  activeFloor={activeFloor}
                  setActiveFloor={setActiveFloor}
                  onSelect={setSelected}
                  selectedId={selected?.id}
                  isTablet={isTablet}
                />
              ) : unitType === "villa" ? (
                <CardGrid units={units} filter={filter} onSelect={setSelected} kind="villa" selectedId={selected?.id} isTablet={isTablet} />
              ) : unitType === "shop" ? (
                <FloorGroupedCards units={units} filter={filter} onSelect={setSelected} kind="shop" selectedId={selected?.id} isTablet={isTablet} />
              ) : unitType === "farm" ? (
                <CardGrid units={units} filter={filter} onSelect={setSelected} kind="farm" selectedId={selected?.id} isTablet={isTablet} />
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>No map data available.</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </ScrollView>

      <UnitDetailModal
        selected={selected}
        property={property}
        onClose={() => setSelected(null)}
        onBook={handleBook}
        onVisit={handleVisit}
      />
    </SafeAreaView>
  );
}

function LegendPill({
  label,
  color,
  active,
  onPress,
  testID,
}: {
  label: string;
  color: string;
  active: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      style={[styles.legendPill, active && styles.legendPillActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} filter`}
    >
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendLabel, active && styles.legendLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function PlotGrid({
  units,
  filter,
  onSelect,
  selectedId,
  isTablet,
  isDesktop,
}: {
  units: any[];
  filter: StatusKey;
  onSelect: (unit: any) => void;
  selectedId?: string;
  isTablet: boolean;
  isDesktop: boolean;
}) {
  const normalizedUnits = useMemo(() => normalizePlotUnits(units), [units]);
  const cols = Math.max(...normalizedUnits.map((unit) => unit.col)) + 1;
  const rows = Math.max(...normalizedUnits.map((unit) => unit.row)) + 1;
  const plotSize = isDesktop ? 94 : isTablet ? 84 : 70;

  return (
    <ScrollView style={styles.mapScroll} contentContainerStyle={styles.mapScrollContent}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.plotBoardScroll}>
        <View style={styles.plotBoardWrap}>
          <View style={styles.mapNorthPill}>
            <Feather name="navigation" size={12} color={colors.primaryDeepest} />
            <Text style={styles.mapNorthText}>North</Text>
          </View>

          <View style={[styles.mainRoad, { width: cols * (plotSize + 10) + 34 }]}>
            <View style={styles.roadStripe} />
            <View style={styles.roadStripe} />
          </View>

          <View style={styles.plotBodyRow}>
            <View style={[styles.internalRoad, { height: rows * (plotSize + 10) }]} />

            <View style={styles.plotGridShell}>
              {Array.from({ length: rows }).map((_, rowIndex) => (
                <View key={rowIndex} style={styles.plotRow}>
                  {Array.from({ length: cols }).map((_, colIndex) => {
                    const plot = normalizedUnits.find((unit) => unit.row === rowIndex && unit.col === colIndex);
                    if (!plot) {
                      return <View key={`empty-${rowIndex}-${colIndex}`} style={[styles.plotSpacer, { width: plotSize, height: plotSize }]} />;
                    }

                    const visible = filter === "all" || plot.status === filter;
                    const isSelected = selectedId === plot.id;

                    return (
                      <TouchableOpacity
                        key={plot.id}
                        testID={`layout-plot-${plot.id}`}
                        style={[
                          styles.plotCell,
                          {
                            width: plotSize,
                            height: plotSize,
                            backgroundColor: visible ? plotStatusColor(plot.status) : colors.stone300,
                            opacity: visible ? 1 : 0.4,
                          },
                          isSelected && styles.plotCellSelected,
                        ]}
                        onPress={() => onSelect(plot)}
                        activeOpacity={0.88}
                        accessibilityRole="button"
                        accessibilityLabel={`${plot.plot_number}, ${plotStatusLabel(plot.status)}, ${plot.size || ""}`}
                      >
                        <Text style={styles.plotNumber}>{plot.plot_number.replace("P-", "").replace("L-", "")}</Text>
                        <Text style={styles.plotSize}>{plot.size_sqy ? `${plot.size_sqy}` : plot.size}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </ScrollView>
  );
}

function FlatTowerView({
  units,
  filter,
  activeTower,
  setActiveTower,
  activeFloor,
  setActiveFloor,
  onSelect,
  selectedId,
  isTablet,
}: {
  units: any[];
  filter: StatusKey;
  activeTower: string | null;
  setActiveTower: (tower: string) => void;
  activeFloor: number | null;
  setActiveFloor: (floor: number | null) => void;
  onSelect: (unit: any) => void;
  selectedId?: string;
  isTablet: boolean;
}) {
  const towers = Array.from(new Set(units.map((unit) => unit.tower).filter(Boolean))).sort();
  const towerUnits = units.filter((unit) => unit.tower === activeTower);
  const floors = Array.from(new Set(towerUnits.map((unit) => unit.floor))).sort((a, b) => b - a);
  const floorUnits = activeFloor != null ? towerUnits.filter((unit) => unit.floor === activeFloor) : [];

  return (
    <ScrollView style={styles.mapScroll} contentContainerStyle={styles.flatContent}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.controlScroll}>
        {towers.map((tower) => {
          const active = activeTower === tower;
          return (
            <TouchableOpacity
              key={tower}
              testID={`layout-tower-${tower}`}
              style={[styles.controlChip, active && styles.controlChipActive]}
              onPress={() => {
                setActiveTower(tower);
                setActiveFloor(null);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Select tower ${tower}`}
            >
              <Text style={[styles.controlChipText, active && styles.controlChipTextActive]}>Tower {tower}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.controlScroll}>
        {floors.map((floor) => {
          const active = activeFloor === floor;
          return (
            <TouchableOpacity
              key={floor}
              testID={`layout-floor-${floor}`}
              style={[styles.controlChip, active && styles.controlChipActive]}
              onPress={() => setActiveFloor(active ? null : floor)}
              accessibilityRole="button"
              accessibilityLabel={`Select floor ${floor}`}
            >
              <Text style={[styles.controlChipText, active && styles.controlChipTextActive]}>Floor {floor}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.flatGrid}>
        {(activeFloor == null ? towerUnits : floorUnits).map((unit) => {
          const visible = filter === "all" || unit.status === filter;
          const active = selectedId === unit.id;
          return (
            <TouchableOpacity
              key={unit.id}
              testID={`layout-flat-${unit.id}`}
              style={[
                styles.flatCell,
                { backgroundColor: visible ? plotStatusColor(unit.status) : colors.stone300, opacity: visible ? 1 : 0.4 },
                active && styles.flatCellSelected,
              ]}
              onPress={() => onSelect(unit)}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel={`Flat ${unit.flat_number}, ${plotStatusLabel(unit.status)}, ${unit.bhk}`}
            >
              <Text style={styles.flatNumber}>{unit.flat_number}</Text>
              <Text style={styles.flatMeta}>{unit.bhk}</Text>
              <Text style={styles.flatMeta}>{unit.size_sqft} sqft</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

function CardGrid({
  units,
  filter,
  onSelect,
  kind,
  selectedId,
  isTablet,
}: {
  units: any[];
  filter: StatusKey;
  onSelect: (unit: any) => void;
  kind: "villa" | "farm";
  selectedId?: string;
  isTablet: boolean;
}) {
  const filteredUnits = filter === "all" ? units : units.filter((unit) => unit.status === filter);

  return (
    <ScrollView style={styles.mapScroll} contentContainerStyle={styles.cardGridContent}>
      <View style={styles.cardGrid}>
        {filteredUnits.map((unit) => {
          const active = selectedId === unit.id;
          return (
            <TouchableOpacity
              key={unit.id}
              testID={`layout-${kind}-${unit.id}`}
              style={[styles.unitCard, isTablet && styles.unitCardTablet, active && styles.unitCardSelected]}
              onPress={() => onSelect(unit)}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel={`${unit.plot_number}, ${plotStatusLabel(unit.status)}, ${unit.size}`}
            >
              <View style={[styles.unitMapHeader, { backgroundColor: plotStatusColor(unit.status) }]}>
                <Feather name={kind === "villa" ? "home" : "sun"} size={24} color={colors.white} />
                <View style={styles.unitStatusPill}>
                  <Text style={styles.unitStatusText}>{plotStatusLabel(unit.status)}</Text>
                </View>
              </View>
              <View style={styles.unitBody}>
                <Text style={styles.unitNumber}>{unit.plot_number}</Text>
                <Text style={styles.unitType}>{kind === "villa" ? unit.villa_type : `${unit.acres} acres`}</Text>
                <Text style={styles.unitMeta}>{unit.size} · {unit.facing}</Text>
                <Text style={styles.unitPrice}>{formatINR(unit.price)}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

function FloorGroupedCards({
  units,
  filter,
  onSelect,
  kind,
  selectedId,
  isTablet,
}: {
  units: any[];
  filter: StatusKey;
  onSelect: (unit: any) => void;
  kind: "shop";
  selectedId?: string;
  isTablet: boolean;
}) {
  const filteredUnits = filter === "all" ? units : units.filter((unit) => unit.status === filter);
  const floors = Array.from(new Set(filteredUnits.map((unit) => unit.floor))).sort((a, b) => a - b);

  return (
    <ScrollView style={styles.mapScroll} contentContainerStyle={styles.cardGridContent}>
      {floors.map((floor) => (
        <View key={floor} style={styles.floorSection}>
          <View style={styles.cardGrid}>
            {filteredUnits
              .filter((unit) => unit.floor === floor)
              .map((unit) => {
                const active = selectedId === unit.id;
                return (
                  <TouchableOpacity
                    key={unit.id}
                    testID={`layout-${kind}-${unit.id}`}
                    style={[styles.unitCard, isTablet && styles.unitCardTablet, active && styles.unitCardSelected]}
                    onPress={() => onSelect(unit)}
                    activeOpacity={0.9}
                    accessibilityRole="button"
                    accessibilityLabel={`${unit.plot_number}, ${plotStatusLabel(unit.status)}, ${unit.shop_type}`}
                  >
                    <View style={[styles.unitMapHeader, { backgroundColor: plotStatusColor(unit.status) }]}>
                      <Feather name="briefcase" size={22} color={colors.white} />
                      <View style={styles.unitFloorBadge}>
                        <Text style={styles.unitFloorText}>F{floor}</Text>
                      </View>
                    </View>
                    <View style={styles.unitBody}>
                      <Text style={styles.unitNumber}>{unit.plot_number}</Text>
                      <Text style={styles.unitType}>{unit.shop_type}</Text>
                      <Text style={styles.unitMeta}>{unit.size} · {unit.facing}</Text>
                      <Text style={styles.unitPrice}>{formatINR(unit.price)}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function UnitDetailModal({
  selected,
  property,
  onClose,
  onBook,
  onVisit,
}: {
  selected: any;
  property: any;
  onClose: () => void;
  onBook: (unit: any) => void;
  onVisit: (unit: any) => void;
}) {
  return (
    <Modal visible={!!selected} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} style={styles.modalBg} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalPlot}>
                {selected?.unit_type === "flat"
                  ? "Flat"
                  : selected?.unit_type === "villa"
                    ? "Villa"
                    : selected?.unit_type === "shop"
                      ? "Unit"
                      : selected?.unit_type === "farm"
                        ? "Parcel"
                        : "Plot"}{" "}
                {selected?.plot_number}
              </Text>
              <Text style={styles.modalProperty}>{property?.name}</Text>
            </View>
            <View style={[styles.modalStatus, { backgroundColor: plotStatusColor(selected?.status) }]}>
              <Text style={styles.modalStatusText}>{plotStatusLabel(selected?.status)}</Text>
            </View>
          </View>

          <View style={styles.modalGrid}>
            <ModalInfo icon="maximize-2" label="Size" value={selected?.size} />
            <ModalInfo icon="compass" label="Facing" value={selected?.facing} />
            <ModalInfo icon="hash" label="Survey No." value={selected?.survey_number} />
            <ModalInfo icon="map-pin" label="Location" value={property?.location} />
          </View>

          <View style={styles.modalPriceRow}>
            <Text style={styles.modalPriceLabel}>Price</Text>
            <Text style={styles.modalPriceValue}>{selected ? formatINRFull(selected.price) : ""}</Text>
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity testID="plot-modal-visit" style={[styles.modalIconBtn, styles.modalIconBtnAccent]} onPress={() => onVisit(selected)}>
              <Feather name="calendar" size={20} color={colors.accent} />
            </TouchableOpacity>
            {(selected?.status === "available" || selected?.status === "reserved") ? (
              <TouchableOpacity testID="plot-modal-book" style={styles.modalBookBtn} onPress={() => onBook(selected)}>
                <Text style={styles.modalBookText}>Book Now</Text>
                <Feather name="arrow-right" size={16} color={colors.white} />
              </TouchableOpacity>
            ) : (
              <View style={[styles.modalBookBtn, styles.modalBookBtnDisabled]}>
                <Feather name="lock" size={16} color={colors.stone600} />
                <Text style={[styles.modalBookText, { color: colors.stone600 }]}>{plotStatusLabel(selected?.status)}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function ModalInfo({ icon, label, value }: { icon: any; label: string; value?: string }) {
  return (
    <View style={styles.modalInfo}>
      <Feather name={icon} size={14} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.modalInfoLabel}>{label}</Text>
        <Text style={styles.modalInfoValue} numberOfLines={1}>{value || "-"}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.offWhite },
  loader: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.white },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.stone100,
  },
  headerBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.offWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1 },
  headerTitle: { ...typography.h4, color: colors.primaryDeepest, fontWeight: "700" },
  headerSub: { ...typography.small, color: colors.stone500, marginTop: 2 },
  pageScroll: { padding: spacing.md, paddingBottom: spacing.xl },
  pageShell: { width: "100%", maxWidth: 1320, alignSelf: "center" },
  mapCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.stone100,
    padding: spacing.md,
    gap: spacing.md,
    minHeight: 560,
    ...shadow.md,
  },
  mapHeaderBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  mapLocationChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.offWhite,
    borderRadius: radii.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: "78%",
  },
  mapLocationText: { ...typography.small, color: colors.primaryDeepest, fontWeight: "700" },
  mapOpenChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.accentSoft,
    borderRadius: radii.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mapOpenText: { ...typography.small, color: colors.accentDark, fontWeight: "700" },
  legendScroll: { gap: spacing.sm },
  legendPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radii.full,
    backgroundColor: colors.offWhite,
    borderWidth: 1,
    borderColor: colors.stone100,
  },
  legendPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { ...typography.small, color: colors.stone700, fontWeight: "600" },
  legendLabelActive: { color: colors.white },
  mapCanvasShell: {
    flex: 1,
    borderRadius: radii.lg,
    backgroundColor: "#EEF3EF",
    overflow: "hidden",
  },
  mapScroll: { flex: 1 },
  mapScrollContent: { paddingBottom: spacing.sm },
  plotBoardScroll: { paddingBottom: spacing.sm },
  plotBoardWrap: { gap: 10, paddingRight: spacing.sm, paddingTop: spacing.xs },
  mapNorthPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.white,
    borderRadius: radii.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.stone100,
  },
  mapNorthText: { ...typography.small, color: colors.primaryDeepest, fontWeight: "700" },
  mainRoad: {
    height: 42,
    backgroundColor: "#BFC6BF",
    borderRadius: radii.md,
    marginLeft: 36,
    justifyContent: "space-around",
    paddingHorizontal: spacing.md,
  },
  roadStripe: { height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.92)" },
  plotBodyRow: { flexDirection: "row", alignItems: "stretch" },
  internalRoad: {
    width: 30,
    marginRight: 8,
    backgroundColor: "#BFC6BF",
    borderRadius: radii.md,
  },
  plotGridShell: {
    backgroundColor: "#E6EEE8",
    borderRadius: radii.lg,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: "#D7E2D9",
  },
  plotRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  plotCell: {
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    ...shadow.sm,
  },
  plotCellSelected: { borderWidth: 3, borderColor: colors.white, transform: [{ scale: 1.03 }] },
  plotSpacer: { borderRadius: radii.md, opacity: 0 },
  plotNumber: { color: colors.white, fontSize: 15, fontWeight: "800" },
  plotSize: { color: "rgba(255,255,255,0.92)", fontSize: 10, fontWeight: "700", marginTop: 2 },
  flatContent: { paddingBottom: spacing.sm },
  controlScroll: { gap: spacing.sm, paddingBottom: spacing.sm },
  controlChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.full,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.stone200,
  },
  controlChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  controlChipText: { ...typography.small, color: colors.primaryDeepest, fontWeight: "700" },
  controlChipTextActive: { color: colors.white },
  flatGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  flatCell: {
    width: 128,
    minHeight: 96,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.sm,
    ...shadow.sm,
  },
  flatCellSelected: { borderWidth: 3, borderColor: colors.white, transform: [{ scale: 1.03 }] },
  flatNumber: { color: colors.white, fontSize: 15, fontWeight: "800" },
  flatMeta: { color: "rgba(255,255,255,0.92)", fontSize: 10, fontWeight: "700", marginTop: 2 },
  cardGridContent: { paddingBottom: spacing.sm },
  cardGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  floorSection: { marginBottom: spacing.md },
  unitCard: {
    width: "100%",
    backgroundColor: colors.offWhite,
    borderRadius: radii.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.stone100,
  },
  unitCardTablet: { width: "48%" },
  unitCardSelected: { borderColor: colors.primary, borderWidth: 2, ...shadow.md },
  unitMapHeader: { height: 108, alignItems: "center", justifyContent: "center", position: "relative" },
  unitStatusPill: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.28)",
    borderRadius: radii.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  unitStatusText: { fontSize: 9, color: colors.white, fontWeight: "800", letterSpacing: 0.6 },
  unitFloorBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: radii.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  unitFloorText: { fontSize: 9, color: colors.white, fontWeight: "800", letterSpacing: 0.6 },
  unitBody: { padding: spacing.md, gap: 4 },
  unitNumber: { ...typography.bodyLarge, color: colors.primaryDeepest, fontWeight: "700" },
  unitType: { ...typography.small, color: colors.primary, fontWeight: "700" },
  unitMeta: { ...typography.small, color: colors.stone500 },
  unitPrice: { ...typography.body, color: colors.primary, fontWeight: "800", marginTop: 4 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.xl },
  emptyStateText: { ...typography.body, color: colors.stone500 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.42)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md,
    maxHeight: "84%",
  },
  modalHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: colors.stone200, alignSelf: "center" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm },
  modalPlot: { ...typography.h2, color: colors.primaryDeepest, fontWeight: "800" },
  modalProperty: { ...typography.small, color: colors.stone500, marginTop: 2 },
  modalStatus: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.full },
  modalStatusText: { color: colors.white, fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  modalGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  modalInfo: {
    flexBasis: "47%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: spacing.sm,
    backgroundColor: colors.offWhite,
    borderRadius: radii.md,
  },
  modalInfoLabel: { ...typography.small, color: colors.stone500, fontSize: 11 },
  modalInfoValue: { ...typography.body, color: colors.primaryDeepest, fontWeight: "700" },
  modalPriceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
  },
  modalPriceLabel: { ...typography.body, color: "rgba(255,255,255,0.78)", fontWeight: "600" },
  modalPriceValue: { ...typography.h2, color: colors.white, fontWeight: "800" },
  modalActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  modalIconBtn: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: "#E8F9EF",
    alignItems: "center",
    justifyContent: "center",
  },
  modalIconBtnAccent: { backgroundColor: colors.accentSoft },
  modalBookBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 14,
  },
  modalBookBtnDisabled: { backgroundColor: colors.stone300 },
  modalBookText: { ...typography.body, color: colors.white, fontWeight: "700" },
});
