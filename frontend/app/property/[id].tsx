import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { api } from "@/src/api";
import { findMockPropertyById, mockProperties } from "@/src/mock-data";
import { colors, radii, spacing, typography, shadow } from "@/src/theme";

const AMENITIES_TEXT = [
  "Visakhapatnam Urban Development Authority (PCPIR) approved layout",
  "Grand entry by the side of 200' wide SEZ road",
  "100% clear vaasthu planning",
  "Security check-in and check-out gates",
  "Underground drainage system",
  "Excellent landscaping and plantation",
  "Street lights with transformer connections",
  "Overhead water tank for 24-hour water supply",
  "Rain-water harvesting",
  "Children's play area and parks as per layout approval",
  "Clubhouse membership at additional charge",
];

const FEATURES_TEXT = [
  "Underground telephone and intercom line provision for the housing project",
  "Well designed and standard quality construction",
  "Jogging and walking tracks as per layout approval",
  "60 min to Vizag Airport",
  "45 min to Duvvada",
  "30 min to Steel Plant",
  "25 min to Anakapalli Railway Station",
  "15 min to Kondakarla Tourist Spot",
  "10 min to Pudimadaka Beach",
  "10 min to Brandix, Naval Base, Asian Paints, BARC and NTPC Green Energy Project Company",
  "Renew Photovoltaics 4000cr investments nearby",
  "Google Data Centre corridor access",
  "Steel Plant to Nakkapalli development stretch",
];

function formatStartPrice(value?: number) {
  if (!value) return "Rs 16 Lakhs onwards";
  const lakhs = value / 100000;
  return `Rs ${lakhs.toFixed(0)} Lakhs onwards`;
}

function blockColor(status?: string) {
  switch (status) {
    case "available":
      return "rgba(16,185,129,0.78)";
    case "reserved":
      return "rgba(245,158,11,0.8)";
    case "booked":
      return "rgba(59,130,246,0.8)";
    case "sold":
      return "rgba(239,68,68,0.8)";
    default:
      return "rgba(107,114,128,0.78)";
  }
}

function useRemoteImageSize(uri?: string) {
  const [ratio, setRatio] = useState(1.5);

  useEffect(() => {
    if (!uri) return;
    let active = true;

    Image.getSize(
      uri,
      (width, height) => {
        if (active && width > 0 && height > 0) {
          setRatio(width / height);
        }
      },
      () => {
        if (active) setRatio(1.5);
      }
    );

    return () => {
      active = false;
    };
  }, [uri]);

  return ratio;
}

function ResponsiveImagePanel({
  uri,
  label,
  priority,
}: {
  uri?: string;
  label: string;
  priority?: boolean;
}) {
  const ratio = useRemoteImageSize(uri);

  if (!uri) return null;

  return (
    <View style={styles.mediaPanel}>
      <Image
        source={{ uri }}
        accessibilityLabel={label}
        resizeMode="contain"
        style={[styles.fullImage, { aspectRatio: ratio }]}
        progressiveRenderingEnabled={priority}
      />
    </View>
  );
}

