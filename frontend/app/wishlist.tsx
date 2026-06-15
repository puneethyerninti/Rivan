import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api } from "@/src/api";
import { colors, radii, spacing, typography, shadow, formatINR } from "@/src/theme";

export default function WishlistScreen() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const d = await api.wishlist();
        setItems(d as any[]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function remove(propId: string) {
    setItems((prev) => prev.filter((p) => p.id !== propId));
    await api.toggleWishlist(propId).catch(() => {});
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="wishlist-screen">
      <View style={styles.header}>
        <TouchableOpacity testID="wishlist-back" style={styles.headerBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color={colors.primaryDeepest} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Saved Properties</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        {loading ? (
          <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 40 }} />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="heart" size={56} color={colors.stone300} />
            <Text style={styles.emptyTitle}>No saved properties</Text>
            <Text style={styles.emptyText}>Tap the heart icon on any property to save it for later.</Text>
            <TouchableOpacity style={styles.exploreBtn} onPress={() => router.push("/")}>
              <Text style={styles.exploreBtnText}>Explore Properties</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            {items.map((p) => (
              <TouchableOpacity
                key={p.id}
                testID={`wishlist-${p.id}`}
                style={styles.card}
                onPress={() => router.push(`/property/${p.id}`)}
                activeOpacity={0.9}
              >
                <Image source={{ uri: p.image }} style={styles.image} />
                <View style={styles.body}>
                  <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                  <View style={styles.row}>
                    <Feather name="map-pin" size={11} color={colors.stone500} />
                    <Text style={styles.meta}>{p.location}</Text>
                  </View>
                  <Text style={styles.price}>From {formatINR(p.starting_price)}</Text>
                </View>
                <TouchableOpacity testID={`wishlist-remove-${p.id}`} style={styles.heartBtn} onPress={() => remove(p.id)}>
                  <Feather name="heart" size={18} color={colors.danger} fill={colors.danger} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.offWhite },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.stone100 },
  headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.offWhite, alignItems: "center", justifyContent: "center" },
  headerTitle: { ...typography.h3, color: colors.primaryDeepest, fontWeight: "700" },
  card: { flexDirection: "row", backgroundColor: colors.white, borderRadius: radii.md, overflow: "hidden", ...shadow.sm },
  image: { width: 110, height: 110 },
  body: { flex: 1, padding: spacing.md, gap: 4 },
  name: { ...typography.body, color: colors.primaryDeepest, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { ...typography.small, color: colors.stone500 },
  price: { ...typography.body, color: colors.primary, fontWeight: "700", marginTop: 4 },
  heartBtn: { padding: spacing.md, justifyContent: "center" },
  empty: { padding: spacing.xl, alignItems: "center", gap: spacing.sm, marginTop: spacing.xl },
  emptyTitle: { ...typography.h3, color: colors.primaryDeepest, fontWeight: "700", marginTop: spacing.md },
  emptyText: { ...typography.body, color: colors.stone500, textAlign: "center", maxWidth: 280 },
  exploreBtn: { backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: 14, borderRadius: radii.md, marginTop: spacing.md },
  exploreBtnText: { ...typography.body, color: colors.white, fontWeight: "700" },
});
