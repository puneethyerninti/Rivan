import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Dimensions, ActivityIndicator, Alert, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { api } from "@/src/api";
import { colors, radii, spacing, typography, shadow, formatINR, formatINRFull } from "@/src/theme";

const { width } = Dimensions.get("window");

export default function PropertyDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [property, setProperty] = useState<any>(null);
  const [plots, setPlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [wishlisted, setWishlisted] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const [p, pl] = await Promise.all([api.getProperty(id as string), api.getPropertyPlots(id as string).catch(() => [])]);
        setProperty(p);
        setPlots(pl as any[]);
      } catch (e: any) {
        Alert.alert("Error", e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function toggleWish() {
    try {
      const res: any = await api.toggleWishlist(id as string);
      setWishlisted(res.wishlisted);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  }

  function openWhatsApp() {
    const text = `Hi, I'm interested in ${property.name} at ${property.location}.`;
    Linking.openURL(`https://wa.me/919876543210?text=${encodeURIComponent(text)}`).catch(() => Alert.alert("Cannot open WhatsApp"));
  }

  if (loading || !property) {
    return <View style={styles.loader}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }

  const availPlots = plots.filter((p) => p.status === "available").length;
  const hasLayout = plots.length > 0;
  const images: string[] = property.images || [property.image];

  return (
    <View style={styles.container} testID="property-details-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {/* Image Gallery */}
        <View style={styles.galleryWrap}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setImgIdx(Math.round(e.nativeEvent.contentOffset.x / width))}
          >
            {images.map((url, i) => (
              <Image key={i} source={{ uri: url }} style={styles.heroImage} />
            ))}
          </ScrollView>
          <View style={styles.heroOverlay} />
          <SafeAreaView edges={["top"]} style={styles.heroNav}>
            <View style={styles.heroNavRow}>
              <TouchableOpacity testID="property-back-button" style={styles.heroBtn} onPress={() => router.back()}>
                <Feather name="arrow-left" size={20} color={colors.white} />
              </TouchableOpacity>
              <View style={styles.heroNavRight}>
                <TouchableOpacity testID="property-wishlist-button" style={styles.heroBtn} onPress={toggleWish}>
                  <Feather name="heart" size={18} color={wishlisted ? colors.danger : colors.white} />
                </TouchableOpacity>
                <TouchableOpacity testID="property-share-button" style={styles.heroBtn} onPress={() => Alert.alert("Share", "Sharing link copied!")}>
                  <Feather name="share-2" size={18} color={colors.white} />
                </TouchableOpacity>
              </View>
            </View>
          </SafeAreaView>
          <View style={styles.dots}>
            {images.map((_, i) => (
              <View key={i} style={[styles.dot, i === imgIdx && styles.dotActive]} />
            ))}
          </View>
          <View style={styles.categoryPill}>
            <Text style={styles.categoryText}>{property.category}</Text>
          </View>
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>{property.name}</Text>
          <View style={styles.row}>
            <Feather name="map-pin" size={14} color={colors.stone600} />
            <Text style={styles.location}>{property.location}</Text>
          </View>

          <View style={styles.priceRow}>
            <View>
              <Text style={styles.priceLabel}>Starting From</Text>
              <Text style={styles.price}>{formatINR(property.starting_price)}</Text>
            </View>
            {hasLayout ? (
              <View style={styles.plotInfo}>
                <View style={styles.plotInfoDot} />
                <Text style={styles.plotInfoText}>{availPlots} plots available</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>Project Overview</Text>
          <Text style={styles.description}>{property.description}</Text>

          <View style={styles.specsGrid}>
            <SpecItem icon="hash" label="Survey No." value={property.survey_number} />
            <SpecItem icon="compass" label="Facing" value={property.facing} />
            <SpecItem icon="maximize" label="Road Width" value={property.road_width} />
            <SpecItem icon="square" label="Size Range" value={property.size} />
          </View>

          {property.amenities?.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Amenities</Text>
              <View style={styles.tagsGrid}>
                {property.amenities.map((a: string, i: number) => (
                  <View key={i} style={styles.tag}>
                    <Feather name="check" size={11} color={colors.primary} />
                    <Text style={styles.tagText}>{a}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {property.approvals?.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Approvals</Text>
              <View style={styles.tagsGrid}>
                {property.approvals.map((a: string, i: number) => (
                  <View key={i} style={[styles.tag, styles.tagAccent]}>
                    <Feather name="shield" size={11} color={colors.accent} />
                    <Text style={[styles.tagText, { color: colors.accentDark }]}>{a}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {property.nearby?.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Nearby</Text>
              {property.nearby.map((n: string, i: number) => (
                <View key={i} style={styles.nearbyRow}>
                  <Feather name="map-pin" size={12} color={colors.stone500} />
                  <Text style={styles.nearbyText}>{n}</Text>
                </View>
              ))}
            </>
          ) : null}

          {/* Map placeholder */}
          <Text style={styles.sectionTitle}>Location</Text>
          <View style={styles.mapPlaceholder}>
            <Feather name="map" size={32} color={colors.primary} />
            <Text style={styles.mapText}>{property.location}</Text>
            <Text style={styles.mapSubtext}>Tap to view on Google Maps</Text>
          </View>

          {/* Brochure */}
          <TouchableOpacity
            testID="property-brochure-button"
            style={styles.brochureBtn}
            onPress={() => Alert.alert("Brochure", "Brochure downloaded successfully.")}
          >
            <View style={styles.brochureIcon}>
              <Feather name="download" size={18} color={colors.primary} />
            </View>
            <View style={styles.brochureContent}>
              <Text style={styles.brochureTitle}>Download Brochure</Text>
              <Text style={styles.brochureSub}>PDF · 2.4 MB</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.stone400} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Floating Action Bar */}
      <SafeAreaView edges={["bottom"]} style={styles.actionBarWrap}>
        <View style={styles.actionBar}>
          <TouchableOpacity testID="property-whatsapp-button" style={styles.iconAction} onPress={openWhatsApp}>
            <Feather name="message-circle" size={20} color="#25D366" />
          </TouchableOpacity>
          <TouchableOpacity
            testID="property-visit-button"
            style={[styles.actionBtn, styles.actionBtnSecondary]}
            onPress={() => router.push(`/centre/site-${id}`)}
          >
            <Feather name="calendar" size={16} color={colors.accent} />
            <Text style={styles.actionBtnTextSecondary}>Schedule Visit</Text>
          </TouchableOpacity>
          {hasLayout ? (
            <TouchableOpacity
              testID="property-layout-button"
              style={[styles.actionBtn, styles.actionBtnPrimary]}
              onPress={() => router.push(`/layout/${id}`)}
            >
              <Feather name="grid" size={16} color={colors.white} />
              <Text style={styles.actionBtnTextPrimary}>
                {property.category === "Open Plots" || property.category === "Layouts" ? "View Layout" : "View Availability"}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              testID="property-enquire-button"
              style={[styles.actionBtn, styles.actionBtnPrimary]}
              onPress={openWhatsApp}
            >
              <Text style={styles.actionBtnTextPrimary}>Enquire Now</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

function SpecItem({ icon, label, value }: { icon: any; label: string; value?: string }) {
  return (
    <View style={styles.specItem}>
      <Feather name={icon} size={14} color={colors.accent} />
      <View>
        <Text style={styles.specLabel}>{label}</Text>
        <Text style={styles.specValue}>{value || "-"}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  loader: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.white },
  galleryWrap: { width, height: 320, position: "relative", backgroundColor: colors.stone200 },
  heroImage: { width, height: 320 },
  heroOverlay: { position: "absolute", left: 0, right: 0, top: 0, height: 120, backgroundColor: "rgba(0,0,0,0.25)" },
  heroNav: { position: "absolute", top: 0, left: 0, right: 0 },
  heroNavRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md },
  heroNavRight: { flexDirection: "row", gap: 8 },
  heroBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  dots: { position: "absolute", bottom: 16, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.5)" },
  dotActive: { backgroundColor: colors.white, width: 20 },
  categoryPill: { position: "absolute", top: 80, right: spacing.md, backgroundColor: colors.accent, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.sm },
  categoryText: { color: colors.white, fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  content: { padding: spacing.lg, gap: spacing.sm },
  title: { ...typography.h1, color: colors.primaryDeepest, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  location: { ...typography.body, color: colors.stone600 },
  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  priceLabel: { ...typography.small, color: colors.stone500 },
  price: { ...typography.h2, color: colors.primary, fontWeight: "700", marginTop: 2 },
  plotInfo: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.accentSoft, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.full },
  plotInfoDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.available },
  plotInfoText: { ...typography.small, color: colors.primary, fontWeight: "700" },
  divider: { height: 1, backgroundColor: colors.stone100, marginVertical: spacing.md },
  sectionTitle: { ...typography.h4, color: colors.primaryDeepest, fontWeight: "700", marginTop: spacing.md, marginBottom: spacing.sm },
  description: { ...typography.body, color: colors.stone600, lineHeight: 22 },
  specsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  specItem: { flexDirection: "row", alignItems: "center", gap: 8, flexBasis: "47%", padding: spacing.sm, backgroundColor: colors.offWhite, borderRadius: radii.md },
  specLabel: { ...typography.small, color: colors.stone500, fontSize: 11 },
  specValue: { ...typography.body, color: colors.primaryDeepest, fontWeight: "600" },
  tagsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#E6F4EA", paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.full },
  tagAccent: { backgroundColor: colors.accentSoft },
  tagText: { ...typography.small, color: colors.primary, fontWeight: "600" },
  nearbyRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  nearbyText: { ...typography.body, color: colors.stone700 },
  mapPlaceholder: { backgroundColor: colors.offWhite, padding: spacing.lg, borderRadius: radii.md, alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.stone100 },
  mapText: { ...typography.body, color: colors.primaryDeepest, fontWeight: "600" },
  mapSubtext: { ...typography.small, color: colors.stone500 },
  brochureBtn: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.offWhite, padding: spacing.md, borderRadius: radii.md, marginTop: spacing.md },
  brochureIcon: { width: 40, height: 40, borderRadius: radii.sm, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  brochureContent: { flex: 1 },
  brochureTitle: { ...typography.body, color: colors.primaryDeepest, fontWeight: "700" },
  brochureSub: { ...typography.small, color: colors.stone500 },
  actionBarWrap: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.stone100, ...shadow.lg },
  actionBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md },
  iconAction: { width: 48, height: 48, borderRadius: radii.md, backgroundColor: "#E6F9EE", alignItems: "center", justifyContent: "center" },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: radii.md },
  actionBtnSecondary: { borderWidth: 1.5, borderColor: colors.accent },
  actionBtnPrimary: { backgroundColor: colors.primary },
  actionBtnTextSecondary: { ...typography.body, color: colors.accent, fontWeight: "700" },
  actionBtnTextPrimary: { ...typography.body, color: colors.white, fontWeight: "700" },
});
