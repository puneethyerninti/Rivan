import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import CustomerAuthModal from "@/src/components/CustomerAuthModal";
import { PropertyMedia } from "@/src/components/PropertyMedia";
import { mockProperties } from "@/src/mock-data";
import { normalizePropertyCollection, normalizePropertyRecord, type NormalizedProperty } from "@/src/property-presenter";
import { colors, formatINR, radii, shadow, spacing, typography } from "@/src/theme";

const LOGO = require("../../assets/images/rivan-logo.png");

const NAV_ITEMS = [
  { key: "home", label: "Home" },
  { key: "discover", label: "Discover" },
  { key: "trust", label: "Trust" },
  { key: "access", label: "Access" },
] as const;

const SEARCH_FILTERS = ["All", "Homes", "Plots", "Verified", "Premium"] as const;

const TRUST_POINTS = [
  "Property-first browsing",
  "Role-based actions kept secondary",
  "Cleaner search and card hierarchy",
] as const;

type SectionKey = (typeof NAV_ITEMS)[number]["key"];

function buildFallbackProperties() {
  return mockProperties
    .map((item) => normalizePropertyRecord(item))
    .filter((item): item is NormalizedProperty => Boolean(item));
}

function getUserInitials(name?: string) {
  const parts = String(name || "Rivan User")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return "RU";
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function getUserDisplayName(user?: { name?: string; phone?: string } | null) {
  return user?.name?.trim() || user?.phone?.trim() || "Rivan User";
}

export function HomeScreen() {
  const router = useRouter();
  const { isAuthed, signOut, user } = useAuth();
  const scrollRef = useRef<ScrollView | null>(null);
  const { width } = useWindowDimensions();

  const isDesktop = width >= 1120;
  const isTablet = width >= 760;

  const [menuOpen, setMenuOpen] = useState(false);
  const [authVisible, setAuthVisible] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [query, setQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<(typeof SEARCH_FILTERS)[number]>("All");
  const [sectionOffsets, setSectionOffsets] = useState<Record<string, number>>({});
  const [properties, setProperties] = useState<NormalizedProperty[]>(buildFallbackProperties());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadProperties() {
      try {
        const featured = normalizePropertyCollection(await api.featured());
        if (featured.length) {
          if (active) setProperties(featured);
          return;
        }

        const listed = normalizePropertyCollection(await api.listProperties());
        if (listed.length && active) {
          setProperties(listed);
        }
      } catch {
        if (active) {
          setProperties(buildFallbackProperties());
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadProperties();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const html = document.documentElement;
    const previousScrollBehavior = html.style.scrollBehavior;
    html.style.scrollBehavior = "smooth";
    return () => {
      html.style.scrollBehavior = previousScrollBehavior;
    };
  }, []);

  const heroProperty = properties[0] || null;

  const featuredCards = useMemo(() => {
    return properties.slice(0, 6);
  }, [properties]);

  const filteredCards = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return featuredCards.filter((property) => {
      const corpus = [
        property.name,
        property.location,
        property.category,
        property.description,
        property.highlights,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesQuery = !normalizedQuery || corpus.includes(normalizedQuery);
      const matchesFilter =
        selectedFilter === "All" ||
        corpus.includes(selectedFilter.toLowerCase()) ||
        property.category.toLowerCase().includes(selectedFilter.toLowerCase());

      return matchesQuery && matchesFilter;
    });
  }, [featuredCards, query, selectedFilter]);

  const openAuth = useCallback((mode: "login" | "signup") => {
    setAuthMode(mode);
    setAuthVisible(true);
    setMenuOpen(false);
  }, []);

  const handleSectionLayout = useCallback((key: string, event: LayoutChangeEvent) => {
    setSectionOffsets((current) => ({ ...current, [key]: event.nativeEvent.layout.y }));
  }, []);

  const scrollToSection = useCallback(
    (key: SectionKey) => {
      const y = sectionOffsets[key] ?? 0;
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 84), animated: true });
      setMenuOpen(false);
    },
    [sectionOffsets]
  );

  const openProperty = useCallback(
    (propertyId?: string) => {
      if (!propertyId) return;
      router.push(`/property/${propertyId}`);
    },
    [router]
  );

  const navActions = (
    <>
      {NAV_ITEMS.map((item) => (
        <TouchableOpacity key={item.key} onPress={() => scrollToSection(item.key)} style={styles.navLink}>
          <Text style={styles.navLinkText}>{item.label}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity onPress={() => router.push("/agent-login")} style={styles.navSecondary}>
        <Text style={styles.navSecondaryText}>Agent</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push("/admin-login")} style={styles.navSecondary}>
        <Text style={styles.navSecondaryText}>Admin</Text>
      </TouchableOpacity>
      {isAuthed ? (
        <>
          <TouchableOpacity
            onPress={() => {
              router.push("/profile");
              setMenuOpen(false);
            }}
            style={styles.profileChip}
          >
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarText}>{getUserInitials(user?.name)}</Text>
            </View>
            <View style={styles.profileCopy}>
              <Text style={styles.profileName}>{getUserDisplayName(user)}</Text>
              <Text style={styles.profileLink}>Profile</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              await signOut();
              setMenuOpen(false);
            }}
            style={styles.navPrimary}
          >
            <Text style={styles.navPrimaryText}>Sign Out</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity onPress={() => openAuth("login")} style={styles.navPrimary}>
          <Text style={styles.navPrimaryText}>User Login / Signup</Text>
        </TouchableOpacity>
      )}
    </>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.offWhite} />

      <CustomerAuthModal
        visible={authVisible}
        mode={authMode}
        onClose={() => setAuthVisible(false)}
        onSuccess={() => setAuthVisible(false)}
      />

      <Modal animationType="fade" transparent visible={menuOpen && !isDesktop} onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.menuSheet}>
            <Text style={styles.menuTitle}>Navigate Rivan</Text>
            <Text style={styles.menuBody}>Discovery stays primary while customer, agent, and admin access remain easy to reach.</Text>
            <View style={styles.menuLinks}>{navActions}</View>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={["#FCF9F2", "#F1F6F0", "#F8F5ED"]} style={styles.heroWrap}>
          <View style={[styles.navbar, isDesktop && styles.navbarDesktop]}>
            <View style={styles.brandCluster}>
              <View style={styles.brandBadge}>
                <Image source={LOGO} style={styles.brandImage} resizeMode="contain" />
              </View>
              <View>
                <Text style={styles.brandWordmark}>RIVAN</Text>
                <Text style={styles.brandCaption}>Premium real estate discovery</Text>
              </View>
            </View>

            {isDesktop ? (
              <View style={styles.navDesktop}>{navActions}</View>
            ) : (
              <TouchableOpacity style={styles.menuButton} onPress={() => setMenuOpen(true)}>
                <Feather name="menu" size={20} color={colors.primaryDeepest} />
              </TouchableOpacity>
            )}
          </View>

          <View onLayout={(event) => handleSectionLayout("home", event)} style={[styles.heroSection, isDesktop && styles.heroSectionDesktop]}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroKicker}>Search-first property experience</Text>
              <Text style={styles.heroTitle}>Discover homes and plots through a calmer, premium browsing flow.</Text>
              <Text style={styles.heroBody}>
                Property discovery leads the experience now. Pricing, availability, and the next best action are easier to understand across both web and mobile.
              </Text>

              <View style={styles.heroActions}>
                <TouchableOpacity style={styles.primaryButton} onPress={() => scrollToSection("discover")}>
                  <Text style={styles.primaryButtonText}>Explore properties</Text>
                </TouchableOpacity>
                {heroProperty ? (
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => openProperty(heroProperty.id)}>
                    <Text style={styles.secondaryButtonText}>Open featured listing</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={styles.trustRail}>
                {TRUST_POINTS.map((point) => (
                  <View key={point} style={styles.trustPill}>
                    <Feather name="check" size={13} color={colors.primaryDark} />
                    <Text style={styles.trustPillText}>{point}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.heroVisual}>
              <View style={styles.showcaseCard}>
                {heroProperty?.image ? (
                  <>
                    <PropertyMedia image={heroProperty.image} videoUrl={heroProperty.videoUrl} style={styles.showcaseImage} />
                    <LinearGradient colors={["rgba(10,45,28,0.02)", "rgba(10,45,28,0.84)"]} style={styles.showcaseOverlay} />
                    <View style={styles.showcaseContent}>
                      <Text style={styles.showcaseEyebrow}>Featured today</Text>
                      <Text style={styles.showcaseTitle}>{heroProperty.name}</Text>
                      <Text style={styles.showcaseLocation}>{heroProperty.location || "Premium project location"}</Text>
                    </View>
                  </>
                ) : (
                  <View style={styles.loadingState}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                )}
              </View>

              {heroProperty ? (
                <View style={[styles.metricRow, isTablet && styles.metricRowTablet]}>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>Starting from</Text>
                    <Text style={styles.metricValue}>{heroProperty.startingPrice ? formatINR(heroProperty.startingPrice) : "On request"}</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>Category</Text>
                    <Text style={styles.metricValue}>{heroProperty.category || "Property"}</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>Availability</Text>
                    <Text style={styles.metricValue}>{heroProperty.availability || "Open for enquiry"}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        </LinearGradient>

        <View style={styles.mainWrap}>
          <View style={styles.searchPanel}>
            <View style={styles.searchHead}>
              <Text style={styles.sectionEyebrow}>Discover</Text>
              <Text style={styles.searchTitle}>Search and shortlist without the clutter.</Text>
            </View>

            <View style={[styles.searchRow, isTablet && styles.searchRowTablet]}>
              <View style={styles.searchField}>
                <Feather name="search" size={18} color={colors.stone400} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search by location, category, project name"
                  placeholderTextColor={colors.stone400}
                  style={styles.searchInput}
                />
                {query ? (
                  <TouchableOpacity onPress={() => setQuery("")}>
                    <Feather name="x" size={18} color={colors.stone400} />
                  </TouchableOpacity>
                ) : null}
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {SEARCH_FILTERS.map((filter) => {
                  const active = selectedFilter === filter;
                  return (
                    <TouchableOpacity
                      key={filter}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => setSelectedFilter(filter)}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{filter}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          <View onLayout={(event) => handleSectionLayout("discover", event)} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionEyebrow}>Featured collection</Text>
              <Text style={styles.sectionTitle}>Production inventory first, local fallback only when needed.</Text>
              <Text style={styles.sectionBody}>
                The homepage now prefers live backend property data. Local mock content only helps when inventory is temporarily unavailable.
              </Text>
            </View>

            {loading ? (
              <View style={styles.inlineLoader}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.inlineLoaderText}>Loading featured properties...</Text>
              </View>
            ) : (
              <View style={[styles.cardGrid, isDesktop && styles.cardGridDesktop]}>
                {filteredCards.map((property) => (
                  <TouchableOpacity
                    key={property.id}
                    style={[styles.propertyCard, isDesktop && styles.propertyCardDesktop]}
                    activeOpacity={0.95}
                    onPress={() => openProperty(property.id)}
                  >
                    {property.image ? (
                      <PropertyMedia image={property.image} videoUrl={property.videoUrl} style={styles.propertyImage} />
                    ) : (
                      <View style={styles.propertyImageFallback} />
                    )}
                    <View style={styles.propertyContent}>
                      <View style={styles.propertyMetaRow}>
                        <Text style={styles.propertyEyebrow}>{property.category || "Property"}</Text>
                        <Text style={styles.propertyStat}>{property.startingPrice ? formatINR(property.startingPrice) : "On request"}</Text>
                      </View>
                      <Text style={styles.propertyTitle}>{property.name}</Text>
                      <Text style={styles.propertySubtitle}>{property.location || "Premium location"}</Text>
                      <Text style={styles.propertyCopy} numberOfLines={3}>
                        {property.description || property.highlights || "A refined real-estate experience with clearer details and smoother discovery."}
                      </Text>
                      <View style={styles.propertyActionRow}>
                        <Text style={styles.propertyActionText}>View property</Text>
                        <Feather name="arrow-up-right" size={16} color={colors.primaryDeepest} />
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View onLayout={(event) => handleSectionLayout("trust", event)} style={styles.section}>
            <View style={[styles.trustGrid, isDesktop && styles.trustGridDesktop]}>
              <LinearGradient colors={["#0A2D1C", "#114028"]} style={styles.storyPanel}>
                <Text style={styles.storyEyebrow}>Trust by design</Text>
                <Text style={styles.storyTitle}>Better hierarchy turns browsing into decision-making.</Text>
                <Text style={styles.storyBody}>
                  Important information now appears in clearer groups: what the property is, where it sits, how much it starts at, and where the user should go next.
                </Text>
              </LinearGradient>

              <View style={styles.detailColumn}>
                <View style={styles.detailCard}>
                  <Text style={styles.detailLabel}>What stays strong</Text>
                  {["Same routes", "Same auth actions", "Same backend integration", "Cleaner public journey"].map((item) => (
                    <View key={item} style={styles.detailItem}>
                      <Feather name="check-circle" size={16} color={colors.primary} />
                      <Text style={styles.detailItemText}>{item}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.detailCard}>
                  <Text style={styles.detailLabel}>Where to continue</Text>
                  {[
                    "Browse public listings from the homepage",
                    "Open plot layout from property detail",
                    "Book visits from the centre route",
                    "Use profile for account and role shortcuts",
                  ].map((item) => (
                    <View key={item} style={styles.detailItem}>
                      <Feather name="arrow-right" size={16} color={colors.accentDark} />
                      <Text style={styles.detailItemText}>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </View>

          <View onLayout={(event) => handleSectionLayout("access", event)} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionEyebrow}>Access</Text>
              <Text style={styles.sectionTitle}>Customer, agent, and admin entry stay available without crowding the homepage.</Text>
            </View>

            <View style={[styles.accessGrid, isDesktop && styles.accessGridDesktop]}>
              <TouchableOpacity style={styles.accessCard} onPress={() => openAuth("signup")}>
                <Text style={styles.accessTitle}>User account</Text>
                <Text style={styles.accessBody}>Sign in when ready to save properties, manage bookings, and continue the journey.</Text>
                <Text style={styles.accessLink}>Open user access</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.accessCard} onPress={() => router.push("/agent-login")}>
                <Text style={styles.accessTitle}>Agent entry</Text>
                <Text style={styles.accessBody}>Approved agents can go directly into the dashboard while the public experience stays property-first.</Text>
                <Text style={styles.accessLink}>Open agent login</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.accessCard} onPress={() => router.push("/admin-login")}>
                <Text style={styles.accessTitle}>Admin console</Text>
                <Text style={styles.accessBody}>Operations remain accessible without visually dominating the public product surface.</Text>
                <Text style={styles.accessLink}>Open admin login</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default HomeScreen;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.offWhite },
  scroll: { flex: 1 },
  content: { paddingBottom: 80 },
  heroWrap: { paddingBottom: spacing.xxxl },
  navbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  navbarDesktop: { paddingHorizontal: 56, paddingTop: spacing.xl },
  brandCluster: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  brandBadge: {
    width: 58,
    height: 58,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.sm,
  },
  brandImage: { width: 30, height: 30 },
  brandWordmark: { ...typography.label, fontSize: 14, letterSpacing: 5, color: colors.primaryDeepest },
  brandCaption: { marginTop: 4, ...typography.small, color: colors.stone500 },
  navDesktop: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: spacing.sm,
    flex: 1,
    marginLeft: spacing.xl,
  },
  navLink: { paddingHorizontal: spacing.md, paddingVertical: 10 },
  navLinkText: { ...typography.small, fontWeight: "700", color: colors.stone600 },
  navSecondary: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  navSecondaryText: { ...typography.small, fontWeight: "700", color: colors.primaryDeepest },
  navPrimary: {
    minHeight: 46,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.sm,
  },
  navPrimaryText: { ...typography.small, fontWeight: "800", color: colors.white },
  profileChip: {
    minHeight: 52,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    ...shadow.sm,
  },
  profileAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  profileAvatarText: { ...typography.small, fontWeight: "800", color: colors.primaryDeepest },
  profileCopy: { gap: 2 },
  profileName: { ...typography.small, fontWeight: "800", color: colors.primaryDeepest },
  profileLink: { ...typography.small, color: colors.stone500 },
  menuButton: {
    width: 46,
    height: 46,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  menuBackdrop: { flex: 1, backgroundColor: "rgba(10,45,28,0.18)", justifyContent: "flex-start" },
  menuSheet: {
    marginTop: 84,
    marginHorizontal: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    ...shadow.md,
  },
  menuTitle: { ...typography.h3, color: colors.primaryDeepest },
  menuBody: { marginTop: spacing.sm, ...typography.body, color: colors.stone500 },
  menuLinks: { marginTop: spacing.xl, gap: spacing.sm },
  heroSection: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, gap: spacing.xxl },
  heroSectionDesktop: { flexDirection: "row", alignItems: "stretch", paddingHorizontal: 56 },
  heroCopy: { flex: 1, gap: spacing.lg },
  heroKicker: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    ...typography.small,
    fontWeight: "700",
    color: colors.primaryDark,
  },
  heroTitle: {
    ...typography.h1,
    color: colors.primaryDeepest,
    fontSize: Platform.OS === "web" ? 50 : 40,
    lineHeight: Platform.OS === "web" ? 58 : 48,
    maxWidth: 700,
  },
  heroBody: { ...typography.bodyLarge, color: colors.stone500, maxWidth: 620 },
  heroActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  primaryButton: {
    minHeight: 56,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.sm,
  },
  primaryButtonText: { ...typography.body, fontWeight: "800", color: colors.white },
  secondaryButton: {
    minHeight: 56,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: { ...typography.body, fontWeight: "700", color: colors.primaryDeepest },
  trustRail: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  trustPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.76)",
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  trustPillText: { ...typography.small, fontWeight: "700", color: colors.primaryDeepest },
  heroVisual: { flex: 0.96, gap: spacing.lg },
  showcaseCard: {
    minHeight: 360,
    borderRadius: 30,
    overflow: "hidden",
    backgroundColor: colors.surfaceMuted,
    ...shadow.lg,
  },
  showcaseImage: { width: "100%", height: "100%" },
  showcaseOverlay: { ...StyleSheet.absoluteFillObject },
  showcaseContent: { position: "absolute", left: spacing.xl, right: spacing.xl, bottom: spacing.xl, gap: spacing.sm },
  showcaseEyebrow: { ...typography.label, color: "#D7E7DD" },
  showcaseTitle: { ...typography.h2, color: colors.white },
  showcaseLocation: { ...typography.body, color: "#E5EDE7" },
  metricRow: { gap: spacing.md },
  metricRowTablet: { flexDirection: "row" },
  metricCard: {
    flex: 1,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.xl,
    ...shadow.sm,
  },
  metricLabel: { ...typography.label, color: colors.stone400 },
  metricValue: { marginTop: spacing.sm, ...typography.h4, color: colors.primaryDeepest },
  mainWrap: { marginTop: -18, paddingHorizontal: spacing.xl },
  searchPanel: {
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.xl,
    ...shadow.md,
  },
  searchHead: { gap: spacing.sm },
  searchTitle: { ...typography.h3, color: colors.primaryDeepest },
  searchRow: { marginTop: spacing.lg, gap: spacing.md },
  searchRowTablet: { flexDirection: "row", alignItems: "center" },
  searchField: {
    flex: 1,
    minHeight: 58,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  searchInput: { flex: 1, ...typography.body, color: colors.primaryDeepest },
  filterRow: { gap: spacing.sm, paddingVertical: 2 },
  filterChip: {
    minHeight: 42,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primaryDark },
  filterChipText: { ...typography.small, fontWeight: "700", color: colors.stone600 },
  filterChipTextActive: { color: colors.white },
  section: { paddingTop: spacing.xxxl, gap: spacing.xl },
  sectionHeader: { gap: spacing.sm, maxWidth: 760 },
  sectionEyebrow: { ...typography.label, color: colors.primary },
  sectionTitle: { ...typography.h2, color: colors.primaryDeepest },
  sectionBody: { ...typography.body, color: colors.stone500 },
  inlineLoader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  inlineLoaderText: { ...typography.body, color: colors.stone500 },
  cardGrid: { gap: spacing.lg },
  cardGridDesktop: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  propertyCard: {
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    ...shadow.md,
  },
  propertyCardDesktop: { width: "31.7%" },
  propertyImage: { width: "100%", height: 244, backgroundColor: colors.surfaceMuted },
  propertyImageFallback: { width: "100%", height: 244, backgroundColor: colors.surfaceMuted },
  propertyContent: { padding: spacing.xl },
  propertyMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  propertyEyebrow: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    ...typography.small,
    fontWeight: "700",
    color: colors.primaryDark,
  },
  propertyStat: { ...typography.small, fontWeight: "700", color: colors.stone500 },
  propertyTitle: { marginTop: spacing.lg, ...typography.h3, color: colors.primaryDeepest },
  propertySubtitle: { marginTop: spacing.sm, ...typography.small, fontWeight: "700", color: colors.stone500 },
  propertyCopy: { marginTop: spacing.md, ...typography.body, color: colors.stone500 },
  propertyActionRow: { marginTop: spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  propertyActionText: { ...typography.small, fontWeight: "800", color: colors.primaryDeepest },
  trustGrid: { gap: spacing.lg },
  trustGridDesktop: { flexDirection: "row", alignItems: "stretch" },
  storyPanel: {
    flex: 1,
    borderRadius: 30,
    padding: spacing.xxl,
    gap: spacing.md,
    ...shadow.lg,
  },
  storyEyebrow: { ...typography.label, color: colors.accentLight },
  storyTitle: { ...typography.h2, color: colors.white },
  storyBody: { ...typography.body, color: "#D7E7DD" },
  detailColumn: { flex: 1, gap: spacing.lg },
  detailCard: {
    flex: 1,
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.xl,
    ...shadow.sm,
  },
  detailLabel: { ...typography.h4, color: colors.primaryDeepest },
  detailItem: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, marginTop: spacing.lg },
  detailItemText: { flex: 1, ...typography.body, color: colors.stone500 },
  accessGrid: { gap: spacing.lg },
  accessGridDesktop: { flexDirection: "row", justifyContent: "space-between" },
  accessCard: {
    flex: 1,
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.xl,
    ...shadow.sm,
  },
  accessTitle: { ...typography.h4, color: colors.primaryDeepest },
  accessBody: { marginTop: spacing.md, ...typography.body, color: colors.stone500 },
  accessLink: { marginTop: spacing.xl, ...typography.small, fontWeight: "800", color: colors.primaryDeepest },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center" },
});
