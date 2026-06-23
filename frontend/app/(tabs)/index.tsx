import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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

import { useAuth } from "@/src/auth-context";
import CustomerAuthModal from "@/src/components/CustomerAuthModal";
import { PropertyMedia } from "@/src/components/PropertyMedia";
import { mockProperties } from "@/src/mock-data";
import { colors } from "@/src/theme";

const LOGO = require("../../assets/images/rivan-logo.png");

const NAV_ITEMS = [
  { key: "home", label: "Home" },
  { key: "properties", label: "Properties" },
  { key: "categories", label: "Categories" },
  { key: "about", label: "About" },
  { key: "contact", label: "Contact" },
] as const;

const CATEGORIES = [
  { label: "Independent Homes", icon: "home", accent: "#E8F6EC" },
  { label: "Apartments", icon: "grid", accent: "#F5F1E8" },
  { label: "Plots & Land", icon: "map", accent: "#EAF6EE" },
  { label: "Commercial", icon: "briefcase", accent: "#FCEDEA" },
  { label: "Farm Estates", icon: "sun", accent: "#EEF8EA" },
  { label: "New Launches", icon: "star", accent: "#F7F5E8" },
] as const;

const HERO_SLIDES = [
  {
    eyebrow: "Curated Discovery",
    title: "Property search that feels calm, clear, and premium.",
    body: "Explore featured homes, trending layouts, and trusted inventory without signing in first.",
  },
  {
    eyebrow: "Guest First",
    title: "Browse before login and convert only when you're ready.",
    body: "Save friction for later. Discovery, pricing cues, and property context stay open to guests from the first screen.",
  },
  {
    eyebrow: "Unified Access",
    title: "Customer, agent, and admin entry points live in one clean navigation system.",
    body: "Every role can find the right next step without crowding the main browsing experience.",
  },
] as const;

const TRUST_POINTS = [
  "Property-focused home experience",
  "Guest browsing without forced sign-in",
  "Clear agent and admin entry points",
  "Minimal UI with stronger conversion cues",
] as const;

const FEATURE_STRIPS = [
  { title: "Featured", value: "Premium picks updated weekly" },
  { title: "Trending", value: "High-intent inventory with better visibility" },
  { title: "Categories", value: "Homes, plots, commercial, and more" },
] as const;

type SectionKey = (typeof NAV_ITEMS)[number]["key"];

