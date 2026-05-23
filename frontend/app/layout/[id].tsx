import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Linking, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { api } from "@/src/api";
import { colors, radii, spacing, typography, shadow, plotStatusColor, plotStatusLabel, formatINR, formatINRFull } from "@/src/theme";

const PLOT_SIZE = 76;
const FLAT_SIZE = 70;

export default function LayoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [property, setProperty] = useState<any>(null);
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [filter, setFilter] = useState<string>("all");
  // Apartment/flat tower selection
  const [activeTower, setActiveTower] = useState<string | null>(null);
  const [activeFloor, setActiveFloor] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [p, pl] = await Promise.all([api.getProperty(id as string), api.getPropertyPlots(id as string)]);
        setProperty(p);
        setUnits(pl as any[]);
        const firstTower = (pl as any[]).find((u) => u.tower)?.tower;
        if (firstTower) setActiveTower(firstTower);
      } catch (e: any) {
        Alert.alert("Error", e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const unitType = units[0]?.unit_type || "plot";

  const counts = useMemo(() => ({
    all: units.length,
    available: units.filter((u) => u.status === "available").length,
    reserved: units.filter((u) => u.status === "reserved").length,
    booked: units.filter((u) => u.status === "booked").length,
    sold: units.filter((u) => u.status === "sold").length,
  }), [units]);

  if (loading) return <View style={styles.loader}><ActivityIndicator color={colors.primary} size="large" /></View>;

  const screenTitle: Record<string, string> = {
    plot: "Interactive Plot Layout",
    flat: "Live Availability",
    villa: "Villa Availability",
    shop: "Commercial Availability",
    farm: "Farm Parcels",
  };

  function openWhatsApp(p: any) {
    const text = `Hi, I'm interested in ${p.plot_number} at ${property.name}.`;
    Linking.openURL(`https://wa.me/919876543210?text=${encodeURIComponent(text)}`);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="layout-screen">
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity testID="layout-back-button" style={styles.headerBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color={colors.primaryDeepest} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{property?.name}</Text>
          <Text style={styles.headerSub}>{screenTitle[unitType] || "Availability"}</Text>
        </View>
        <TouchableOpacity style={styles.headerBtn} onPress={() => Alert.alert("Status Legend", "🟢 Available — Open for booking\n🟡 Reserved — Hold by another customer\n🔵 Booked — Sold but not registered\n🔴 Sold — Registered & handed over")}>
          <Feather name="info" size={20} color={colors.primaryDeepest} />
        </TouchableOpacity>
      </View>

      {/* Legend & Filter */}
      <View style={styles.legendRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.legendScroll}>
          <LegendPill label="All" count={counts.all} color={colors.stone400} active={filter === "all"} onPress={() => setFilter("all")} testID="layout-filter-all" />
          <LegendPill label="Available" count={counts.available} color={colors.available} active={filter === "available"} onPress={() => setFilter("available")} testID="layout-filter-available" />
          <LegendPill label="Reserved" count={counts.reserved} color={colors.reserved} active={filter === "reserved"} onPress={() => setFilter("reserved")} testID="layout-filter-reserved" />
          <LegendPill label="Booked" count={counts.booked} color={colors.booked} active={filter === "booked"} onPress={() => setFilter("booked")} testID="layout-filter-booked" />
          <LegendPill label="Sold" count={counts.sold} color={colors.sold} active={filter === "sold"} onPress={() => setFilter("sold")} testID="layout-filter-sold" />
        </ScrollView>
      </View>

      {/* Body — switches based on unit type */}
      {unitType === "plot" ? (
        <PlotGrid units={units} filter={filter} onSelect={setSelected} />
      ) : unitType === "flat" ? (
        <FlatTowerView units={units} filter={filter} activeTower={activeTower} setActiveTower={setActiveTower} activeFloor={activeFloor} setActiveFloor={setActiveFloor} onSelect={setSelected} />
      ) : unitType === "villa" ? (
        <CardGrid units={units} filter={filter} onSelect={setSelected} kind="villa" />
      ) : unitType === "shop" ? (
        <FloorGroupedCards units={units} filter={filter} onSelect={setSelected} kind="shop" />
      ) : unitType === "farm" ? (
        <CardGrid units={units} filter={filter} onSelect={setSelected} kind="farm" />
      ) : (
        <View style={{ padding: spacing.lg }}><Text>No layout</Text></View>
      )}

      <UnitDetailModal selected={selected} property={property} onClose={() => setSelected(null)} onWhatsApp={openWhatsApp} onBook={(u) => { setSelected(null); router.push(`/booking/${u.id}`); }} onVisit={(u) => { setSelected(null); router.push(`/centre/site-${u.property_id}`); }} />
    </SafeAreaView>
  );
}

function LegendPill({ label, count, color, active, onPress, testID }: { label: string; count: number; color: string; active: boolean; onPress: () => void; testID: string }) {
  return (
    <TouchableOpacity testID={testID} style={[styles.legendPill, active && styles.legendPillActive]} onPress={onPress}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendLabel, active && styles.legendLabelActive]}>{label}</Text>
      <View style={[styles.legendCount, active && styles.legendCountActive]}>
        <Text style={[styles.legendCountText, active && styles.legendCountTextActive]}>{count}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ----- Layout: Open Plots / Layouts -----
function PlotGrid({ units, filter, onSelect }: { units: any[]; filter: string; onSelect: (u: any) => void }) {
  const cols = Math.max(...units.map((p) => p.col)) + 1;
  const rows = Math.max(...units.map((p) => p.row)) + 1;
  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
      <ScrollView horizontal contentContainerStyle={styles.hScroll}>
        <View>
          <View style={[styles.road, { width: cols * (PLOT_SIZE + 6) }]}>
            <Text style={styles.roadText}>● Main Road (40 ft) ●</Text>
          </View>
          <View style={styles.gridRow}>
            <View style={[styles.sideRoad, { height: rows * (PLOT_SIZE + 6) }]}>
              <Text style={styles.sideRoadText}>Internal Road</Text>
            </View>
            <View>
              {Array.from({ length: rows }).map((_, r) => (
                <View key={r} style={styles.plotRow}>
                  {Array.from({ length: cols }).map((_, c) => {
                    const plot = units.find((p) => p.row === r && p.col === c);
                    if (!plot) return <View key={c} style={[styles.plotCell, { backgroundColor: "transparent" }]} />;
                    const visible = filter === "all" || plot.status === filter;
                    return (
                      <TouchableOpacity
                        key={plot.id}
                        testID={`layout-plot-${plot.id}`}
                        style={[styles.plotCell, { backgroundColor: plotStatusColor(plot.status), opacity: visible ? 1 : 0.25 }]}
                        onPress={() => onSelect(plot)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.plotNumber}>{plot.plot_number.replace("P-", "").replace("L-", "")}</Text>
                        <Text style={styles.plotSize}>{plot.size_sqy}sqy</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
          <View style={[styles.park, { width: cols * (PLOT_SIZE + 6) + 28 }]}>
            <Feather name="sun" size={14} color={colors.primaryLight} />
            <Text style={styles.parkText}>Central Park · Open Space</Text>
          </View>
        </View>
      </ScrollView>
      <View style={styles.helperBox}>
        <Feather name="zoom-in" size={14} color={colors.stone500} />
        <Text style={styles.helperText}>Scroll horizontally to view full layout. Tap any plot for details.</Text>
      </View>
    </ScrollView>
  );
}

// ----- Apartment / Flat: Tower → Floor → Flat -----
function FlatTowerView({ units, filter, activeTower, setActiveTower, activeFloor, setActiveFloor, onSelect }:
  { units: any[]; filter: string; activeTower: string | null; setActiveTower: (t: string) => void; activeFloor: number | null; setActiveFloor: (f: number | null) => void; onSelect: (u: any) => void }) {
  const towers = Array.from(new Set(units.map((u) => u.tower).filter(Boolean))).sort();
  const towerUnits = units.filter((u) => u.tower === activeTower);
  const floors = Array.from(new Set(towerUnits.map((u) => u.floor))).sort((a, b) => b - a);
  const flatsPerFloor = activeFloor != null ? towerUnits.filter((u) => u.floor === activeFloor) : [];
  const floorVisible = activeFloor;

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}>
      {/* Tower selector */}
      <Text style={styles.subSection}>Select Tower</Text>
      <View style={styles.towerRow}>
        {towers.map((t) => (
          <TouchableOpacity
            key={t}
            testID={`layout-tower-${t}`}
            style={[styles.towerCard, activeTower === t && styles.towerCardActive]}
            onPress={() => { setActiveTower(t); setActiveFloor(null); }}
          >
            <View style={styles.towerIcon}>
              <Feather name="grid" size={20} color={activeTower === t ? colors.white : colors.primary} />
            </View>
            <Text style={[styles.towerTitle, activeTower === t && { color: colors.white }]}>Tower {t}</Text>
            <Text style={[styles.towerMeta, activeTower === t && { color: "rgba(255,255,255,0.8)" }]}>
              {units.filter((u) => u.tower === t).length} units
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Floor selector */}
      <Text style={[styles.subSection, { marginTop: spacing.lg }]}>Tower {activeTower} — Floors</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.floorScroll}>
        {floors.map((f) => {
          const floorUnits = towerUnits.filter((u) => u.floor === f);
          const availCount = floorUnits.filter((u) => u.status === "available").length;
          const isActive = activeFloor === f;
          return (
            <TouchableOpacity
              key={f}
              testID={`layout-floor-${f}`}
              style={[styles.floorChip, isActive && styles.floorChipActive]}
              onPress={() => setActiveFloor(isActive ? null : f)}
            >
              <Text style={[styles.floorChipTitle, isActive && { color: colors.white }]}>Floor {f}</Text>
              <Text style={[styles.floorChipMeta, isActive && { color: "rgba(255,255,255,0.8)" }]}>
                {availCount}/{floorUnits.length} avail
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {floorVisible == null ? (
        <View style={styles.hint}>
          <Feather name="info" size={14} color={colors.stone500} />
          <Text style={styles.hintText}>Tap any floor above to view flats.</Text>
        </View>
      ) : (
        <>
          <Text style={[styles.subSection, { marginTop: spacing.lg }]}>Tower {activeTower} · Floor {floorVisible}</Text>
          <View style={styles.flatGrid}>
            {flatsPerFloor.map((flat) => {
              const visible = filter === "all" || flat.status === filter;
              return (
                <TouchableOpacity
                  key={flat.id}
                  testID={`layout-flat-${flat.id}`}
                  style={[styles.flatCell, { backgroundColor: plotStatusColor(flat.status), opacity: visible ? 1 : 0.3 }]}
                  onPress={() => onSelect(flat)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.flatNumber}>{flat.flat_number}</Text>
                  <Text style={styles.flatMeta}>{flat.bhk}</Text>
                  <Text style={styles.flatMeta}>{flat.size_sqft} sqft</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}
    </ScrollView>
  );
}

// ----- Villa / Farm: Card Grid -----
function CardGrid({ units, filter, onSelect, kind }: { units: any[]; filter: string; onSelect: (u: any) => void; kind: "villa" | "farm" }) {
  const filtered = filter === "all" ? units : units.filter((u) => u.status === filter);
  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}>
      <Text style={styles.subSection}>{kind === "villa" ? "Villa Units" : "Farm Parcels"}</Text>
      <View style={styles.cardGrid}>
        {filtered.map((unit) => (
          <TouchableOpacity
            key={unit.id}
            testID={`layout-${kind}-${unit.id}`}
            style={styles.unitCard}
            onPress={() => onSelect(unit)}
            activeOpacity={0.85}
          >
            <View style={[styles.unitImage, { backgroundColor: plotStatusColor(unit.status) }]}>
              <Feather name={kind === "villa" ? "home" : "sun"} size={28} color={colors.white} />
              <View style={styles.unitStatusPill}>
                <Text style={styles.unitStatusText}>{plotStatusLabel(unit.status)}</Text>
              </View>
            </View>
            <View style={styles.unitBody}>
              <Text style={styles.unitNumber}>{unit.plot_number}</Text>
              <Text style={styles.unitType}>{kind === "villa" ? unit.villa_type : `${unit.acres} acres`}</Text>
              <Text style={styles.unitSize}>{unit.size} · {unit.facing}</Text>
              <Text style={styles.unitPrice}>{formatINR(unit.price)}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

// ----- Commercial: Grouped by Floor -----
function FloorGroupedCards({ units, filter, onSelect, kind }: { units: any[]; filter: string; onSelect: (u: any) => void; kind: "shop" }) {
  const filtered = filter === "all" ? units : units.filter((u) => u.status === filter);
  const floors = Array.from(new Set(filtered.map((u) => u.floor))).sort();
  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}>
      {floors.map((floor) => (
        <View key={floor} style={{ marginBottom: spacing.lg }}>
          <Text style={styles.subSection}>Floor {floor}</Text>
          <View style={styles.cardGrid}>
            {filtered.filter((u) => u.floor === floor).map((unit) => (
              <TouchableOpacity
                key={unit.id}
                testID={`layout-${kind}-${unit.id}`}
                style={styles.unitCard}
                onPress={() => onSelect(unit)}
                activeOpacity={0.85}
              >
                <View style={[styles.unitImage, { backgroundColor: plotStatusColor(unit.status) }]}>
                  <Feather name="briefcase" size={24} color={colors.white} />
                  <View style={styles.unitStatusPill}>
                    <Text style={styles.unitStatusText}>{plotStatusLabel(unit.status)}</Text>
                  </View>
                </View>
                <View style={styles.unitBody}>
                  <Text style={styles.unitNumber}>{unit.plot_number}</Text>
                  <Text style={styles.unitType}>{unit.shop_type}</Text>
                  <Text style={styles.unitSize}>{unit.size} · {unit.facing}</Text>
                  <Text style={styles.unitPrice}>{formatINR(unit.price)}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

// ----- Modal -----
function UnitDetailModal({ selected, property, onClose, onWhatsApp, onBook, onVisit }: { selected: any; property: any; onClose: () => void; onWhatsApp: (u: any) => void; onBook: (u: any) => void; onVisit: (u: any) => void }) {
  return (
    <Modal visible={!!selected} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} style={styles.modalBg} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalPlot}>{selected?.unit_type === "flat" ? "Flat" : selected?.unit_type === "villa" ? "Villa" : selected?.unit_type === "shop" ? "Unit" : selected?.unit_type === "farm" ? "Parcel" : "Plot"} {selected?.plot_number}</Text>
              <Text style={styles.modalProperty}>{property?.name}</Text>
            </View>
            <View style={[styles.modalStatus, { backgroundColor: plotStatusColor(selected?.status) }]}>
              <Text style={styles.modalStatusText}>{plotStatusLabel(selected?.status)}</Text>
            </View>
          </View>

          <View style={styles.modalGrid}>
            {selected?.bhk ? <ModalInfo icon="home" label="Type" value={selected.bhk} /> : null}
            {selected?.villa_type ? <ModalInfo icon="home" label="Type" value={selected.villa_type} /> : null}
            {selected?.shop_type ? <ModalInfo icon="briefcase" label="Type" value={selected.shop_type} /> : null}
            {selected?.acres ? <ModalInfo icon="sun" label="Acres" value={`${selected.acres}`} /> : null}
            {selected?.tower ? <ModalInfo icon="layers" label="Tower" value={selected.tower} /> : null}
            {selected?.floor ? <ModalInfo icon="bar-chart-2" label="Floor" value={`${selected.floor}`} /> : null}
            <ModalInfo icon="hash" label="Survey No." value={selected?.survey_number} />
            <ModalInfo icon="maximize-2" label="Size" value={selected?.size} />
            <ModalInfo icon="compass" label="Facing" value={selected?.facing} />
            <ModalInfo icon="map-pin" label="Location" value={property?.location} />
          </View>

          <View style={styles.modalPriceRow}>
            <Text style={styles.modalPriceLabel}>Total Price</Text>
            <Text style={styles.modalPriceValue}>{selected ? formatINRFull(selected.price) : ""}</Text>
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity testID="plot-modal-whatsapp" style={styles.modalIconBtn} onPress={() => onWhatsApp(selected)}>
              <Feather name="message-circle" size={20} color="#25D366" />
            </TouchableOpacity>
            <TouchableOpacity
              testID="plot-modal-visit"
              style={[styles.modalIconBtn, { backgroundColor: colors.accentSoft }]}
              onPress={() => onVisit(selected)}
            >
              <Feather name="calendar" size={20} color={colors.accent} />
            </TouchableOpacity>
            {(selected?.status === "available" || selected?.status === "reserved") ? (
              <TouchableOpacity testID="plot-modal-book" style={styles.modalBookBtn} onPress={() => onBook(selected)}>
                <Text style={styles.modalBookText}>Book Now</Text>
                <Feather name="arrow-right" size={16} color={colors.white} />
              </TouchableOpacity>
            ) : (
              <View style={[styles.modalBookBtn, { backgroundColor: colors.stone300 }]}>
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
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.stone100 },
  headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.offWhite, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1 },
  headerTitle: { ...typography.h4, color: colors.primaryDeepest, fontWeight: "700" },
  headerSub: { ...typography.small, color: colors.stone500 },
  legendRow: { backgroundColor: colors.white, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.stone100 },
  legendScroll: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  legendPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.full, backgroundColor: colors.offWhite, borderWidth: 1, borderColor: colors.stone100 },
  legendPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { ...typography.small, color: colors.stone700, fontWeight: "600" },
  legendLabelActive: { color: colors.white },
  legendCount: { minWidth: 22, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  legendCountActive: { backgroundColor: "rgba(255,255,255,0.25)" },
  legendCountText: { fontSize: 10, fontWeight: "700", color: colors.primary },
  legendCountTextActive: { color: colors.white },
  scrollView: { flex: 1 },
  scrollContent: { padding: spacing.md, alignItems: "center" },
  hScroll: { padding: spacing.sm },
  subSection: { ...typography.label, color: colors.stone600, marginBottom: spacing.sm, marginLeft: 4 },
  road: { height: 28, backgroundColor: colors.stone700, alignItems: "center", justifyContent: "center", borderRadius: radii.sm, marginLeft: 28, marginBottom: 6 },
  roadText: { ...typography.label, color: colors.stone200, fontSize: 9 },
  gridRow: { flexDirection: "row" },
  sideRoad: { width: 22, marginRight: 6, backgroundColor: colors.stone700, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" },
  sideRoadText: { ...typography.label, color: colors.stone200, fontSize: 8, transform: [{ rotate: "-90deg" }], width: 80 },
  plotRow: { flexDirection: "row", gap: 6, marginBottom: 6 },
  plotCell: { width: PLOT_SIZE, height: PLOT_SIZE, borderRadius: radii.sm, alignItems: "center", justifyContent: "center", padding: 4, ...shadow.sm },
  plotNumber: { color: colors.white, fontSize: 16, fontWeight: "800", letterSpacing: 0.5 },
  plotSize: { color: "rgba(255,255,255,0.85)", fontSize: 10, fontWeight: "600" },
  park: { height: 32, backgroundColor: "#E6F4EA", borderRadius: radii.sm, marginTop: 6, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  parkText: { ...typography.small, color: colors.primaryLight, fontWeight: "600" },
  helperBox: { flexDirection: "row", alignItems: "center", gap: 6, padding: spacing.md, marginTop: spacing.md, backgroundColor: colors.white, borderRadius: radii.md, marginHorizontal: spacing.lg },
  helperText: { ...typography.small, color: colors.stone500, flex: 1 },
  // Tower
  towerRow: { flexDirection: "row", gap: spacing.sm },
  towerCard: { flex: 1, backgroundColor: colors.white, borderRadius: radii.md, padding: spacing.md, alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.stone100 },
  towerCardActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  towerIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#E6F4EA", alignItems: "center", justifyContent: "center" },
  towerTitle: { ...typography.body, color: colors.primaryDeepest, fontWeight: "700" },
  towerMeta: { ...typography.small, color: colors.stone500 },
  // Floor
  floorScroll: { gap: 6, paddingHorizontal: 4 },
  floorChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radii.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.stone100, alignItems: "center", minWidth: 72 },
  floorChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  floorChipTitle: { ...typography.body, color: colors.primaryDeepest, fontWeight: "700" },
  floorChipMeta: { ...typography.small, color: colors.stone500, fontSize: 10 },
  // Flat
  flatGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  flatCell: { width: FLAT_SIZE * 1.5, height: FLAT_SIZE * 1.15, borderRadius: radii.md, alignItems: "center", justifyContent: "center", padding: 6, ...shadow.sm },
  flatNumber: { color: colors.white, fontSize: 14, fontWeight: "800" },
  flatMeta: { color: "rgba(255,255,255,0.92)", fontSize: 10, fontWeight: "600" },
  hint: { flexDirection: "row", alignItems: "center", gap: 6, padding: spacing.md, backgroundColor: colors.white, borderRadius: radii.md, marginTop: spacing.md },
  hintText: { ...typography.small, color: colors.stone500, flex: 1 },
  // Cards
  cardGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  unitCard: { width: "48%", backgroundColor: colors.white, borderRadius: radii.md, overflow: "hidden", ...shadow.sm },
  unitImage: { height: 80, alignItems: "center", justifyContent: "center", position: "relative" },
  unitStatusPill: { position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.sm },
  unitStatusText: { color: colors.white, fontSize: 8, fontWeight: "700", letterSpacing: 0.5 },
  unitBody: { padding: spacing.sm, gap: 2 },
  unitNumber: { ...typography.body, color: colors.primaryDeepest, fontWeight: "700" },
  unitType: { ...typography.small, color: colors.primary, fontWeight: "600", fontSize: 11 },
  unitSize: { ...typography.small, color: colors.stone500, fontSize: 11 },
  unitPrice: { ...typography.body, color: colors.primary, fontWeight: "700", marginTop: 4 },
  // Modal
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.white, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing.lg, gap: spacing.md },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.stone200, alignSelf: "center" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalPlot: { ...typography.h2, color: colors.primaryDeepest, fontWeight: "700" },
  modalProperty: { ...typography.small, color: colors.stone500 },
  modalStatus: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.sm },
  modalStatusText: { color: colors.white, fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  modalGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  modalInfo: { flexBasis: "47%", flexDirection: "row", alignItems: "center", gap: 8, padding: spacing.sm, backgroundColor: colors.offWhite, borderRadius: radii.md },
  modalInfoLabel: { ...typography.small, color: colors.stone500, fontSize: 11 },
  modalInfoValue: { ...typography.body, color: colors.primaryDeepest, fontWeight: "700" },
  modalPriceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md, backgroundColor: colors.primary, borderRadius: radii.md },
  modalPriceLabel: { ...typography.body, color: "rgba(255,255,255,0.8)", fontWeight: "600" },
  modalPriceValue: { ...typography.h2, color: colors.white, fontWeight: "700" },
  modalActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  modalIconBtn: { width: 48, height: 48, borderRadius: radii.md, backgroundColor: "#E6F9EE", alignItems: "center", justifyContent: "center" },
  modalBookBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, backgroundColor: colors.primary, borderRadius: radii.md },
  modalBookText: { ...typography.body, color: colors.white, fontWeight: "700" },
});
