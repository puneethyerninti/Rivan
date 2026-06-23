import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl, ActivityIndicator, Alert, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api } from "@/src/api";
import { colors, radii, spacing, typography, shadow } from "@/src/theme";

type Tab = "centres" | "history";

export default function VisitsScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("centres");
  const [centres, setCentres] = useState<any[]>([]);
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, v] = await Promise.all([api.centres(), api.myVisits()]);
      setCentres(c as any[]);
      setVisits(v as any[]);
    } catch (e: any) {
      console.warn("visits", e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function callNumber(num: string) {
    Linking.openURL(`tel:${num}`).catch(() => Alert.alert("Cannot make call"));
  }
  function openDirections(url: string) {
    Linking.openURL(url).catch(() => Alert.alert("Cannot open maps"));
  }

  if (loading) return <SafeAreaView style={styles.safe}><View style={styles.loader}><ActivityIndicator color={colors.primary} size="large" /></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="visits-screen">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        <View style={styles.header}>
          <Text style={styles.heading}>Visits</Text>
          <Text style={styles.subheading}>Experience centres & your visit history</Text>
        </View>

        <View style={styles.tabs}>
          <TouchableOpacity testID="visits-tab-centres" style={[styles.tab, tab === "centres" && styles.tabActive]} onPress={() => setTab("centres")}>
            <Text style={[styles.tabText, tab === "centres" && styles.tabTextActive]}>Experience Centres</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="visits-tab-history" style={[styles.tab, tab === "history" && styles.tabActive]} onPress={() => setTab("history")}>
            <Text style={[styles.tabText, tab === "history" && styles.tabTextActive]}>My Visits ({visits.length})</Text>
          </TouchableOpacity>
        </View>

        {tab === "centres" ? (
          <View style={styles.list}>
            {centres.map((c) => (
              <View key={c.id} style={styles.card} testID={`visits-centre-${c.id}`}>
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

                  <TouchableOpacity
                    testID={`visits-book-${c.id}`}
                    style={styles.bookBtn}
                    onPress={() => router.push(`/centre/${c.id}`)}
                  >
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
                <Text style={styles.emptyText}>No visits scheduled yet. Book your first visit!</Text>
              </View>
            ) : (
              visits.map((v) => (
                <View key={v.id} style={styles.visitCard} testID={`visits-history-${v.id}`}>
                  <View style={[styles.visitIcon, { backgroundColor: v.type === "centre" ? colors.primary : colors.accent }]}>
                    <Feather name={v.type === "centre" ? "home" : "map-pin"} size={16} color={colors.white} />
                  </View>
                  <View style={styles.visitBody}>
                    <Text style={styles.visitTitle}>{v.centre_name || v.property_name}</Text>
                    <Text style={styles.visitMeta}>
                      {v.visit_date}{v.visit_time ? ` at ${v.visit_time}` : ""}
                    </Text>
                    <Text style={styles.visitType}>{v.type === "centre" ? "Experience Centre" : "Site Visit"}</Text>
                  </View>
                  <View style={[styles.visitStatus, { backgroundColor: "#E6F4EA" }]}>
                    <Text style={[styles.visitStatusText, { color: colors.success }]}>{v.status.toUpperCase()}</Text>
                  </View>
                </View>
              ))
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
  header: { padding: spacing.lg, paddingBottom: 0 },
  heading: { ...typography.h1, color: colors.primaryDeepest, fontWeight: "700" },
  subheading: { ...typography.body, color: colors.stone500, marginTop: 4 },
  tabs: { flexDirection: "row", marginHorizontal: spacing.lg, marginTop: spacing.lg, backgroundColor: colors.white, borderRadius: radii.md, padding: 4, borderWidth: 1, borderColor: colors.stone100 },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: radii.sm },
  tabActive: { backgroundColor: colors.primary },
  tabText: { ...typography.small, color: colors.stone600, fontWeight: "600" },
  tabTextActive: { color: colors.white },
  list: { padding: spacing.lg, gap: spacing.md },
  card: { backgroundColor: colors.white, borderRadius: radii.lg, overflow: "hidden", ...shadow.md },
  cardImage: { width: "100%", height: 140 },
  cardBody: { padding: spacing.md, gap: 8 },
  centreName: { ...typography.h3, color: colors.primaryDeepest, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  metaText: { ...typography.small, color: colors.stone600, flex: 1 },
  actionsGrid: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  miniBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, backgroundColor: colors.offWhite, borderRadius: radii.md, borderWidth: 1, borderColor: colors.stone100 },
  miniBtnText: { ...typography.small, color: colors.stone700, fontWeight: "600" },
  bookBtn: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radii.md, marginTop: spacing.sm },
  bookBtnText: { ...typography.body, color: colors.white, fontWeight: "700" },
  visitCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.white, borderRadius: radii.md, padding: spacing.md, ...shadow.sm },
  visitIcon: { width: 40, height: 40, borderRadius: radii.full, alignItems: "center", justifyContent: "center" },
  visitBody: { flex: 1 },
  visitTitle: { ...typography.body, color: colors.primaryDeepest, fontWeight: "700" },
  visitMeta: { ...typography.small, color: colors.stone600, marginTop: 2 },
  visitType: { ...typography.label, color: colors.accent, marginTop: 4, fontSize: 9 },
  visitStatus: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.sm },
  visitStatusText: { ...typography.label, fontSize: 9 },
  empty: { padding: spacing.xl, alignItems: "center", gap: spacing.sm },
  emptyText: { ...typography.body, color: colors.stone500, textAlign: "center" },
});
