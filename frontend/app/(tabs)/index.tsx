import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { useRouter } from "expo-router";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import CustomerAuthModal from "@/src/components/CustomerAuthModal";
import { PropertyMedia } from "@/src/components/PropertyMedia";
import { type NormalizedProperty, normalizePropertyCollection } from "@/src/property-presenter";
import { enrichPropertyCollection } from "@/src/real-property-overrides";
import { colors, formatINR, shadow } from "@/src/theme";
import { blurActiveWebElement } from "@/src/utils/web-focus";

const LOGO = require("../../assets/images/rivan-logo.png");

const NAV_ITEMS = [
  { key: "process", label: "How it works" },
  { key: "featured", label: "Properties" },
] as const;

type SectionKey = (typeof NAV_ITEMS)[number]["key"] | "top";

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
  const { width } = useWindowDimensions();

  const isDesktop = width >= 980;
  const isWide = width >= 1200;

  const [authVisible, setAuthVisible] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<NormalizedProperty[]>([]);

  useEffect(() => {
    let active = true;

    async function loadProperties() {
      try {
        const featured = enrichPropertyCollection(normalizePropertyCollection(await api.featured()));
        const liveProperties = featured.length
          ? featured
          : enrichPropertyCollection(normalizePropertyCollection(await api.listProperties()));

        if (active) setProperties(liveProperties);
      } catch {
        if (active) setProperties([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadProperties();
    return () => {
      active = false;
    };
  }, []);

  const heroProperty = properties[0] || null;
  const mosaicProperties = properties.slice(0, 3);
  const previewProperties = properties.slice(0, 3);

  const filteredProperties = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return previewProperties;

    return properties
      .filter((property) =>
        [property.name, property.location, property.category, property.description, property.highlights]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query)
      )
      .slice(0, 3);
  }, [previewProperties, properties, searchQuery]);

  const openAuth = useCallback((mode: "login" | "signup") => {
    blurActiveWebElement();
    setAuthMode(mode);
    setAuthVisible(true);
    setMenuOpen(false);
  }, []);

  const scrollToSection = useCallback((key: SectionKey) => {
    if (key === "top") {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }

    if (Platform.OS === "web" && typeof document !== "undefined") {
      const target = document.getElementById(key);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const navContent = (
    <>
      <TouchableOpacity style={styles.logoWrap} onPress={() => scrollToSection("top")}>
        <Image source={LOGO} style={styles.navLogoImage} resizeMode="contain" />
        <View>
          <Text style={styles.logoText}>Rivan</Text>
          <Text style={styles.logoSup}>REALTY</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.navLinks}>
        {NAV_ITEMS.map((item) => (
          <TouchableOpacity key={item.key} style={styles.navLinkChip} onPress={() => scrollToSection(item.key)}>
            <Text style={styles.navLink}>{item.label}</Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={styles.navButtonGhost}
          onPress={() => {
            blurActiveWebElement();
            router.push("/agent-login");
          }}
        >
          <Text style={styles.navButtonGhostText}>Agent Login</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navButtonGhost}
          onPress={() => {
            blurActiveWebElement();
            router.push("/admin-login");
          }}
        >
          <Text style={styles.navButtonGhostText}>Admin</Text>
        </TouchableOpacity>

        {isAuthed ? (
          <>
            <TouchableOpacity style={styles.profileChip} onPress={() => router.push("/profile")}>
              <View style={styles.profileAvatar}>
                <Text style={styles.profileAvatarText}>{getUserInitials(user?.name)}</Text>
              </View>
              <View>
                <Text style={styles.profileName}>{getUserDisplayName(user)}</Text>
                <Text style={styles.profileSub}>Customer</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navButtonGhost}
              onPress={async () => {
                await signOut();
                setMenuOpen(false);
              }}
            >
              <Text style={styles.navButtonGhostText}>Sign Out</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.navButton} onPress={() => openAuth("login")}>
            <Text style={styles.navButtonText}>Login / Signup</Text>
          </TouchableOpacity>
        )}
      </View>
    </>
  );

  const processSteps = [
    {
      number: "01",
      title: "Search real inventory",
      description: "Browse active listings, verified details, and genuine project media from the live backend feed.",
    },
    {
      number: "02",
      title: "Review layout clarity",
      description: "Open the layout viewer, understand plot positioning, and check availability without changing flows.",
    },
    {
      number: "03",
      title: "Schedule your visit",
      description: "Continue into the existing site-visit workflow only when a property is worth your time.",
    },
    {
      number: "04",
      title: "Move to booking",
      description: "Use the current booking and login journey once you are ready to act on a chosen property.",
    },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDeepest} />

      <CustomerAuthModal
        visible={authVisible}
        mode={authMode}
        onClose={() => setAuthVisible(false)}
        onSuccess={() => setAuthVisible(false)}
      />

      <Modal visible={menuOpen && !isDesktop} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.menuCard}>{navContent}</Pressable>
        </Pressable>
      </Modal>

      <View style={[styles.navbar, scrolled && styles.navbarScrolled]}>
        {isDesktop ? (
          <View style={styles.navDesktop}>{navContent}</View>
        ) : (
          <View style={styles.navMobile}>
            <TouchableOpacity style={styles.logoWrap} onPress={() => scrollToSection("top")}>
              <Image source={LOGO} style={styles.navLogoImage} resizeMode="contain" />
              <View>
                <Text style={styles.logoText}>Rivan</Text>
                <Text style={styles.logoSup}>REALTY</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.mobileMenuButton} onPress={() => setMenuOpen(true)}>
              <Feather name="menu" size={20} color={colors.white} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(event) => setScrolled(event.nativeEvent.contentOffset.y > 20)}
      >
        <View style={[styles.hero, !isDesktop && styles.heroMobile]}>
          <View style={styles.heroLeft}>
            <View style={styles.heroBadge}>
              <View style={styles.heroBadgeDot} />
              <Text style={styles.heroBadgeText}>Now active in customer discovery</Text>
            </View>

            <Text style={styles.heroTitle}>
              Live where you{"\n"}truly <Text style={styles.heroItalic}>belong.</Text>
            </Text>
            <Text style={styles.heroSub}>
              Rivan Realty pairs discerning buyers with real property inventory, layout clarity, and a cleaner journey
              from discovery to visit scheduling.
            </Text>

            <View style={styles.ctaRow}>
              <TouchableOpacity style={styles.btnPrimary} onPress={() => scrollToSection("featured")}>
                <Text style={styles.btnPrimaryText}>Explore Listings</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnWhite} onPress={() => scrollToSection("process")}>
                <Text style={styles.btnWhiteText}>How It Works</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.heroStats}>
              <View>
                <Text style={styles.hStatNum}>{properties.length || 0}</Text>
                <Text style={styles.hStatLabel}>Properties</Text>
              </View>
              <View>
                <Text style={styles.hStatNum}>{heroProperty?.approvals?.length || 0}</Text>
                <Text style={styles.hStatLabel}>Approvals</Text>
              </View>
              <View>
                <Text style={styles.hStatNum}>{heroProperty ? "Ready" : "Soon"}</Text>
                <Text style={styles.hStatLabel}>Visit Flow</Text>
              </View>
            </View>
          </View>

          <View style={styles.heroRight}>
            <View style={styles.mosaic}>
              <View style={styles.mosaicMain}>
                {mosaicProperties[0]?.image ? (
                  <PropertyMedia image={mosaicProperties[0].image} style={styles.mosaicMedia} />
                ) : (
                  <View style={styles.mosaicFallback} />
                )}
              </View>
              {isDesktop ? (
                <>
                  <View style={styles.mosaicSmall}>
                    {mosaicProperties[1]?.image ? (
                      <PropertyMedia image={mosaicProperties[1].image} style={styles.mosaicMedia} />
                    ) : (
                      <View style={styles.mosaicFallback} />
                    )}
                  </View>
                  <View style={styles.mosaicSmall}>
                    {mosaicProperties[2]?.image ? (
                      <PropertyMedia image={mosaicProperties[2].image} style={styles.mosaicMedia} />
                    ) : (
                      <View style={styles.mosaicFallback} />
                    )}
                  </View>
                </>
              ) : null}
            </View>
            <View style={styles.heroRightOverlay} />

            {isDesktop ? (
              <View style={styles.searchBar}>
                <View style={styles.searchField}>
                  <Text style={styles.searchLabel}>Location</Text>
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder={heroProperty?.location?.split(",")[0] || "Hyderabad"}
                    placeholderTextColor="#6B7A6E"
                    style={styles.searchInput}
                  />
                </View>
                <View style={styles.searchField}>
                  <Text style={styles.searchLabel}>Property type</Text>
                  <TextInput value={heroProperty?.category || "Independent House"} editable={false} style={styles.searchInput} />
                </View>
                <TouchableOpacity style={styles.btnSearch} onPress={() => scrollToSection("featured")}>
                  <Feather name="search" size={18} color={colors.white} />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.sectionSoft} nativeID="process">
          <Text style={styles.sectionEye}>How It Works</Text>
          <Text style={styles.sectionHeading}>A cleaner path from discovery to confident action.</Text>

          <View style={[styles.stepsGrid, !isDesktop && styles.stepsGridMobile]}>
            {processSteps.map((step) => (
              <View key={step.number} style={styles.step}>
                <View style={styles.stepCircle}>
                  <Text style={styles.stepN}>{step.number}</Text>
                </View>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDesc}>{step.description}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.sectionWhite} nativeID="featured">
          <View style={styles.featuredHeader}>
            <View>
              <Text style={styles.sectionEye}>Featured</Text>
              <Text style={styles.sectionHeadingDark}>Live listings from the current platform feed.</Text>
            </View>
            {heroProperty ? (
              <TouchableOpacity onPress={() => router.push(`/property/${heroProperty.id}`)}>
                <Text style={styles.featLink}>Open featured property</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loadingText}>Loading live listings...</Text>
            </View>
          ) : !filteredProperties.length ? (
            <View style={styles.loadingBox}>
              <Text style={styles.loadingText}>No live property is available right now.</Text>
            </View>
          ) : (
            <View style={[styles.cardsGrid, !isDesktop && styles.cardsGridMobile]}>
              {filteredProperties.map((property, index) => (
                <TouchableOpacity
                  key={property.id}
                  style={styles.propCard}
                  activeOpacity={0.95}
                  onPress={() => router.push(`/property/${property.id}`)}
                >
                  <View style={styles.propImg}>
                    {property.image ? (
                      <PropertyMedia image={property.image} style={styles.propMedia} />
                    ) : (
                      <View style={styles.propFallback} />
                    )}
                    <View style={styles.propTag}>
                      <Text style={styles.propTagText}>{index === 0 ? "Featured" : "Live"}</Text>
                    </View>
                    {property.approvals.length ? (
                      <View style={styles.propBadge}>
                        <Text style={styles.propBadgeText}>Verified</Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.propBody}>
                    <Text style={styles.propPrice}>
                      {property.startingPrice ? formatINR(property.startingPrice) : "On request"}
                    </Text>
                    <Text style={styles.propName}>{property.name}</Text>
                    <View style={styles.propMeta}>
                      <Text style={styles.propM}>{property.location}</Text>
                      <Text style={styles.propM}>{property.size || "Layout based"}</Text>
                      <Text style={styles.propM}>{property.facing || "Facing options"}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={[styles.loginSection, !isDesktop && styles.loginSectionMobile]}>
          <View style={styles.loginLeft}>
            <Text style={styles.sectionEyeGold}>Customer Access</Text>
            <Text style={styles.loginHeading}>The property journey stays public until you are ready to continue.</Text>
            <Text style={styles.loginParagraph}>
              Use secure customer login only when you want to save your journey, open your profile, schedule site visits,
              or move into booking. Agent and admin routes remain separate and untouched.
            </Text>

            <View style={styles.portalCards}>
              <TouchableOpacity
                style={styles.portalCard}
                onPress={() => router.push(heroProperty ? `/property/${heroProperty.id}` : "/property/prop-1")}
              >
                <View style={[styles.portalIcon, styles.portalAgent]}>
                  <Feather name="home" size={20} color="#4DBB7A" />
                </View>
                <View style={styles.portalInfo}>
                  <Text style={styles.portalTitle}>Open property details</Text>
                  <Text style={styles.portalDescription}>See pricing, layout media, approvals, and full property context.</Text>
                </View>
                <Text style={styles.portalArrow}>→</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.portalCard}
                onPress={() => router.push(heroProperty ? `/centre/site-${heroProperty.id}` : "/centre/site-prop-1")}
              >
                <View style={[styles.portalIcon, styles.portalAdmin]}>
                  <Feather name="calendar" size={20} color="#C8A96E" />
                </View>
                <View style={styles.portalInfo}>
                  <Text style={styles.portalTitle}>Continue to site visit</Text>
                  <Text style={styles.portalDescription}>Move directly into the current visit scheduling flow.</Text>
                </View>
                <Text style={styles.portalArrow}>→</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.loginFormWrap}>
            <Text style={styles.formLogo}>Rivan Realty</Text>
            <Text style={styles.formSub}>Continue into your customer account</Text>

            <View style={styles.roleSwitch}>
              <View style={styles.roleSwitchActive}>
                <Text style={styles.roleSwitchText}>Customer</Text>
              </View>
            </View>

            <View style={styles.fgroup}>
              <Text style={styles.flabel}>Account</Text>
              <TextInput
                editable={false}
                value={user?.phone || user?.email || "Secure Firebase customer login"}
                style={styles.finput}
              />
            </View>

            <View style={styles.fgroup}>
              <Text style={styles.flabel}>Flow</Text>
              <TextInput editable={false} value="Existing OTP + backend profile session" style={styles.finput} />
            </View>

            <TouchableOpacity style={styles.btnSignin} onPress={() => openAuth(isAuthed ? "login" : "signup")}>
              <Text style={styles.btnSigninText}>{isAuthed ? "Open Customer Profile" : "Login / Signup"}</Text>
            </TouchableOpacity>

            <Text style={styles.formDivider}>Customer homepage only. Existing agent and admin routes stay intact.</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <View style={[styles.footerInner, !isDesktop && styles.footerInnerMobile]}>
            <Text style={styles.footerLogo}>Rivan Realty</Text>
            <View style={styles.footerLinks}>
              <TouchableOpacity onPress={() => scrollToSection("top")}>
                <Text style={styles.footerLink}>Home</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => scrollToSection("featured")}>
                <Text style={styles.footerLink}>Properties</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push("/profile")}>
                <Text style={styles.footerLink}>Profile</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.footerCopy}>Live customer experience powered by the existing Rivan backend workflows.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default HomeScreen;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  scroll: { flex: 1 },
  content: { paddingBottom: 0 },
  navbar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingHorizontal: Platform.OS === "web" ? 60 : 24,
    paddingTop: 20,
    paddingBottom: 18,
  },
  navbarScrolled: {
    backgroundColor: "rgba(10,46,31,0.96)",
    ...(Platform.OS === "web" ? ({ backdropFilter: "blur(12px)" } as any) : null),
  },
  navDesktop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navMobile: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logoWrap: { flexDirection: "row", alignItems: "center", gap: 12 },
  navLogoImage: { width: 38, height: 38, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)" },
  logoText: {
    color: colors.white,
    fontSize: 24,
    fontWeight: "700",
    fontFamily: Platform.OS === "web" ? ("Georgia, serif" as any) : undefined,
  },
  logoSup: {
    color: "#C8A96E",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 2,
    marginTop: 2,
  },
  navLinks: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  navLinkChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 60 },
  navLink: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: "500", letterSpacing: 1 },
  navButton: {
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.3)",
    borderRadius: 60,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "transparent",
  },
  navButtonText: { color: colors.white, fontSize: 13, fontWeight: "600", letterSpacing: 1 },
  navButtonGhost: {
    borderWidth: 1.5,
    borderColor: "rgba(200,169,110,0.5)",
    borderRadius: 60,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  navButtonGhostText: { color: "#C8A96E", fontSize: 13, fontWeight: "600", letterSpacing: 1 },
  profileChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 60,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  profileAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  profileAvatarText: { color: colors.primaryDeepest, fontSize: 11, fontWeight: "800" },
  profileName: { color: colors.white, fontSize: 12, fontWeight: "700" },
  profileSub: { color: "rgba(255,255,255,0.6)", fontSize: 10 },
  mobileMenuButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  menuBackdrop: { flex: 1, backgroundColor: "rgba(10,46,31,0.7)", justifyContent: "flex-start" },
  menuCard: {
    marginTop: 88,
    marginHorizontal: 20,
    borderRadius: 24,
    backgroundColor: colors.surface,
    padding: 20,
    gap: 12,
  },
  hero: {
    minHeight: Platform.OS === "web" ? 760 : 620,
    flexDirection: "row",
    overflow: "hidden",
  },
  heroMobile: { flexDirection: "column" },
  heroLeft: {
    flex: 1,
    backgroundColor: colors.primaryDeepest,
    justifyContent: "flex-end",
    paddingHorizontal: Platform.OS === "web" ? 64 : 28,
    paddingBottom: 80,
    paddingTop: 130,
  },
  heroRight: {
    flex: 1,
    position: "relative",
    minHeight: 380,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(200,169,110,0.15)",
    borderWidth: 1,
    borderColor: "rgba(200,169,110,0.35)",
    borderRadius: 60,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 28,
    alignSelf: "flex-start",
  },
  heroBadgeDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#C8A96E" },
  heroBadgeText: {
    color: "#DDC48F",
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: colors.white,
    fontSize: Platform.OS === "web" ? 60 : 42,
    lineHeight: Platform.OS === "web" ? 68 : 50,
    fontWeight: "500",
    fontFamily: Platform.OS === "web" ? ("Georgia, serif" as any) : undefined,
    marginBottom: 24,
  },
  heroItalic: { color: "#DDC48F", fontStyle: "italic" },
  heroSub: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 15,
    lineHeight: 28,
    maxWidth: 440,
    marginBottom: 44,
  },
  ctaRow: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  btnPrimary: {
    backgroundColor: "#C8A96E",
    borderRadius: 60,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  btnPrimaryText: { color: colors.primaryDeepest, fontSize: 13, fontWeight: "600", letterSpacing: 1 },
  btnWhite: {
    backgroundColor: "rgba(255,255,255,0.09)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 60,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  btnWhiteText: { color: colors.white, fontSize: 13, fontWeight: "500", letterSpacing: 1 },
  heroStats: {
    flexDirection: "row",
    gap: 40,
    paddingTop: 44,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    marginTop: 44,
    flexWrap: "wrap",
  },
  hStatNum: {
    color: colors.white,
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 32,
    fontFamily: Platform.OS === "web" ? ("Georgia, serif" as any) : undefined,
  },
  hStatLabel: {
    marginTop: 4,
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  mosaic: {
    position: "absolute",
    inset: 0,
    ...(Platform.OS === "web"
      ? ({
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap: 4,
        } as any)
      : {}),
  },
  mosaicMain: Platform.OS === "web" ? ({ gridRow: "1 / 3" } as any) : { flex: 1 },
  mosaicSmall: Platform.OS === "web" ? ({} as any) : { flex: 1 },
  mosaicMedia: { width: "100%", height: "100%" },
  mosaicFallback: { flex: 1, backgroundColor: "#31513E" },
  heroRightOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10,46,31,0.18)",
  },
  searchBar: {
    position: "absolute",
    left: "50%",
    bottom: 40,
    transform: [{ translateX: -280 }],
    width: 560,
    maxWidth: "90%",
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 20,
    ...(Platform.OS === "web"
      ? ({
          display: "grid",
          gridTemplateColumns: "1fr 1fr auto",
          gap: 12,
          alignItems: "end",
        } as any)
      : {}),
    ...shadow.lg,
  },
  searchField: { flex: 1 },
  searchLabel: {
    color: "#6B7A6E",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  searchInput: {
    width: "100%",
    borderBottomWidth: 1.5,
    borderBottomColor: "#D4DDD6",
    paddingBottom: 6,
    color: colors.primaryDeepest,
    fontSize: 14,
    fontWeight: "500",
  },
  btnSearch: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.primaryDeepest,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionSoft: {
    backgroundColor: "#F6F8F5",
    paddingVertical: 110,
    paddingHorizontal: Platform.OS === "web" ? 60 : 28,
  },
  sectionWhite: {
    backgroundColor: colors.white,
    paddingVertical: 110,
    paddingHorizontal: Platform.OS === "web" ? 60 : 28,
  },
  sectionEye: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: 16,
  },
  sectionEyeGold: {
    color: "#DDC48F",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: 16,
  },
  sectionHeading: {
    color: colors.primaryDeepest,
    fontSize: Platform.OS === "web" ? 42 : 32,
    lineHeight: Platform.OS === "web" ? 50 : 40,
    fontWeight: "500",
    fontFamily: Platform.OS === "web" ? ("Georgia, serif" as any) : undefined,
    maxWidth: 560,
    marginBottom: 64,
  },
  sectionHeadingDark: {
    color: colors.primaryDeepest,
    fontSize: Platform.OS === "web" ? 42 : 32,
    lineHeight: Platform.OS === "web" ? 50 : 40,
    fontWeight: "500",
    fontFamily: Platform.OS === "web" ? ("Georgia, serif" as any) : undefined,
    maxWidth: 620,
  },
  stepsGrid: {
    ...(Platform.OS === "web"
      ? ({
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 0,
          position: "relative",
        } as any)
      : {}),
  },
  stepsGridMobile: { gap: 32 },
  step: { paddingHorizontal: 24, alignItems: "center" },
  stepCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: "#D8E8DD",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  stepN: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: "700",
    fontFamily: Platform.OS === "web" ? ("Georgia, serif" as any) : undefined,
  },
  stepTitle: { color: colors.primaryDeepest, fontSize: 15, fontWeight: "600", marginBottom: 10, textAlign: "center" },
  stepDesc: { color: "#6B7A6E", fontSize: 13, lineHeight: 24, textAlign: "center" },
  featuredHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 48,
    flexWrap: "wrap",
  },
  featLink: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "500",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(26,122,74,0.3)",
    paddingBottom: 2,
  },
  loadingBox: {
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "#EAEEE9",
    padding: 24,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  loadingText: { color: colors.stone500, fontSize: 14 },
  cardsGrid: {
    ...(Platform.OS === "web"
      ? ({
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 24,
        } as any)
      : {}),
  },
  cardsGridMobile: { gap: 24 },
  propCard: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#EAEEE9",
    backgroundColor: colors.white,
    ...shadow.md,
  },
  propImg: { height: 220, position: "relative" },
  propMedia: { width: "100%", height: "100%" },
  propFallback: { flex: 1, backgroundColor: colors.surfaceMuted },
  propTag: {
    position: "absolute",
    top: 16,
    left: 16,
    backgroundColor: colors.white,
    borderRadius: 60,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  propTagText: {
    color: colors.primaryDeepest,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  propBadge: {
    position: "absolute",
    top: 16,
    right: 16,
    backgroundColor: colors.primary,
    borderRadius: 60,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  propBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  propBody: { padding: 22 },
  propPrice: {
    color: colors.primaryDeepest,
    fontSize: 24,
    fontWeight: "700",
    fontFamily: Platform.OS === "web" ? ("Georgia, serif" as any) : undefined,
    marginBottom: 4,
  },
  propName: { color: "#3A4E40", fontSize: 14, fontWeight: "500", marginBottom: 16 },
  propMeta: { borderTopWidth: 1, borderTopColor: "#EAEEE9", paddingTop: 16, gap: 6 },
  propM: { color: "#6B7A6E", fontSize: 12 },
  loginSection: {
    backgroundColor: colors.primaryDeepest,
    paddingVertical: 110,
    paddingHorizontal: Platform.OS === "web" ? 60 : 28,
    flexDirection: "row",
    gap: 80,
    alignItems: "center",
  },
  loginSectionMobile: { flexDirection: "column", gap: 44, alignItems: "stretch" },
  loginLeft: { flex: 1 },
  loginHeading: {
    color: colors.white,
    fontSize: Platform.OS === "web" ? 40 : 30,
    lineHeight: Platform.OS === "web" ? 48 : 38,
    fontWeight: "500",
    fontFamily: Platform.OS === "web" ? ("Georgia, serif" as any) : undefined,
    marginBottom: 20,
  },
  loginParagraph: { color: "rgba(255,255,255,0.55)", fontSize: 15, lineHeight: 28, marginBottom: 40 },
  portalCards: { gap: 14 },
  portalCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  portalIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  portalAgent: { backgroundColor: "rgba(26,122,74,0.25)" },
  portalAdmin: { backgroundColor: "rgba(200,169,110,0.18)" },
  portalInfo: { flex: 1 },
  portalTitle: { color: colors.white, fontSize: 15, fontWeight: "600", marginBottom: 4 },
  portalDescription: { color: "rgba(255,255,255,0.55)", fontSize: 13, lineHeight: 20 },
  portalArrow: { color: "rgba(255,255,255,0.55)", fontSize: 18 },
  loginFormWrap: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 24,
    paddingHorizontal: 40,
    paddingVertical: 44,
    minWidth: isFinite(460) ? 0 : 0,
  },
  formLogo: {
    color: colors.primaryDeepest,
    fontSize: 20,
    fontWeight: "700",
    fontFamily: Platform.OS === "web" ? ("Georgia, serif" as any) : undefined,
    marginBottom: 4,
  },
  formSub: { color: "#6B7A6E", fontSize: 13, marginBottom: 28 },
  roleSwitch: { backgroundColor: "#F1F5F2", borderRadius: 10, padding: 5, marginBottom: 28 },
  roleSwitchActive: { backgroundColor: colors.white, borderRadius: 7, paddingVertical: 10, alignItems: "center" },
  roleSwitchText: { color: colors.primaryDeepest, fontSize: 13, fontWeight: "600" },
  fgroup: { marginBottom: 18 },
  flabel: {
    color: "#8A9A8E",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 7,
  },
  finput: {
    width: "100%",
    borderWidth: 1.5,
    borderColor: "#E0E8E2",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.primaryDeepest,
    fontSize: 14,
    backgroundColor: colors.white,
  },
  btnSignin: {
    width: "100%",
    backgroundColor: colors.primaryDeepest,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  btnSigninText: { color: colors.white, fontSize: 14, fontWeight: "600" },
  formDivider: { textAlign: "center", color: "#B0BCB3", fontSize: 12, marginTop: 18 },
  footer: {
    backgroundColor: colors.primaryDark,
    paddingHorizontal: Platform.OS === "web" ? 60 : 28,
    paddingTop: 60,
    paddingBottom: 40,
  },
  footerInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 32,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    marginBottom: 28,
  },
  footerInnerMobile: { flexDirection: "column", gap: 20 },
  footerLogo: {
    color: colors.white,
    fontSize: 21,
    fontWeight: "700",
    fontFamily: Platform.OS === "web" ? ("Georgia, serif" as any) : undefined,
  },
  footerLinks: { flexDirection: "row", gap: 28, flexWrap: "wrap" },
  footerLink: { color: "rgba(255,255,255,0.55)", fontSize: 13 },
  footerCopy: { color: "rgba(255,255,255,0.3)", fontSize: 12 },
});