function InteractiveMapViewer({
  uri,
  blocks,
  selectedBlock,
  onSelectBlock,
  onOpenInterest,
}: {
  uri?: string;
  blocks?: any[];
  selectedBlock?: any;
  onSelectBlock: (block: any) => void;
  onOpenInterest: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const ratio = useRemoteImageSize(uri);

  if (!uri) return null;

  const baseWidth = 1100;
  const contentWidth = baseWidth * zoom;
  const contentHeight = (baseWidth / ratio) * zoom;

  return (
    <View style={styles.mapShell}>
      <View style={styles.mapToolbar}>
        <Text style={styles.mapToolbarText}>Drag to inspect the map</Text>
        <View style={styles.mapControls}>
          <TouchableOpacity style={styles.mapLeadBtn} onPress={onOpenInterest}>
            <Feather name="send" size={14} color={colors.white} />
            <Text style={styles.mapLeadBtnText}>Show interest</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.mapControlBtn}
            onPress={() => setZoom((current) => Math.max(1, Number((current - 0.3).toFixed(2))))}
          >
            <Feather name="minus" size={16} color={colors.primaryDeepest} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.mapControlBtn} onPress={() => setZoom(1)}>
            <Feather name="refresh-ccw" size={15} color={colors.primaryDeepest} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.mapControlBtn}
            onPress={() => setZoom((current) => Math.min(2.8, Number((current + 0.3).toFixed(2))))}
          >
            <Feather name="plus" size={16} color={colors.primaryDeepest} />
          </TouchableOpacity>
        </View>
      </View>

      {selectedBlock ? (
        <View style={styles.selectedBlockCard}>
          <View style={styles.selectedBlockHeader}>
            <View style={[styles.selectedBlockDot, { backgroundColor: blockColor(selectedBlock.status) }]} />
            <Text style={styles.selectedBlockTitle}>Plot {selectedBlock.label}</Text>
            <Text style={styles.selectedBlockStatus}>{selectedBlock.status}</Text>
          </View>
          <Text style={styles.selectedBlockMeta}>
            {selectedBlock.size} | {selectedBlock.facing} facing | {formatStartPrice(selectedBlock.price)}
          </Text>
        </View>
      ) : (
        <View style={styles.selectedBlockCard}>
          <Text style={styles.selectedBlockPlaceholder}>Tap any highlighted plot block to inspect it.</Text>
        </View>
      )}

      <TouchableOpacity activeOpacity={1} onPress={onOpenInterest}>
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.mapScrollContent}>
          <ScrollView showsVerticalScrollIndicator maximumZoomScale={3} minimumZoomScale={1} contentContainerStyle={styles.mapScrollContent}>
            <View style={{ width: contentWidth, height: contentHeight }}>
              <Image
                source={{ uri }}
                resizeMode="contain"
                accessibilityLabel="Interactive availability map"
                style={[styles.mapInteractiveImage, { width: contentWidth, height: contentHeight }]}
              />
              {blocks?.map((block) => {
                const isActive = selectedBlock?.id === block.id;
                return (
                  <TouchableOpacity
                    key={block.id}
                    style={[
                      styles.mapBlock,
                      {
                        left: `${block.x}%`,
                        top: `${block.y}%`,
                        width: `${block.w}%`,
                        height: `${block.h}%`,
                        backgroundColor: blockColor(block.status),
                      },
                      isActive && styles.mapBlockActive,
                    ]}
                    onPress={() => onSelectBlock(block)}
                  >
                    <Text style={styles.mapBlockLabel}>{block.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </ScrollView>
      </TouchableOpacity>
    </View>
  );
}

export default function PropertyDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scrollRef = useRef<ScrollView | null>(null);
  const mapSectionOffset = useRef(0);
  const galleryRef = useRef<ScrollView | null>(null);
  const { width } = useWindowDimensions();
  const propertyFromMock = useMemo(() => findMockPropertyById(id) || mockProperties[0], [id]);
  const [property, setProperty] = useState<any>(propertyFromMock);
  const [loading, setLoading] = useState(!propertyFromMock);
  const [imgIdx, setImgIdx] = useState(0);
  const [selectedBlock, setSelectedBlock] = useState<any>(null);
  const [interestVisible, setInterestVisible] = useState(false);
  const [interestName, setInterestName] = useState("");
  const [interestPhone, setInterestPhone] = useState("");
  const [interestEmail, setInterestEmail] = useState("");

  useEffect(() => {
    let active = true;

    if (propertyFromMock) {
      setProperty(propertyFromMock);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    (async () => {
      try {
        const response = await api.getProperty(id as string);
        if (active) setProperty(response);
      } catch (e: any) {
        if (active) Alert.alert("Error", e.message);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [id, propertyFromMock]);

  const curatedFallback = propertyFromMock || mockProperties[0];
  const images: string[] = property?.images?.length ? property.images : curatedFallback.images || [curatedFallback.image];
  const plans: any[] = property?.layoutPlans?.length ? property.layoutPlans : curatedFallback.layoutPlans || [];
  const availabilityImage = property?.availabilityImage || curatedFallback.availabilityImage;
  const mapBlocks: any[] = property?.mapBlocks?.length ? property.mapBlocks : curatedFallback.mapBlocks || [];
  const heroRatio = useRemoteImageSize(images[imgIdx] || images[0]);
  const heroWidth = Math.min(width, 1280);
  const heroHeight = Math.min(heroWidth / heroRatio, width > 900 ? 620 : 420);

  useEffect(() => {
    if (images.length <= 1) return;

    const timer = setInterval(() => {
      setImgIdx((current) => {
        const next = (current + 1) % images.length;
        galleryRef.current?.scrollTo({ x: heroWidth * next, animated: true });
        return next;
      });
    }, 3200);

    return () => clearInterval(timer);
  }, [heroWidth, images.length]);

  if (loading || !property) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  function openCall() {
    Linking.openURL("tel:+919966826567").catch(() => Alert.alert("Call unavailable", "Unable to open the dialer."));
  }

  function jumpToMap() {
    scrollRef.current?.scrollTo({ y: Math.max(0, mapSectionOffset.current - 96), animated: true });
  }

  function submitInterest() {
    if (!interestName.trim() || !interestPhone.trim()) {
      Alert.alert("Need a few details", "Please enter your name and phone number.");
      return;
    }

    Alert.alert(
      "Thanks for showing interest",
      `${interestName.trim()}, our team will contact you shortly with the availability details for ${selectedBlock ? `Plot ${selectedBlock.label}` : property.name}.`
    );
    setInterestVisible(false);
    setInterestName("");
    setInterestPhone("");
    setInterestEmail("");
  }

  return (
    <View style={styles.container} testID="property-details-screen">
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.galleryWrap, { height: heroHeight + 32 }]}>
          <ScrollView
            ref={galleryRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setImgIdx(Math.round(e.nativeEvent.contentOffset.x / heroWidth))}
          >
            {images.map((media, index) => (
              <View key={`${property.id}-media-${index}`} style={[styles.heroSlide, { width: heroWidth, height: heroHeight }]}>
                <Image source={{ uri: media }} resizeMode="contain" style={styles.heroImage} />
              </View>
            ))}
          </ScrollView>
          <SafeAreaView edges={["top"]} style={styles.heroNav}>
            <View style={styles.heroNavRow}>
              <TouchableOpacity testID="property-back-button" style={styles.heroBtn} onPress={() => router.back()}>
                <Feather name="arrow-left" size={20} color={colors.white} />
              </TouchableOpacity>
              <TouchableOpacity testID="property-share-button" style={styles.heroBtn} onPress={() => Alert.alert("Share", "Property details are ready to share.")}>
                <Feather name="share-2" size={18} color={colors.white} />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
          <View style={styles.dots}>
            {images.map((_, index) => (
              <View key={`${property.id}-dot-${index}`} style={[styles.dot, index === imgIdx && styles.dotActive]} />
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
              <Text style={styles.priceLabel}>Pricing</Text>
              <Text style={styles.priceText}>{formatStartPrice(property.starting_price || curatedFallback.starting_price)}</Text>
            </View>
            <View style={styles.plotInfo}>
              <View style={styles.plotInfoDot} />
              <Text style={styles.plotInfoText}>{property.availability}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>Project Overview</Text>
          <Text style={styles.description}>{property.description}</Text>

          <View style={styles.specsGrid}>
            <SpecItem icon="square" label="Built-up Area" value={property.size} />
            <SpecItem icon="compass" label="Facing Options" value={property.facing} />
            <SpecItem icon="hash" label="Layout Ref." value={property.survey_number} />
            <SpecItem icon="maximize" label="Road Access" value={property.road_width} />
          </View>

          <Text style={styles.sectionTitle}>Floor Plans</Text>
          <View style={styles.planGrid}>
            {plans.map((plan) => (
              <View key={plan.id} style={styles.planCard}>
                <ResponsiveImagePanel uri={plan.image} label={plan.title} />
                <View style={styles.planBody}>
                  <Text style={styles.planTitle}>{plan.title}</Text>
                  <Text style={styles.planText}>{plan.description}</Text>
                </View>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Features & Amenities</Text>
          <View style={styles.copyGrid}>
            <View style={styles.copyCard}>
              <Text style={styles.copyHeading}>Amenities</Text>
              {AMENITIES_TEXT.map((item) => (
                <View key={item} style={styles.copyRow}>
                  <Feather name="check-circle" size={14} color={colors.primary} />
                  <Text style={styles.copyText}>{item}</Text>
                </View>
              ))}
            </View>
            <View style={styles.copyCard}>
              <Text style={styles.copyHeading}>Location Highlights</Text>
              {FEATURES_TEXT.map((item) => (
                <View key={item} style={styles.copyRow}>
                  <Feather name="arrow-right-circle" size={14} color={colors.accent} />
                  <Text style={styles.copyText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>

          <View
            onLayout={(event) => {
              mapSectionOffset.current = event.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.sectionTitle}>Availability Map</Text>
            <InteractiveMapViewer
              uri={availabilityImage}
              blocks={mapBlocks}
              selectedBlock={selectedBlock}
              onSelectBlock={(block) => {
                setSelectedBlock(block);
                setInterestVisible(true);
              }}
              onOpenInterest={() => setInterestVisible(true)}
            />
          </View>
        </View>
      </ScrollView>

      <SafeAreaView edges={["bottom"]} style={styles.actionBarWrap}>
        <View style={styles.actionBar}>
          <TouchableOpacity testID="property-call-button" style={styles.iconAction} onPress={openCall}>
            <Feather name="phone-call" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            testID="property-visit-button"
            style={[styles.actionBtn, styles.actionBtnSecondary]}
            onPress={() => router.push(`/centre/site-${id}`)}
          >
            <Feather name="calendar" size={16} color={colors.accent} />
            <Text style={styles.actionBtnTextSecondary}>Schedule Visit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="property-map-button"
            style={[styles.actionBtn, styles.actionBtnPrimary]}
            onPress={() => {
              jumpToMap();
              setTimeout(() => setInterestVisible(true), 250);
            }}
          >
            <Feather name="map" size={16} color={colors.white} />
            <Text style={styles.actionBtnTextPrimary}>Explore Map</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <Modal visible={interestVisible} transparent animationType="fade" onRequestClose={() => setInterestVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalTitle}>Thanks for showing interest</Text>
                <Text style={styles.modalSubtitle}>Please provide your details and our team will help you with map availability.</Text>
                {selectedBlock ? <Text style={styles.modalBlockLabel}>Selected plot: {selectedBlock.label}</Text> : null}
              </View>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setInterestVisible(false)}>
                <Feather name="x" size={18} color={colors.primaryDeepest} />
              </TouchableOpacity>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                value={interestName}
                onChangeText={setInterestName}
                placeholder="Enter your name"
                placeholderTextColor={colors.stone400}
                style={styles.fieldInput}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Phone Number</Text>
              <TextInput
                value={interestPhone}
                onChangeText={setInterestPhone}
                placeholder="Enter your phone number"
                placeholderTextColor={colors.stone400}
                keyboardType="phone-pad"
                style={styles.fieldInput}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                value={interestEmail}
                onChangeText={setInterestEmail}
                placeholder="Enter your email"
                placeholderTextColor={colors.stone400}
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.fieldInput}
              />
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={submitInterest}>
              <Text style={styles.submitBtnText}>Submit Interest</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  scrollContent: { paddingBottom: 120 },
  galleryWrap: {
    width: "100%",
    maxWidth: 1280,
    alignSelf: "center",
    position: "relative",
    backgroundColor: "#0F1720",
    justifyContent: "center",
  },
  heroSlide: {
    backgroundColor: "#0F1720",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  heroImage: { width: "100%", height: "100%" },
  heroNav: { position: "absolute", top: 0, left: 0, right: 0 },
  heroNavRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md },
  heroBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(15, 23, 32, 0.56)",
    alignItems: "center",
    justifyContent: "center",
  },
  dots: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.45)" },
  dotActive: { width: 24, backgroundColor: colors.white },
  categoryPill: {
    position: "absolute",
    top: 88,
    right: spacing.md,
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.md,
  },
  categoryText: { color: colors.white, fontSize: 12, fontWeight: "700" },
  content: { padding: spacing.lg, gap: spacing.sm, width: "100%", maxWidth: 1280, alignSelf: "center" },
  title: { ...typography.h1, color: colors.primaryDeepest, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  location: { ...typography.body, color: colors.stone600 },
  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm, gap: spacing.sm, flexWrap: "wrap" },
  priceLabel: { ...typography.small, color: colors.stone500 },
  priceText: { ...typography.h2, color: colors.primary, fontWeight: "800", marginTop: 2 },
  plotInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: radii.full,
  },
  plotInfoDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.available },
  plotInfoText: { ...typography.small, color: colors.primary, fontWeight: "700" },
  divider: { height: 1, backgroundColor: colors.stone100, marginVertical: spacing.md },
  sectionTitle: { ...typography.h4, color: colors.primaryDeepest, fontWeight: "700", marginTop: spacing.md, marginBottom: spacing.sm },
  description: { ...typography.body, color: colors.stone600, lineHeight: 23 },
  specsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  specItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexBasis: "47%",
    padding: spacing.sm,
    backgroundColor: colors.offWhite,
    borderRadius: radii.md,
  },
  specLabel: { ...typography.small, color: colors.stone500, fontSize: 11 },
  specValue: { ...typography.body, color: colors.primaryDeepest, fontWeight: "600" },
  planGrid: { gap: spacing.md },
  planCard: {
    backgroundColor: colors.offWhite,
    borderRadius: radii.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.stone100,
  },
  mediaPanel: {
    backgroundColor: colors.white,
    padding: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  fullImage: {
    width: "100%",
    maxHeight: 900,
    backgroundColor: colors.white,
  },
  planBody: { padding: spacing.md, gap: 6 },
  planTitle: { ...typography.bodyLarge, color: colors.primaryDeepest, fontWeight: "700" },
  planText: { ...typography.body, color: colors.stone600, lineHeight: 21 },
  copyGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  copyCard: {
    flex: 1,
    minWidth: 280,
    backgroundColor: colors.offWhite,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.stone100,
    padding: spacing.md,
    gap: spacing.sm,
  },
  copyHeading: { ...typography.bodyLarge, color: colors.primaryDeepest, fontWeight: "700" },
  copyRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  copyText: { flex: 1, ...typography.body, color: colors.stone700, lineHeight: 21 },
  mapShell: {
    backgroundColor: colors.offWhite,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.stone100,
    overflow: "hidden",
  },
  mapToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.stone100,
    backgroundColor: colors.white,
    flexWrap: "wrap",
  },
  mapToolbarText: { ...typography.body, color: colors.stone700, fontWeight: "600" },
  mapControls: { flexDirection: "row", gap: 8 },
  mapLeadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 4,
  },
  mapLeadBtnText: { ...typography.small, color: colors.white, fontWeight: "700" },
  mapControlBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.offWhite,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.stone200,
  },
  mapScrollContent: { alignItems: "center", justifyContent: "center" },
  mapInteractiveImage: { backgroundColor: colors.white },
  selectedBlockCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.stone100,
  },
  selectedBlockHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  selectedBlockDot: { width: 10, height: 10, borderRadius: 5 },
  selectedBlockTitle: { ...typography.body, color: colors.primaryDeepest, fontWeight: "700" },
  selectedBlockStatus: { ...typography.small, color: colors.stone500, textTransform: "capitalize" },
  selectedBlockMeta: { ...typography.small, color: colors.stone700 },
  selectedBlockPlaceholder: { ...typography.small, color: colors.stone500 },
  mapBlock: {
    position: "absolute",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  mapBlockActive: {
    borderWidth: 2,
    borderColor: colors.primaryDeepest,
    transform: [{ scale: 1.08 }],
  },
  mapBlockLabel: { color: colors.white, fontSize: 9, fontWeight: "800" },
  actionBarWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.stone100,
    ...shadow.lg,
  },
  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    width: "100%",
    maxWidth: 1280,
    alignSelf: "center",
  },
  iconAction: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: "#E6F9EE",
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: radii.md,
  },
  actionBtnSecondary: { borderWidth: 1.5, borderColor: colors.accent },
  actionBtnPrimary: { backgroundColor: colors.primary },
  actionBtnTextSecondary: { ...typography.body, color: colors.accent, fontWeight: "700" },
  actionBtnTextPrimary: { ...typography.body, color: colors.white, fontWeight: "700" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(5, 18, 12, 0.48)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.lg,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  modalHeaderCopy: { flex: 1, gap: 4 },
  modalTitle: { ...typography.h3, color: colors.primaryDeepest, fontWeight: "700" },
  modalSubtitle: { ...typography.body, color: colors.stone600, lineHeight: 21 },
  modalBlockLabel: { ...typography.small, color: colors.accentDark, fontWeight: "700", marginTop: 2 },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.offWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldGroup: { gap: 6 },
  fieldLabel: { ...typography.small, color: colors.stone700, fontWeight: "700" },
  fieldInput: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.stone200,
    paddingHorizontal: spacing.md,
    color: colors.primaryDeepest,
    backgroundColor: colors.white,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    minHeight: 50,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  submitBtnText: { ...typography.body, color: colors.white, fontWeight: "700" },
});
