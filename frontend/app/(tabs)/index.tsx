import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import CustomerAuthModal from "@/src/components/CustomerAuthModal";
import { PropertyMedia } from "@/src/components/PropertyMedia";
import { mockFeaturedProperties, mockProperties } from "@/src/mock-data";
import { colors, radii, spacing, typography, shadow, formatINR } from "@/src/theme";

const LOCATIONS = ["Hyderabad", "Shadnagar", "Gachibowli", "Kompally", "Madhapur"];

const CATEGORIES = [
  { key: "all", label: "All", icon: "grid" as const },
  { key: "Apartments", label: "Apartments", icon: "home" as const },
  { key: "Flats", label: "Flats", icon: "layers" as const },
  { key: "Villas", label: "Villas", icon: "home" as const },
  { key: "Open Plots", label: "Open Plots", icon: "square" as const },
  { key: "Layouts", label: "Layouts", icon: "map" as const },
  { key: "Commercial Properties", label: "Commercial", icon: "briefcase" as const },
  { key: "Farm Lands", label: "Farm Lands", icon: "sun" as const },
];

export function HomeScreen() {
  const router = useRouter();
  const { user, isAuthed } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const isTablet = width >= 680;
  const useCompactPropertyCard = isTablet && !isDesktop;
  const propertyColumns = isDesktop ? 2 : 1;
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [location, setLocation] = useState("Hyderabad");
  const [locationOpen, setLocationOpen] = useState(false);
  const [properties, setProperties] = useState<any[]>(mockProperties);
  const [featured, setFeatured] = useState<any[]>(mockFeaturedProperties);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [relationship, setRelationship] = useState<any>(null);
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"login" | "signup">("login");
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);

  const openAuthModal = useCallback((mode: "login" | "signup" = "login", nextRoute?: string) => {
    setAuthModalMode(mode);
    setPendingRoute(nextRoute || null);
    setAuthModalVisible(true);
  }, [router]);

  const openProtectedRoute = useCallback(
    (href: Parameters<typeof router.push>[0]) => {
      if (!isAuthed) {
        openAuthModal("login", String(href));
        return;
      }
      router.push(href);
    },
    [isAuthed, openAuthModal, router]
  );

  const openPropertyDetails = useCallback(
    (propertyId: string) => {
      router.push(`/property/${propertyId}`);
    },
    [router]
  );

  const openAvailability = useCallback(
    (propertyId: string) => {
      router.push(`/property/${propertyId}`);
    },
    [router]
  );

  const handleAuthSuccess = useCallback(() => {
    const nextRoute = pendingRoute;
    setPendingRoute(null);
    setAuthModalVisible(false);
    if (nextRoute) {
      router.push(nextRoute as any);
    }
  }, [pendingRoute, router]);

  const fetchData = useCallback(async () => {
    try {
      const [, , notifs, crmRelationship] = await Promise.all([
        api.listProperties({ category: category === "all" ? undefined : category, search }).catch(() => []),
        api.featured().catch(() => []),
        isAuthed ? api.notifications().catch(() => []) : Promise.resolve([]),
        isAuthed ? api.customerRelationship().catch(() => null) : Promise.resolve(null),
      ]);
      const normalizedCategory = category === "all" ? "" : category.toLowerCase();
      const normalizedSearch = search.trim().toLowerCase();
      const filtered = mockProperties.filter((property) => {
        const categoryMatch = !normalizedCategory || property.category.toLowerCase() === normalizedCategory;
        const searchMatch =
          !normalizedSearch ||
          property.name.toLowerCase().includes(normalizedSearch) ||
          property.location.toLowerCase().includes(normalizedSearch) ||
          property.category.toLowerCase().includes(normalizedSearch);
        return categoryMatch && searchMatch;
      });

      setProperties(filtered);
      setFeatured(mockFeaturedProperties);
      setUnreadCount((notifs as any[]).filter((n) => !n.read).length);
      setRelationship(crmRelationship);
    } catch (e: any) {
      console.warn("home fetch", e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category, search, isAuthed]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function onRefresh() {
    setRefreshing(true);
    fetchData();
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="home-screen">
      <View style={[styles.shell, isDesktop && styles.shellDesktop]}>
        <View style={[styles.header, isDesktop && styles.headerDesktop]}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              testID="home-location-button"
              style={styles.locationBtn}
              onPress={() => setLocationOpen(!locationOpen)}
            >
              <Feather name="map-pin" size={14} color={colors.accent} />
              <Text style={styles.locationText}>{location}</Text>
              <Feather name={locationOpen ? "chevron-up" : "chevron-down"} size={14} color={colors.stone600} />
            </TouchableOpacity>
            <Text style={styles.greeting}>Hi, {user?.name?.split(" ")[0] || "Guest"}</Text>
            <Text style={styles.headerSubtitle}>Find inventory, availability, and the next best property in one pass.</Text>
          </View>
          <View style={styles.headerRight}>
            {isAuthed ? (
              <>
                <TouchableOpacity
                  testID="home-wishlist-button"
                  style={styles.iconBtn}
                  onPress={() => openProtectedRoute("/wishlist")}
                >
                  <Feather name="heart" size={20} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  testID="home-notifications-button"
                  style={styles.iconBtn}
                  onPress={() => openProtectedRoute("/notifications")}
                >
                  <Feather name="bell" size={20} color={colors.primary} />
                  {unreadCount > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{unreadCount}</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.authActions}>
                <TouchableOpacity
                  testID="home-header-login"
                  style={styles.authGhostBtn}
                  onPress={() => openAuthModal("login")}
                >
                  <Text style={styles.authGhostText}>Login</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="home-header-signup"
                  style={styles.authPrimaryBtn}
                  onPress={() => openAuthModal("signup")}
                >
                  <Text style={styles.authPrimaryText}>Sign Up</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {locationOpen ? (
          <View style={[styles.locationDropdown, isDesktop && styles.locationDropdownDesktop]} testID="home-location-dropdown">
            {LOCATIONS.map((l) => (
              <TouchableOpacity
                key={l}
                testID={`home-location-${l}`}
                style={styles.locationItem}
                onPress={() => {
                  setLocation(l);
                  setLocationOpen(false);
                }}
              >
                <Feather
                  name={l === location ? "check" : "map-pin"}
                  size={14}
                  color={l === location ? colors.primary : colors.stone400}
                />
                <Text style={[styles.locationItemText, l === location && styles.locationItemActive]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

      <FlatList
        key={`properties-${propertyColumns}`}
        data={properties}
        numColumns={propertyColumns}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.listContent, isDesktop && styles.listContentDesktop]}
        columnWrapperStyle={propertyColumns > 1 ? styles.propertyRow : undefined}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View>
            <View style={[styles.heroBand, isDesktop && styles.heroBandDesktop]}>
              <View style={[styles.heroSearchCard, styles.heroSearchCardExpanded]}>
                <View style={styles.searchBox}>
                  <Feather name="search" size={18} color={colors.stone400} />
                  <TextInput
                    testID="home-search-input"
                    style={styles.searchInput}
                    placeholder="Search properties, locations..."
                    placeholderTextColor={colors.stone400}
                    value={search}
                    onChangeText={setSearch}
                    returnKeyType="search"
                  />
                  {search ? (
                    <TouchableOpacity onPress={() => setSearch("")}>
                      <Feather name="x" size={16} color={colors.stone400} />
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={styles.quickActions}>
                  <TouchableOpacity
                    testID="home-quick-services"
                    style={styles.quickAction}
                    onPress={() => openProtectedRoute("/services")}
                  >
                    <View style={[styles.quickIcon, { backgroundColor: colors.accentSoft }]}>
                      <Feather name="tool" size={18} color={colors.accent} />
                    </View>
                    <Text style={styles.quickLabel}>Services</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="home-quick-documents"
                    style={styles.quickAction}
                    onPress={() => openProtectedRoute("/documents")}
                  >
                    <View style={[styles.quickIcon, { backgroundColor: "#E6F4EA" }]}>
                      <Feather name="folder" size={18} color={colors.primary} />
                    </View>
                    <Text style={styles.quickLabel}>Documents</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                      testID="home-quick-wishlist"
                      style={styles.quickAction}
                      onPress={() => openProtectedRoute("/wishlist")}
                  >
                    <View style={[styles.quickIcon, { backgroundColor: "#FEE2E2" }]}>
                      <Feather name="heart" size={18} color={colors.danger} />
                    </View>
                    <Text style={styles.quickLabel}>Wishlist</Text>
                  </TouchableOpacity>
                  {user?.is_admin ? (
                    <TouchableOpacity
                      testID="home-quick-admin"
                      style={styles.quickAction}
                      onPress={() => router.push("/admin")}
                    >
                      <View style={[styles.quickIcon, { backgroundColor: "#FEF3C7" }]}>
                        <Feather name="settings" size={18} color="#D97706" />
                      </View>
                      <Text style={styles.quickLabel}>Admin</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </View>

            {relationship?.assigned_agent || relationship?.assigned_sub_agent || relationship?.primary_link ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Your Relationship Team</Text>
                <View style={styles.relationshipCard}>
                  <View style={styles.relationshipAvatar}>
                    <Feather name="user-check" size={18} color={colors.white} />
                  </View>
                  <View style={styles.relationshipBody}>
                    <Text style={styles.relationshipName}>
                      {relationship?.assigned_sub_agent?.name || relationship?.assigned_agent?.name || "Rivan Advisor"}
                    </Text>
                    <Text style={styles.relationshipMeta}>
                      {relationship?.assigned_sub_agent ? "Sub-agent" : "Relationship owner"}
                      {relationship?.assigned_agent?.agent_brand_name ? ` - ${relationship.assigned_agent.agent_brand_name}` : ""}
                    </Text>
                    <Text style={styles.relationshipStatus}>
                      {formatRelationshipStatus(relationship?.primary_link?.relationship_type, relationship?.primary_link?.status)}
                    </Text>
                    {relationship?.open_tasks?.[0]?.title ? (
                      <Text style={styles.relationshipHint}>
                        Next step: {relationship.open_tasks[0].title}
                      </Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    testID="home-relationship-profile"
                    style={styles.relationshipAction}
                    onPress={() => openProtectedRoute("/profile")}
                  >
                    <Feather name="arrow-right" size={16} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {featured.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Featured Projects</Text>
                  <View style={styles.featuredTag}>
                    <Feather name="star" size={11} color={colors.accent} />
                    <Text style={styles.featuredTagText}>Premium</Text>
                  </View>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.featuredScroll}
                  decelerationRate="fast"
                  snapToInterval={isDesktop ? 376 : 296}
                >
                  {featured.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      testID={`home-featured-${p.id}`}
                      style={[styles.featuredCard, isDesktop && styles.featuredCardDesktop]}
                      onPress={() => openPropertyDetails(p.id)}
                      activeOpacity={0.9}
                    >
                      <PropertyMedia image={p.image} videoUrl={p.videoUrl} style={styles.featuredImage} />
                      <View style={styles.featuredOverlay} />
                      <View style={styles.featuredContent}>
                        <View style={styles.categoryPillSmall}>
                          <Text style={styles.categoryPillTextSmall}>{p.category}</Text>
                        </View>
                        <Text style={styles.featuredName} numberOfLines={1}>
                          {p.name}
                        </Text>
                        <View style={styles.featuredMeta}>
                          <Feather name="map-pin" size={11} color={colors.white} />
                          <Text style={styles.featuredMetaText} numberOfLines={1}>
                            {p.location}
                          </Text>
                        </View>
                      <Text style={styles.featuredPrice}>{p.starting_price > 0 ? `From ${formatINR(p.starting_price)}` : "Price on request"}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Browse Categories</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryScroll}
              >
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat.key}
                    testID={`home-category-${cat.key}`}
                    style={[styles.categoryPill, category === cat.key && styles.categoryPillActive]}
                    onPress={() => setCategory(cat.key)}
                  >
                    <Feather
                      name={cat.icon}
                      size={14}
                      color={category === cat.key ? colors.white : colors.primary}
                    />
                    <Text style={[styles.categoryText, category === cat.key && styles.categoryTextActive]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
            {category === "all" ? "All Properties" : category} ({properties.length})
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.propertyCell, propertyColumns > 1 && styles.propertyCellDesktop]}>
            <PropertyCard property={item} onPress={() => openPropertyDetails(item.id)} onAvailability={() => openAvailability(item.id)} compact={useCompactPropertyCard} />
          </View>
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View style={styles.empty}>
              <Feather name="inbox" size={48} color={colors.stone300} />
              <Text style={styles.emptyText}>No properties match your filters</Text>
            </View>
          )
        }
      />
      <CustomerAuthModal
        visible={authModalVisible}
        mode={authModalMode}
        onClose={() => {
          setAuthModalVisible(false);
          setPendingRoute(null);
        }}
        onSuccess={handleAuthSuccess}
      />
      </View>
    </SafeAreaView>
  );
}

export default HomeScreen;

function formatRelationshipStatus(type?: string, status?: string) {
  const prettyType = String(type || "relationship")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
  const prettyStatus = String(status || "active")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
  return `${prettyType} - ${prettyStatus}`;
}

function PropertyCard({ property, onPress, onAvailability, compact }: { property: any; onPress: () => void; onAvailability: () => void; compact?: boolean }) {
  const priceText = property.starting_price > 0 ? formatINR(property.starting_price) : "Price on request";

  return (
    <TouchableOpacity
      testID={`home-property-${property.id}`}
      style={[styles.propertyCard, compact && styles.propertyCardCompact]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <PropertyMedia image={property.image} videoUrl={property.videoUrl} style={[styles.propertyImage, compact && styles.propertyImageCompact]} />
      <View style={styles.propertyImageOverlay}>
        <View style={styles.availabilityBadge}>
          <View style={styles.availabilityDot} />
          <Text style={styles.availabilityText}>{property.availability || "Available"}</Text>
        </View>
        <View style={styles.categoryPillSmall}>
          <Text style={styles.categoryPillTextSmall}>{property.category}</Text>
        </View>
      </View>
      <View style={styles.propertyBody}>
        <Text style={styles.propertyName} numberOfLines={1}>
          {property.name}
        </Text>
        <View style={styles.propertyMeta}>
          <Feather name="map-pin" size={12} color={colors.stone500} />
          <Text style={styles.propertyMetaText} numberOfLines={1}>
            {property.location}
          </Text>
        </View>
        <View style={styles.propertyMeta}>
          <Feather name="maximize-2" size={12} color={colors.stone500} />
          <Text style={styles.propertyMetaText}>{property.size}</Text>
        </View>
        {property.highlights ? (
          <Text style={styles.highlights} numberOfLines={1}>
            Featured: {property.highlights}
          </Text>
        ) : null}
        <View style={styles.propertyFooter}>
          <View>
            <Text style={styles.priceLabel}>Starting at</Text>
            <Text style={styles.price}>{priceText}</Text>
          </View>
          <TouchableOpacity testID={`home-view-${property.id}`} style={styles.viewBtn} onPress={onPress}>
            <Text style={styles.viewBtnText}>View Property</Text>
            <Feather name="arrow-right" size={14} color={colors.white} />
          </TouchableOpacity>
        </View>
        <View style={styles.availabilitySection}>
          <View style={styles.availabilityHeader}>
            <Text style={styles.availabilitySectionTitle}>Availability</Text>
          </View>
          <View style={styles.availabilityPanel}>
            <View style={styles.availabilityPanelIcon}>
              <Feather name="map" size={18} color={colors.primary} />
            </View>
            <View style={styles.availabilityPanelBody}>
              <Text style={styles.availabilityPanelTitle}>Plans and availability</Text>
              <Text style={styles.availabilityPanelText} numberOfLines={2}>
                Open the property to review facade images, east and west floor plans, and the attached project map.
              </Text>
            </View>
            <TouchableOpacity
              testID={`home-availability-${property.id}`}
              style={styles.availabilityActionBtn}
              onPress={onAvailability}
              accessibilityRole="button"
              accessibilityLabel={`Open availability map for ${property.name}`}
            >
              <Text style={styles.availabilityActionText}>Availability</Text>
              <Feather name="arrow-up-right" size={15} color={colors.white} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.offWhite },
  shell: { flex: 1, width: "100%", alignSelf: "center" },
  shellDesktop: { maxWidth: 1440, width: "100%", alignSelf: "center" },
  listContent: { paddingBottom: 80 },
  listContentDesktop: { paddingBottom: 120, paddingHorizontal: spacing.lg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.stone100,
  },
  headerDesktop: { borderRadius: 0 },
  headerLeft: { flex: 1, gap: 6 },
  headerRight: { flexDirection: "row", gap: 8 },
  authActions: { flexDirection: "row", gap: 10, alignItems: "center" },
  authGhostBtn: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: radii.full,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.stone200,
    alignItems: "center",
    justifyContent: "center",
  },
  authGhostText: { ...typography.body, color: colors.primaryDeepest, fontWeight: "700" },
  authPrimaryBtn: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  authPrimaryText: { ...typography.body, color: colors.white, fontWeight: "700" },
  locationBtn: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", backgroundColor: colors.offWhite, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radii.full },
  locationText: { ...typography.small, color: colors.stone900, fontWeight: "600" },
  greeting: { ...typography.h2, color: colors.primaryDeepest, fontWeight: "800" },
  headerSubtitle: { ...typography.body, color: colors.stone600, maxWidth: 560 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    backgroundColor: colors.offWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: colors.white, fontSize: 9, fontWeight: "700" },
  locationDropdown: {
    backgroundColor: colors.white,
    marginHorizontal: spacing.lg,
    borderRadius: radii.md,
    padding: spacing.sm,
    ...shadow.md,
  },
  locationDropdownDesktop: { maxWidth: 360 },
  heroBand: { marginHorizontal: spacing.lg, marginTop: spacing.lg, gap: spacing.md },
  heroBandDesktop: { flexDirection: "row", alignItems: "stretch" },
  heroSearchCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.stone100,
    padding: spacing.md,
    gap: spacing.md,
    ...shadow.sm,
  },
  heroSearchCardExpanded: { width: "100%" },
  locationItem: { flexDirection: "row", alignItems: "center", gap: 8, padding: spacing.sm },
  locationItemText: { ...typography.body, color: colors.stone700 },
  locationItemActive: { color: colors.primary, fontWeight: "600" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.stone100,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.stone900 },
  section: { marginTop: spacing.lg, paddingHorizontal: spacing.lg },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  sectionTitle: { ...typography.h3, color: colors.primaryDeepest, fontWeight: "700" },
  featuredTag: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.accentSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.full },
  featuredTagText: { ...typography.label, color: colors.accentDark, fontSize: 10 },
  featuredScroll: { gap: spacing.md, paddingRight: spacing.lg },
  featuredCard: { width: 280, height: 200, borderRadius: radii.lg, overflow: "hidden", ...shadow.md },
  featuredCardDesktop: { width: 360, height: 230 },
  featuredImage: { width: "100%", height: "100%", position: "absolute" },
  featuredOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(5,47,15,0.45)" },
  featuredContent: { flex: 1, padding: spacing.md, justifyContent: "flex-end", gap: 4 },
  featuredName: { ...typography.h3, color: colors.white, fontWeight: "700", marginTop: 4 },
  featuredMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  featuredMetaText: { ...typography.small, color: colors.white },
  featuredPrice: { ...typography.bodyLarge, color: colors.accentLight, fontWeight: "700", marginTop: 2 },
  categoryScroll: { gap: spacing.sm, paddingRight: spacing.lg },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.stone200,
  },
  categoryPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryText: { ...typography.body, color: colors.primary, fontWeight: "600" },
  categoryTextActive: { color: colors.white },
  categoryPillSmall: { backgroundColor: "rgba(255,255,255,0.92)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.sm, alignSelf: "flex-start" },
  categoryPillTextSmall: { ...typography.label, color: colors.primary, fontSize: 9 },
  quickActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  quickAction: { minWidth: 88, flexGrow: 1, alignItems: "center", gap: 6, backgroundColor: colors.offWhite, borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  quickIcon: { width: 52, height: 52, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  quickLabel: { ...typography.small, color: colors.stone700, fontWeight: "600" },
  relationshipCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.white, borderRadius: radii.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.stone100, ...shadow.sm },
  relationshipAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  relationshipBody: { flex: 1, gap: 2 },
  relationshipName: { ...typography.body, color: colors.primaryDeepest, fontWeight: "700" },
  relationshipMeta: { ...typography.small, color: colors.stone600 },
  relationshipStatus: { ...typography.small, color: colors.accent, fontWeight: "700", marginTop: 2 },
  relationshipHint: { ...typography.small, color: colors.stone500, marginTop: 2 },
  relationshipAction: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.offWhite, alignItems: "center", justifyContent: "center" },
  propertyRow: { gap: spacing.md, justifyContent: "space-between" },
  propertyCell: { width: "100%", marginBottom: spacing.md },
  propertyCellDesktop: { flex: 1 },
  propertyCard: { backgroundColor: colors.white, borderRadius: radii.lg, overflow: "hidden", ...shadow.sm, width: "100%", alignSelf: "center", borderWidth: 1, borderColor: colors.stone100 },
  propertyCardCompact: { minHeight: 100, flexDirection: "row" },
  propertyImage: { width: "100%", height: 200, backgroundColor: colors.stone100 },
  propertyImageCompact: { width: 220, height: "100%" },
  propertyImageOverlay: { position: "absolute", top: spacing.md, left: spacing.md, right: spacing.md, flexDirection: "row", justifyContent: "space-between" },
  availabilityBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(16,185,129,0.95)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.sm },
  availabilityDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.white },
  availabilityText: { ...typography.label, color: colors.white, fontSize: 9 },
  propertyBody: { padding: spacing.md, gap: 4 },
  propertyName: { ...typography.h4, color: colors.primaryDeepest, fontWeight: "700" },
  propertyMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  propertyMetaText: { ...typography.small, color: colors.stone600 },
  highlights: { ...typography.small, color: colors.accent, fontWeight: "600", marginTop: 4 },
  propertyFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  priceLabel: { ...typography.small, color: colors.stone500 },
  price: { ...typography.h4, color: colors.primary, fontWeight: "700" },
  viewBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radii.md },
  viewBtnText: { ...typography.body, color: colors.white, fontWeight: "700" },
  availabilitySection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.stone100,
    gap: spacing.sm,
  },
  availabilityHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  availabilitySectionTitle: {
    ...typography.body,
    color: colors.primaryDeepest,
    fontWeight: "700",
  },
  availabilityPanel: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    backgroundColor: colors.offWhite,
    borderRadius: radii.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.stone100,
  },
  availabilityPanelIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#E6F4EA",
    alignItems: "center",
    justifyContent: "center",
  },
  availabilityPanelBody: {
    flex: 1,
    minWidth: 180,
    gap: 3,
  },
  availabilityPanelTitle: { ...typography.body, color: colors.primaryDeepest, fontWeight: "700" },
  availabilityPanelText: {
    ...typography.small,
    color: colors.stone600,
  },
  availabilityActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radii.md,
    marginLeft: "auto",
  },
  availabilityActionText: {
    ...typography.body,
    color: colors.white,
    fontWeight: "700",
  },
  empty: { padding: spacing.xl, alignItems: "center", gap: spacing.sm },
  emptyText: { ...typography.body, color: colors.stone500 },
});