export function HomeScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView | null>(null);
  const { user, isAuthed, signOut } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1100;
  const isTablet = width >= 760;
  const carouselCardWidth = isDesktop ? 360 : Math.max(280, width - 48);
  const carouselSnapInterval = carouselCardWidth + 12;

  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [menuOpen, setMenuOpen] = useState(false);
  const [authVisible, setAuthVisible] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [sectionOffsets, setSectionOffsets] = useState<Record<string, number>>({});

  const property = mockProperties[0];

  const curatedProperties = useMemo(() => {
    if (!property) return [];
    return [
      {
        id: `${property.id}-featured`,
        title: property.name,
        location: property.location,
        price: "From Rs 16 Lakhs",
        tag: "Featured",
        image: property.image,
        summary: "Independent house experience with ready enquiry flow and layout visibility.",
        cta: "View Details",
      },
      {
        id: `${property.id}-trending`,
        title: "Sripuram East-Facing Collection",
        location: "Achutapuram, Visakhapatnam",
        price: "Most searched this week",
        tag: "Trending",
        image: property.images?.[1] || property.image,
        summary: "Popular among families comparing frontage, access, and layout efficiency.",
        cta: "Explore Trending",
      },
      {
        id: `${property.id}-layout`,
        title: "Layout & Plot Discovery",
        location: property.location,
        price: "454 plots in focus",
        tag: "Layout",
        image: property.availabilityImage || property.image,
        summary: "Map-led browsing built for faster shortlisting and more confident follow-ups.",
        cta: "Open Layout",
      },
    ];
  }, [property]);

  const filteredProperties = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return curatedProperties.filter((item) => {
      const matchesQuery =
        !normalizedQuery ||
        item.title.toLowerCase().includes(normalizedQuery) ||
        item.location.toLowerCase().includes(normalizedQuery) ||
        item.summary.toLowerCase().includes(normalizedQuery);
      const matchesCategory =
        selectedCategory === "All" ||
        item.title.toLowerCase().includes(selectedCategory.toLowerCase()) ||
        item.summary.toLowerCase().includes(selectedCategory.toLowerCase());
      return matchesQuery && matchesCategory;
    });
  }, [curatedProperties, query, selectedCategory]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const html = document.documentElement;
    const previousScrollBehavior = html.style.scrollBehavior;
    html.style.scrollBehavior = "smooth";
    return () => {
      html.style.scrollBehavior = previousScrollBehavior;
    };
  }, []);

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

  const handlePropertyOpen = useCallback(() => {
    if (!property) return;
    router.push(`/property/${property.id}`);
  }, [property, router]);

  const onCarouselScroll = useCallback(
    (event: any) => {
      if (carouselSnapInterval <= 0) return;
      const index = Math.round(event.nativeEvent.contentOffset.x / carouselSnapInterval);
      setCarouselIndex(index);
    },
    [carouselSnapInterval]
  );

  const navButtons = (
    <>
      {NAV_ITEMS.map((item) => (
        <TouchableOpacity key={item.key} onPress={() => scrollToSection(item.key)} style={styles.navLinkButton}>
          <Text style={styles.navLinkText}>{item.label}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity onPress={() => router.push("/agent-login")} style={styles.navSecondaryButton}>
        <Text style={styles.navSecondaryText}>Agent Login</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push("/admin-login")} style={styles.navSecondaryButton}>
        <Text style={styles.navSecondaryText}>Admin Login</Text>
      </TouchableOpacity>
      {isAuthed ? (
        <TouchableOpacity
          onPress={async () => {
            await signOut();
            setMenuOpen(false);
          }}
          style={styles.navPrimaryButton}
        >
          <Text style={styles.navPrimaryText}>Sign Out</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={() => openAuth("login")} style={styles.navPrimaryButton}>
          <Text style={styles.navPrimaryText}>User Login / Signup</Text>
        </TouchableOpacity>
      )}
    </>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F3EC" />

      <CustomerAuthModal
        visible={authVisible}
        mode={authMode}
        onClose={() => setAuthVisible(false)}
        onSuccess={() => setAuthVisible(false)}
      />

      <Modal animationType="fade" transparent visible={menuOpen && !isDesktop} onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.mobileMenuBackdrop} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.mobileMenuSheet}>
            <Text style={styles.mobileMenuTitle}>Navigate Rivan</Text>
            <Text style={styles.mobileMenuBody}>Move through discovery, categories, and role-based access from one place.</Text>
            <View style={styles.mobileMenuLinks}>{navButtons}</View>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient colors={["#F5F4EC", "#ECF6EE", "#FFFFFF"]} style={styles.heroSurface}>
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
              <View style={styles.navDesktopLinks}>{navButtons}</View>
            ) : (
              <TouchableOpacity style={styles.menuButton} onPress={() => setMenuOpen(true)}>
                <Feather name="menu" size={20} color="#0F4A22" />
              </TouchableOpacity>
            )}
          </View>

          <View onLayout={(event) => handleSectionLayout("home", event)} style={[styles.heroSection, isDesktop && styles.heroSectionDesktop]}>
            <View style={[styles.heroContent, isDesktop && styles.heroContentDesktop]}>
              <View style={styles.heroTextBlock}>
                <Text style={styles.eyebrow}>Guest-first property platform</Text>
                <Text style={styles.heroTitle}>Discover homes, plots, and trusted property opportunities without friction.</Text>
                <Text style={styles.heroBody}>
                  Rivan now opens with a cleaner, calmer experience built for browsing first. Featured inventory, categories, and role-based access stay visible, but never compete with the core property journey.
                </Text>

                <View style={styles.heroActions}>
                  <TouchableOpacity style={styles.primaryAction} onPress={() => scrollToSection("properties")}>
                    <Text style={styles.primaryActionText}>Explore Properties</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryAction} onPress={() => openAuth("signup")}>
                    <Text style={styles.secondaryActionText}>User Signup</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.heroMetrics}>
                  {FEATURE_STRIPS.map((item) => (
                    <View key={item.title} style={styles.metricCard}>
                      <Text style={styles.metricTitle}>{item.title}</Text>
                      <Text style={styles.metricValue}>{item.value}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.heroVisualBlock}>
                <View style={styles.carouselShell}>
                  <View style={styles.carouselHeader}>
                    <Text style={styles.carouselEyebrow}>Featured flow</Text>
                    <Text style={styles.carouselTitle}>Modern entry experience</Text>
                  </View>
                  <ScrollView
                    horizontal
                    pagingEnabled
                    decelerationRate="fast"
                    snapToInterval={carouselSnapInterval}
                    snapToAlignment="start"
                    showsHorizontalScrollIndicator={false}
                    onScroll={onCarouselScroll}
                    scrollEventThrottle={16}
                    contentContainerStyle={styles.carouselTrack}
                  >
                    {HERO_SLIDES.map((slide, index) => (
                      <View
                        key={slide.title}
                        style={[
                          styles.carouselCard,
                          { width: carouselCardWidth },
                          index === HERO_SLIDES.length - 1 && styles.carouselCardLast,
                        ]}
                      >
                        <Text style={styles.carouselCardEyebrow}>{slide.eyebrow}</Text>
                        <Text style={styles.carouselCardTitle}>{slide.title}</Text>
                        <Text style={styles.carouselCardBody}>{slide.body}</Text>
                      </View>
                    ))}
                  </ScrollView>
                  <View style={styles.carouselDots}>
                    {HERO_SLIDES.map((slide, index) => (
                      <View
                        key={slide.title}
                        style={[styles.carouselDot, index === carouselIndex && styles.carouselDotActive]}
                      />
                    ))}
                  </View>
                </View>

                <View style={styles.authPanel}>
                  <Text style={styles.authPanelTitle}>Access when you need it</Text>
                  <Text style={styles.authPanelBody}>
                    Browse as a guest, or jump directly into your role-specific workspace from a cleaner menu system.
                  </Text>
                  <View style={styles.authPanelActions}>
                    <TouchableOpacity style={styles.authPillPrimary} onPress={() => openAuth("login")}>
                      <Text style={styles.authPillPrimaryText}>User Login</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.authPillGhost} onPress={() => router.push("/agent-login")}>
                      <Text style={styles.authPillGhostText}>Agent</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.authPillGhost} onPress={() => router.push("/admin-login")}>
                      <Text style={styles.authPillGhostText}>Admin</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.searchPanel}>
              <View style={styles.searchRow}>
                <Feather name="search" size={18} color="#607089" />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search by property, area, or interest"
                  placeholderTextColor="#8A94A6"
                  style={styles.searchInput}
                />
                {query ? (
                  <TouchableOpacity onPress={() => setQuery("")}>
                    <Feather name="x" size={18} color="#607089" />
                  </TouchableOpacity>
                ) : null}
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryChipRow}
              >
                <TouchableOpacity
                  style={[styles.categoryChip, selectedCategory === "All" && styles.categoryChipActive]}
                  onPress={() => setSelectedCategory("All")}
                >
                  <Text style={[styles.categoryChipText, selectedCategory === "All" && styles.categoryChipTextActive]}>
                    All
                  </Text>
                </TouchableOpacity>
                {CATEGORIES.map((item) => (
                  <TouchableOpacity
                    key={item.label}
                    style={[styles.categoryChip, selectedCategory === item.label && styles.categoryChipActive]}
                    onPress={() => setSelectedCategory(item.label)}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        selectedCategory === item.label && styles.categoryChipTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </LinearGradient>

        <View onLayout={(event) => handleSectionLayout("properties", event)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionEyebrow}>Properties</Text>
            <Text style={styles.sectionTitle}>Featured and trending inventory comes first.</Text>
            <Text style={styles.sectionBody}>
              Guests land directly on discovery. The experience leads with property cards, map-led layout context, and clean calls to action instead of forcing authentication too early.
            </Text>
          </View>

          <View style={[styles.propertyGrid, isDesktop && styles.propertyGridDesktop]}>
            {filteredProperties.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.propertyCard,
                  isTablet && styles.propertyCardWide,
                  isDesktop && styles.propertyCardDesktop,
                ]}
                activeOpacity={0.92}
                onPress={handlePropertyOpen}
              >
                <PropertyMedia image={item.image} style={styles.propertyImage} />
                <View style={styles.propertyCardBody}>
                  <View style={styles.propertyBadgeRow}>
                    <Text style={styles.propertyTag}>{item.tag}</Text>
                    <Text style={styles.propertyPrice}>{item.price}</Text>
                  </View>
                  <Text style={styles.propertyTitle}>{item.title}</Text>
                  <Text style={styles.propertyLocation}>{item.location}</Text>
                  <Text style={styles.propertySummary}>{item.summary}</Text>
                  <View style={styles.propertyFooter}>
                    <Text style={styles.propertyLink}>{item.cta}</Text>
                    <Feather name="arrow-up-right" size={16} color="#0F4A22" />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View onLayout={(event) => handleSectionLayout("categories", event)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionEyebrow}>Categories</Text>
            <Text style={styles.sectionTitle}>A simpler category system keeps browsing intuitive.</Text>
            <Text style={styles.sectionBody}>
              The category view is redesigned as quick, visual entry points instead of a cluttered menu wall. Each category helps users understand where to go next without overload.
            </Text>
          </View>

          <View style={[styles.categoryGrid, isDesktop && styles.categoryGridDesktop]}>
            {CATEGORIES.map((item) => (
              <View key={item.label} style={[styles.categoryCard, isDesktop && styles.categoryCardDesktop]}>
                <View style={[styles.categoryIconWrap, { backgroundColor: item.accent }]}>
                  <Feather name={item.icon as any} size={20} color="#0F4A22" />
                </View>
                <Text style={styles.categoryTitle}>{item.label}</Text>
                <Text style={styles.categoryBodyText}>Designed for faster discovery with cleaner paths into browsing and enquiry.</Text>
              </View>
            ))}
          </View>
        </View>

        <View onLayout={(event) => handleSectionLayout("about", event)} style={styles.section}>
          <LinearGradient colors={["#0B3B1B", "#14532D"]} style={styles.storyPanel}>
            <View style={styles.storyTextBlock}>
              <Text style={styles.storyEyebrow}>About Rivan</Text>
              <Text style={styles.storyTitle}>A more trustworthy real-estate experience starts with clarity.</Text>
              <Text style={styles.storyBody}>
                This redesign removes visual noise, sharpens the property hierarchy, and brings the right role-based actions into a single responsive system. The result is a cleaner first impression and a better conversion path.
              </Text>
            </View>

            <View style={styles.storyChecklist}>
              {TRUST_POINTS.map((point) => (
                <View key={point} style={styles.storyChecklistItem}>
                  <View style={styles.storyCheckIcon}>
                    <Feather name="check" size={14} color="#0B3B1B" />
                  </View>
                  <Text style={styles.storyChecklistText}>{point}</Text>
                </View>
              ))}
            </View>
          </LinearGradient>
        </View>

        <View onLayout={(event) => handleSectionLayout("contact", event)} style={styles.section}>
          <View style={[styles.contactGrid, isDesktop && styles.contactGridDesktop]}>
            <View style={styles.contactCard}>
              <Text style={styles.sectionEyebrow}>Contact</Text>
              <Text style={styles.contactTitle}>Need help choosing the right entry point?</Text>
              <Text style={styles.contactBody}>
                Customers can browse and sign in later. Agents can go straight to their workspace. Admins can open operations directly without confusing the guest journey.
              </Text>
              <View style={styles.contactActions}>
                <TouchableOpacity style={styles.primaryAction} onPress={() => openAuth("login")}>
                  <Text style={styles.primaryActionText}>User Login</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryAction} onPress={() => router.push("/agent-login")}>
                  <Text style={styles.secondaryActionText}>Agent Login</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.roleStack}>
              <TouchableOpacity style={styles.roleCard} onPress={() => openAuth("signup")}>
                <Text style={styles.roleLabel}>User Login / Signup</Text>
                <Text style={styles.roleBody}>Start with discovery, shortlist properties, and continue to wishlist, documents, and visits only when needed.</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.roleCard} onPress={() => router.push("/agent-login")}>
                <Text style={styles.roleLabel}>Agent Login</Text>
                <Text style={styles.roleBody}>Access CRM, site visits, follow-ups, and booking progress from a cleaner agent entry point.</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.roleCard} onPress={() => router.push("/admin-login")}>
                <Text style={styles.roleLabel}>Admin Login</Text>
                <Text style={styles.roleBody}>Jump into approvals and platform operations without crowding the core browsing experience.</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerBrand}>RIVAN</Text>
          <Text style={styles.footerText}>Modern real estate discovery with cleaner navigation, stronger hierarchy, and lower friction.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default HomeScreen;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 48,
  },
  contentDesktop: {
    paddingBottom: 72,
  },
  heroSurface: {
    paddingBottom: 28,
  },
  navbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  navbarDesktop: {
    paddingHorizontal: 40,
    paddingTop: 28,
  },
  brandCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  brandBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0F4A22",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  brandImage: {
    width: 28,
    height: 28,
  },
  brandWordmark: {
    fontSize: 14,
    letterSpacing: 5,
    fontWeight: "800",
    color: "#14361D",
  },
  brandCaption: {
    marginTop: 4,
    fontSize: 12,
    color: "#607089",
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DCE8DD",
  },
  navDesktopLinks: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
    flex: 1,
    marginLeft: 20,
  },
  navLinkButton: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  navLinkText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#35543A",
  },
  navSecondaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCE8DD",
  },
  navSecondaryText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F4A22",
  },
  navPrimaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "#0B5D1E",
  },
  navPrimaryText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  mobileMenuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(11,49,22,0.18)",
    justifyContent: "flex-start",
  },
  mobileMenuSheet: {
    marginTop: 88,
    marginHorizontal: 16,
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
    padding: 20,
  },
  mobileMenuTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#14361D",
  },
  mobileMenuBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 22,
    color: "#607089",
  },
  mobileMenuLinks: {
    marginTop: 18,
    gap: 10,
  },
  heroSection: {
    paddingHorizontal: 20,
    paddingTop: 28,
  },
  heroSectionDesktop: {
    paddingHorizontal: 40,
    paddingTop: 36,
  },
  heroContent: {
    gap: 22,
  },
  heroContentDesktop: {
    flexDirection: "row",
    gap: 28,
    alignItems: "stretch",
  },
  heroTextBlock: {
    gap: 18,
    flex: 1.1,
  },
  eyebrow: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(11,93,30,0.08)",
    fontSize: 12,
    fontWeight: "700",
    color: "#0F4A22",
  },
  heroTitle: {
    fontSize: 34,
    lineHeight: 42,
    fontWeight: "900",
    color: "#14361D",
  },
  heroBody: {
    fontSize: 15,
    lineHeight: 25,
    color: "#5A6D88",
    maxWidth: 720,
  },
  heroActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  primaryAction: {
    minHeight: 52,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: "#0B5D1E",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  secondaryAction: {
    minHeight: 52,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCE8DD",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F4A22",
  },
  heroMetrics: {
    gap: 12,
  },
  metricCard: {
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.82)",
    padding: 16,
    borderWidth: 1,
    borderColor: "#DCE8DD",
  },
  metricTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#7B879C",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  metricValue: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
    color: "#14361D",
  },
  heroVisualBlock: {
    flex: 0.95,
    gap: 16,
  },
  carouselShell: {
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
    padding: 18,
    borderWidth: 1,
    borderColor: "#DCE8DD",
    overflow: "hidden",
  },
  carouselHeader: {
    marginBottom: 16,
  },
  carouselEyebrow: {
    fontSize: 12,
    fontWeight: "700",
    color: "#7B879C",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  carouselTitle: {
    marginTop: 8,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    color: "#10233F",
  },
  carouselTrack: {
    paddingRight: 8,
  },
  carouselCard: {
    borderRadius: 24,
    backgroundColor: "#F6F8F2",
    padding: 20,
    marginRight: 12,
    minHeight: 208,
    justifyContent: "space-between",
  },
  carouselCardLast: {
    marginRight: 0,
  },
  carouselCardEyebrow: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  carouselCardTitle: {
    marginTop: 14,
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "800",
    color: "#14361D",
  },
  carouselCardBody: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 24,
    color: "#607089",
  },
  carouselDots: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
  },
  carouselDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#CAD6C8",
  },
  carouselDotActive: {
    width: 24,
    backgroundColor: "#0B5D1E",
  },
  authPanel: {
    borderRadius: 24,
    backgroundColor: "#0E3A1A",
    padding: 20,
  },
  authPanelTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  authPanelBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 22,
    color: "#D3DEEE",
  },
  authPanelActions: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  authPillPrimary: {
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  authPillPrimaryText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#14361D",
  },
  authPillGhost: {
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  authPillGhostText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  searchPanel: {
    marginTop: 22,
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
    padding: 18,
    borderWidth: 1,
    borderColor: "#DCE8DD",
  },
  searchRow: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: "#F6F8F2",
    borderWidth: 1,
    borderColor: "#DCE8DD",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#14361D",
  },
  categoryChipRow: {
    gap: 10,
    paddingTop: 16,
    paddingBottom: 4,
  },
  categoryChip: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: "#F6F8F2",
    borderWidth: 1,
    borderColor: "#DCE8DD",
    alignItems: "center",
    justifyContent: "center",
  },
  categoryChipActive: {
    backgroundColor: "#0B5D1E",
    borderColor: "#0B5D1E",
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#5C6C84",
  },
  categoryChipTextActive: {
    color: "#FFFFFF",
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 34,
    gap: 18,
  },
  sectionHeader: {
    gap: 8,
    maxWidth: 760,
  },
  sectionEyebrow: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  sectionTitle: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: "900",
    color: "#14361D",
  },
  sectionBody: {
    fontSize: 15,
    lineHeight: 24,
    color: "#607089",
  },
  propertyGrid: {
    gap: 16,
  },
  propertyGridDesktop: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  propertyCard: {
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DFE7DD",
    overflow: "hidden",
  },
  propertyCardWide: {
    flex: 1,
  },
  propertyCardDesktop: {
    width: "31.8%",
  },
  propertyImage: {
    width: "100%",
    height: 220,
    backgroundColor: "#E0EBDD",
  },
  propertyCardBody: {
    padding: 18,
  },
  propertyBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  propertyTag: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#E8F6EC",
    fontSize: 12,
    fontWeight: "700",
    color: "#0F4A22",
  },
  propertyPrice: {
    fontSize: 13,
    fontWeight: "700",
    color: "#5A6D88",
  },
  propertyTitle: {
    marginTop: 12,
    fontSize: 22,
    lineHeight: 29,
    fontWeight: "800",
    color: "#10233F",
  },
  propertyLocation: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "600",
    color: "#607089",
  },
  propertySummary: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 22,
    color: "#687B95",
  },
  propertyFooter: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  propertyLink: {
    fontSize: 14,
    fontWeight: "800",
    color: "#183153",
  },
  categoryGrid: {
    gap: 14,
  },
  categoryGridDesktop: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  categoryCard: {
    borderRadius: 24,
    backgroundColor: "#FAFBFD",
    borderWidth: 1,
    borderColor: "#E6EDF5",
    padding: 18,
  },
  categoryCardDesktop: {
    width: "31.8%",
  },
  categoryIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryTitle: {
    marginTop: 14,
    fontSize: 19,
    lineHeight: 25,
    fontWeight: "800",
    color: "#10233F",
  },
  categoryBodyText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 22,
    color: "#607089",
  },
  storyPanel: {
    borderRadius: 32,
    padding: 24,
    gap: 20,
  },
  storyTextBlock: {
    gap: 10,
  },
  storyEyebrow: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9BC0FF",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  storyTitle: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  storyBody: {
    fontSize: 15,
    lineHeight: 24,
    color: "#D3DEEE",
  },
  storyChecklist: {
    gap: 12,
  },
  storyChecklistItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  storyCheckIcon: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  storyChecklistText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  contactGrid: {
    gap: 16,
  },
  contactGridDesktop: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  contactCard: {
    flex: 1,
    borderRadius: 28,
    backgroundColor: "#FFF9F1",
    padding: 20,
    borderWidth: 1,
    borderColor: "#F0E1C9",
  },
  contactTitle: {
    marginTop: 8,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
    color: "#10233F",
  },
  contactBody: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 24,
    color: "#607089",
  },
  contactActions: {
    marginTop: 18,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  roleStack: {
    flex: 1,
    gap: 12,
  },
  roleCard: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6EDF5",
    padding: 18,
  },
  roleLabel: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
    color: "#10233F",
  },
  roleBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 22,
    color: "#607089",
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 36,
    alignItems: "center",
  },
  footerBrand: {
    fontSize: 13,
    letterSpacing: 5,
    fontWeight: "800",
    color: "#10233F",
  },
  footerText: {
    marginTop: 8,
    maxWidth: 720,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 22,
    color: "#607089",
  },
});
