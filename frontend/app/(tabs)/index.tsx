import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { api, warmBackendReady } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import CustomerAuthModal from "@/src/components/CustomerAuthModal";
import ProfileSidebar from "@/src/components/ProfileSidebar";
import { PropertyMedia } from "@/src/components/PropertyMedia";
import { type NormalizedProperty, normalizePropertyCollection } from "@/src/property-presenter";
import { enrichPropertyCollection } from "@/src/real-property-overrides";
import { colors, fonts, formatINR, shadow } from "@/src/theme";
import { blurActiveWebElement } from "@/src/utils/web-focus";

const LOGO = require("../../assets/images/rivan-logo.png");

const NAV_ITEMS = [
  { key: "featured", label: "Properties" },
] as const;

const QUICK_ACTIONS = [
  { key: "services", label: "Services", icon: "tool", color: "#FCE8D8" },
  { key: "documents", label: "Documents", icon: "file-text", color: "#E4F3E8" },
  { key: "wishlist", label: "Wishlist", icon: "heart", color: "#FCE4EA" },
] as const;

type SectionKey = (typeof NAV_ITEMS)[number]["key"] | "top" | "access";

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

function getUserRoleLabel(user?: { role?: string; is_admin?: boolean } | null) {
  const role = String(user?.role || "").toLowerCase();
  if (user?.is_admin || ["admin", "manager", "super_admin"].includes(role)) return "Admin";
  if (["agent", "sub_agent"].includes(role)) return "Agent";
  return "Customer";
}

export function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string; profile?: string }>();
  const { isAuthed, signOut, user, refresh } = useAuth();
  const { width } = useWindowDimensions();

  const isDesktop = width >= 980;
  const isPhone = width < 520;

  const [authVisible, setAuthVisible] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileVisible, setProfileVisible] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState("All locations");
  const [selectedPropertyType, setSelectedPropertyType] = useState("All types");
  const [openDropdown, setOpenDropdown] = useState<null | "location" | "type">(null);
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<NormalizedProperty[]>([]);

  useEffect(() => {
    let active = true;

    async function loadProperties() {
      try {
        warmBackendReady();
        const [featuredResult, propertiesResult] = await Promise.allSettled([
          api.featured(),
          api.listProperties(),
        ]);

        const featured =
          featuredResult.status === "fulfilled"
            ? enrichPropertyCollection(normalizePropertyCollection(featuredResult.value))
            : [];
        const allProperties =
          propertiesResult.status === "fulfilled"
            ? enrichPropertyCollection(normalizePropertyCollection(propertiesResult.value))
            : [];
        const liveProperties = featured.length ? featured : allProperties;

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

  const locationOptions = useMemo(
    () => ["All locations", "Siripuram", "Tukkuguda", "Shadnagar", "Adibatla", "Maheshwaram", "Srisailam Highway"],
    []
  );

  const propertyTypeOptions = useMemo(
    () => ["All types", "Layouts", "Plots", "Villas", "Farm Lands", "Apartments", "Commercial"],
    []
  );

  const siripuramProperty = useMemo(
    () => properties.find((property) => property.id === "prop-1" || /siripuram/i.test(`${property.name} ${property.location}`)) || null,
    [properties]
  );
  const curatedProperties = useMemo(() => (siripuramProperty ? [siripuramProperty] : properties), [properties, siripuramProperty]);
  const heroProperty = curatedProperties[0] || null;
  const featuredProperties = useMemo(() => curatedProperties.slice(0, Math.min(curatedProperties.length, 3)), [curatedProperties]);
  const categoryChips = useMemo(() => ["All", "Plots", "Layouts", "Villas", "Documents"], []);

  const filteredProperties = useMemo(() => {
    const normalizedLocation = selectedLocation.toLowerCase();
    const normalizedType = selectedPropertyType.toLowerCase();

    return curatedProperties
      .filter((property) => {
        const matchesLocation =
          selectedLocation === "All locations" || String(property.location || "").toLowerCase().includes(normalizedLocation);
        const matchesType =
          !selectedPropertyType ||
          selectedPropertyType === "All types" ||
          String(property.category || "").toLowerCase().includes(normalizedType) ||
          (selectedPropertyType === "Layouts" && /plot|layout/i.test(`${property.category || ""} ${property.name || ""}`));
        return matchesLocation && matchesType;
      })
      .slice(0, 3);
  }, [curatedProperties, selectedLocation, selectedPropertyType]);

  const searchBarLayoutStyle = useMemo(
    () =>
      isDesktop
        ? null
        : ({
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
          } as const),
    [isDesktop]
  );

  const featuredGridLayoutStyle = useMemo(
    () =>
      isDesktop
        ? null
        : ({
            display: "flex",
            flexDirection: "column",
          } as const),
    [isDesktop]
  );

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

  const openProperties = useCallback(() => {
    blurActiveWebElement();
    if (typeof document !== "undefined" && document.getElementById("featured")) {
      scrollToSection("featured");
      setMenuOpen(false);
      return;
    }
    router.push({ pathname: "/", params: { section: "featured" } });
    setMenuOpen(false);
  }, [router, scrollToSection]);

  const openAgentLogin = useCallback(() => {
    blurActiveWebElement();
    router.push("/agent-login");
    setMenuOpen(false);
  }, [router]);

  const openAdminLogin = useCallback(() => {
    blurActiveWebElement();
    router.push("/admin-login");
    setMenuOpen(false);
  }, [router]);

  useEffect(() => {
    if (params.section !== "featured" && params.section !== "access") return;
    const timer = setTimeout(() => scrollToSection(params.section === "access" ? "access" : "featured"), 120);
    return () => clearTimeout(timer);
  }, [params.section, scrollToSection]);

  useEffect(() => {
    if (params.profile === "1" && isAuthed) {
      setProfileVisible(true);
    }
  }, [isAuthed, params.profile]);

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
          <TouchableOpacity key={item.key} style={styles.navLinkChip} onPress={openProperties}>
            <Text style={styles.navLink}>{item.label}</Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.navButtonGhost} onPress={openAgentLogin}>
          <Text style={styles.navButtonGhostText}>Agent Login</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navButtonGhost} onPress={openAdminLogin}>
          <Text style={styles.navButtonGhostText}>Admin</Text>
        </TouchableOpacity>

        {isAuthed ? (
          <>
            <TouchableOpacity style={styles.profileChip} onPress={() => setProfileVisible(true)}>
              <View style={styles.profileAvatar}>
                <Text style={styles.profileAvatarText}>{getUserInitials(user?.name)}</Text>
              </View>
              <View>
                <Text style={styles.profileName}>{getUserDisplayName(user)}</Text>
                <Text style={styles.profileSub}>{getUserRoleLabel(user)}</Text>
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

  const mobileMenuContent = (
    <View style={styles.mobileMenuStack}>
      <TouchableOpacity style={styles.mobileMenuLink} onPress={openProperties}>
        <Text style={styles.mobileMenuLinkText}>Properties</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.mobileMenuLink} onPress={openAgentLogin}>
        <Text style={styles.mobileMenuLinkText}>Agent Login</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.mobileMenuLink} onPress={openAdminLogin}>
        <Text style={styles.mobileMenuLinkText}>Admin</Text>
      </TouchableOpacity>
      {isAuthed ? (
        <>
          <TouchableOpacity style={styles.mobileMenuLink} onPress={() => { setMenuOpen(false); setProfileVisible(true); }}>
            <Text style={styles.mobileMenuLinkText}>Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.mobileMenuPrimary}
            onPress={async () => {
              await signOut();
              setMenuOpen(false);
            }}
          >
            <Text style={styles.mobileMenuPrimaryText}>Sign Out</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity style={styles.mobileMenuPrimary} onPress={() => openAuth("login")}>
          <Text style={styles.mobileMenuPrimaryText}>Login / Signup</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDeepest} />

      <CustomerAuthModal
        visible={authVisible}
        mode={authMode}
        onClose={() => setAuthVisible(false)}
        onSuccess={() => setAuthVisible(false)}
      />
      <ProfileSidebar
        visible={profileVisible}
        user={user}
        onClose={() => setProfileVisible(false)}
        onRefresh={refresh}
        onSavedProperties={() => {
          setProfileVisible(false);
          router.push("/wishlist");
        }}
        onSiteVisits={() => {
          setProfileVisible(false);
          router.push("/(tabs)/visits");
        }}
        onSupport={() => {
          setProfileVisible(false);
          router.push("/services");
        }}
        onLogout={async () => {
          await signOut();
          setProfileVisible(false);
        }}
      />

      {menuOpen && !isDesktop ? (
        <View style={styles.overlayRoot} pointerEvents="box-none">
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
            <Pressable style={[styles.menuCard, isPhone && styles.menuCardPhone]}>{mobileMenuContent}</Pressable>
          </Pressable>
        </View>
      ) : null}

      {openDropdown !== null ? (
        <View style={styles.overlayRoot} pointerEvents="box-none">
          <Pressable style={styles.dropdownBackdrop} onPress={() => setOpenDropdown(null)}>
            <Pressable style={styles.dropdownModal}>
              <Text style={styles.dropdownTitle}>{openDropdown === "location" ? "Choose location" : "Choose property type"}</Text>
              {(openDropdown === "location" ? locationOptions : propertyTypeOptions).map((option) => {
                const selected = openDropdown === "location" ? selectedLocation === option : selectedPropertyType === option;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[styles.dropdownOption, selected && styles.dropdownOptionActive]}
                    onPress={() => {
                      if (openDropdown === "location") setSelectedLocation(option);
                      else setSelectedPropertyType(option);
                      setOpenDropdown(null);
                    }}
                  >
                    <Text style={[styles.dropdownOptionText, selected && styles.dropdownOptionTextActive]}>{option}</Text>
                    {selected ? <Feather name="check" size={16} color={colors.primary} /> : null}
                  </TouchableOpacity>
                );
              })}
            </Pressable>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.navbar, isPhone && styles.navbarPhone, scrolled && styles.navbarScrolled]}>
        {isDesktop ? (
          <View style={styles.navDesktop}>{navContent}</View>
        ) : (
          <View style={[styles.navMobile, isPhone && styles.navMobilePhone]}>
            <TouchableOpacity style={[styles.logoWrap, isPhone && styles.logoWrapPhone]} onPress={() => scrollToSection("top")}>
              <Image source={LOGO} style={styles.navLogoImage} resizeMode="contain" />
              <View>
                <Text style={styles.logoText}>Rivan</Text>
                <Text style={styles.logoSup}>REALTY</Text>
              </View>
            </TouchableOpacity>
            <View style={styles.navMobileActions}>
              {isAuthed ? (
                <TouchableOpacity style={styles.mobileProfileChip} onPress={() => setProfileVisible(true)}>
                  <Text style={styles.mobileProfileChipText}>{getUserDisplayName(user)}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.mobileAuthButton, isPhone && styles.mobileAuthButtonPhone]} onPress={() => openAuth("login")}>
                  <Text style={styles.mobileAuthButtonText}>{isPhone ? "Login" : "Login / Signup"}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.mobileMenuButton} onPress={() => setMenuOpen(true)}>
                <Feather name="menu" size={20} color={colors.white} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(event) => setScrolled(event.nativeEvent.contentOffset.y > 20)}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.homeShell, isDesktop && styles.homeShellDesktop, isPhone && styles.homeShellPhone]}>
          <View style={[styles.homeTopCard, isDesktop && styles.homeTopCardDesktop]}>
            <View style={styles.greetingRow}>
              <View>
                <View style={styles.locationRow}>
                  <Feather name="map-pin" size={14} color={colors.accent} />
                  <Text style={styles.locationText}>{selectedLocation === "All locations" ? "Achutapuram" : selectedLocation}</Text>
                  <Feather name="chevron-down" size={14} color={colors.stone500} />
                </View>
                <Text style={styles.greetingText}>Hi, {getUserDisplayName(user).split(" ")[0] || "Puneeth"} 👋</Text>
              </View>
              <View style={styles.topIconsRow}>
                <TouchableOpacity style={styles.topIconButton} onPress={() => router.push("/wishlist")}>
                  <Feather name="heart" size={18} color={colors.primaryDeepest} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.topIconButton} onPress={() => router.push("/notifications")}>
                  <Feather name="bell" size={18} color={colors.primaryDeepest} />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.searchHeroBar} activeOpacity={0.9} onPress={openProperties}>
              <Feather name="search" size={18} color={colors.stone400} />
              <Text style={styles.searchHeroText}>Search properties, locations...</Text>
            </TouchableOpacity>

            <View style={[styles.searchControlsRow, searchBarLayoutStyle]}>
              <TouchableOpacity style={styles.compactFilter} onPress={() => setOpenDropdown("location")}>
                <Text style={styles.compactFilterLabel}>Location</Text>
                <Text numberOfLines={1} style={styles.compactFilterValue}>{selectedLocation}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.compactFilter} onPress={() => setOpenDropdown("type")}>
                <Text style={styles.compactFilterLabel}>Property type</Text>
                <Text numberOfLines={1} style={styles.compactFilterValue}>{selectedPropertyType}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.compactSearchButton} onPress={openProperties}>
                <Text style={styles.compactSearchButtonText}>Search</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View nativeID="featured" style={styles.homeSectionBlock}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.mobileSectionTitle}>Featured Projects</Text>
              <View style={styles.premiumPill}>
                <Feather name="star" size={12} color={colors.accent} />
                <Text style={styles.premiumPillText}>Premium</Text>
              </View>
            </View>

            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.loadingText}>Loading live listings...</Text>
              </View>
            ) : !featuredProperties.length ? (
              <View style={styles.loadingBox}>
                <Text style={styles.loadingText}>No live property is available right now.</Text>
              </View>
            ) : (
              <ScrollView
                horizontal={!isDesktop}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[styles.featuredScroller, isDesktop && styles.featuredScrollerDesktop]}
              >
                {featuredProperties.map((property, index) => (
                  <TouchableOpacity
                    key={property.id}
                    style={[styles.featuredProjectCard, isDesktop && styles.featuredProjectCardDesktop]}
                    activeOpacity={0.95}
                    onPress={() => router.push(`/property/${property.id}`)}
                  >
                    <View style={styles.featuredProjectMedia}>
                      {property.image ? <PropertyMedia image={property.image} style={styles.featuredProjectMediaImage} /> : <View style={styles.propFallback} />}
                      <View style={styles.featuredProjectOverlay} />
                      <View style={styles.featuredProjectBadge}>
                        <Text style={styles.featuredProjectBadgeText}>{index === 0 ? "Open plots" : property.category || "Layout"}</Text>
                      </View>
                    </View>
                    <View style={styles.featuredProjectCopy}>
                      <Text style={styles.featuredProjectName} numberOfLines={1}>{property.name}</Text>
                      <View style={styles.featuredProjectLocationRow}>
                        <Feather name="map-pin" size={12} color="rgba(255,255,255,0.78)" />
                        <Text style={styles.featuredProjectLocation} numberOfLines={1}>{property.location}</Text>
                      </View>
                      <Text style={styles.featuredProjectPrice}>From {property.startingPrice ? formatINR(property.startingPrice) : "On request"}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          <View style={styles.homeSectionBlock}>
            <Text style={styles.mobileSectionTitle}>Browse Categories</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroller}>
              {categoryChips.map((chip) => {
                const active =
                  (chip === "All" && selectedPropertyType === "All types") ||
                  selectedPropertyType.toLowerCase().includes(chip.toLowerCase());
                return (
                  <TouchableOpacity
                    key={chip}
                    style={[styles.categoryChip, active && styles.categoryChipActive]}
                    onPress={() => {
                      if (chip === "All") {
                        setSelectedPropertyType("All types");
                        return;
                      }
                      if (chip === "Documents") {
                        router.push("/documents");
                        return;
                      }
                      setSelectedPropertyType(chip);
                    }}
                  >
                    <Feather name={chip === "All" ? "grid" : chip === "Documents" ? "file-text" : chip === "Villas" ? "home" : "layers"} size={15} color={active ? colors.white : colors.primary} />
                    <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{chip}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.homeSectionBlock}>
            <View style={[styles.quickActionsGrid, isDesktop && styles.quickActionsGridDesktop]}>
              {QUICK_ACTIONS.map((action) => (
                <TouchableOpacity
                  key={action.key}
                  style={styles.quickActionCard}
                  onPress={() => {
                    if (action.key === "services") router.push("/services");
                    if (action.key === "documents") router.push("/documents");
                    if (action.key === "wishlist") router.push("/wishlist");
                  }}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: action.color }]}>
                    <Feather name={action.icon as any} size={20} color={colors.primary} />
                  </View>
                  <Text style={styles.quickActionText}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.homeSectionBlock}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.mobileSectionTitle}>All Properties ({filteredProperties.length || curatedProperties.length})</Text>
              <TouchableOpacity onPress={openProperties}>
                <Text style={styles.featLink}>View all</Text>
              </TouchableOpacity>
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
              <View style={[styles.propertiesGrid, isDesktop && styles.propertiesGridDesktop]}>
                {filteredProperties.map((property) => (
                  <TouchableOpacity key={property.id} style={styles.propertyListCard} activeOpacity={0.95} onPress={() => router.push(`/property/${property.id}`)}>
                    <View style={styles.propertyListMedia}>
                      {property.image ? <PropertyMedia image={property.image} style={styles.propertyListMediaImage} /> : <View style={styles.propFallback} />}
                      <View style={styles.propertyListTag}>
                        <Text style={styles.propertyListTagText}>{property.availability || "Available"}</Text>
                      </View>
                      <View style={styles.propertyListTypeTag}>
                        <Text style={styles.propertyListTypeTagText}>{property.category || "Open Plots"}</Text>
                      </View>
                    </View>
                    <View style={styles.propertyListBody}>
                      <Text style={styles.propertyListName}>{property.name}</Text>
                      <Text style={styles.propertyListLocation}>{property.location}</Text>
                      <Text style={styles.propertyListPrice}>{property.startingPrice ? formatINR(property.startingPrice) : "On request"}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>

        <View nativeID="access" style={[styles.loginSection, !isDesktop && styles.loginSectionMobile, isPhone && styles.loginSectionPhone]}>
          <View style={styles.loginLeft}>
            <Text style={styles.sectionEyeGold}>Access</Text>
            <Text style={styles.loginHeading}>Use the right portal without leaving the home experience.</Text>
            <Text style={styles.loginParagraph}>
              Keep browsing publicly, then open the correct flow only when you need to continue as a customer, agent,
              or admin.
            </Text>

            <View style={styles.portalCards}>
              <TouchableOpacity
                style={[styles.portalCard, isPhone && styles.portalCardPhone]}
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
                style={[styles.portalCard, isPhone && styles.portalCardPhone]}
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

          <View style={[styles.loginFormWrap, isPhone && styles.loginFormWrapPhone]}>
            <Text style={styles.formLogo}>Rivan Reality</Text>
            <Text style={styles.formSub}>Compact access bars for every live login flow.</Text>

            {isAuthed ? (
              <View style={styles.customerPill}>
                <Text style={styles.customerPillText}>{user?.phone || user?.email || "Signed in"}</Text>
              </View>
            ) : null}

            <View style={styles.accessBars}>
              <View style={styles.accessBar}>
                <View style={styles.accessBarCopy}>
                  <Text style={styles.accessBarTitle}>Customer</Text>
                  <Text style={styles.accessBarText}>Save visits, bookings, and your profile.</Text>
                </View>
                <TouchableOpacity style={styles.accessBarButton} onPress={() => (isAuthed ? setProfileVisible(true) : openAuth("login"))}>
                  <Text style={styles.accessBarButtonText}>{isAuthed ? "Open" : "Login"}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.accessBar}>
                <View style={styles.accessBarCopy}>
                  <Text style={styles.accessBarTitle}>Agent</Text>
                  <Text style={styles.accessBarText}>Approved agent OTP access and application flow.</Text>
                </View>
                <TouchableOpacity style={styles.accessBarButtonMuted} onPress={() => router.push("/agent-login")}>
                  <Text style={styles.accessBarButtonMutedText}>Open</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.accessBar}>
                <View style={styles.accessBarCopy}>
                  <Text style={styles.accessBarTitle}>Admin</Text>
                  <Text style={styles.accessBarText}>Manager-approved OTP access for approvals and operations.</Text>
                </View>
                <TouchableOpacity style={styles.accessBarButtonMuted} onPress={() => router.push("/admin-login")}>
                  <Text style={styles.accessBarButtonMutedText}>Open</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.formDivider}>Customer, agent, and admin access stay separated by live role checks.</Text>
          </View>
        </View>

        <View style={[styles.footer, isPhone && styles.footerPhone]}>
          <View style={[styles.footerInner, !isDesktop && styles.footerInnerMobile]}>
            <TouchableOpacity style={styles.footerBrand} onPress={() => scrollToSection("top")}>
              <Image source={LOGO} style={styles.footerLogoImage} resizeMode="contain" />
              <Text style={styles.footerLogo}>Rivan Reality</Text>
            </TouchableOpacity>
          </View>
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
  navbarPhone: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
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
    width: "100%",
  },
  navMobilePhone: {
    gap: 8,
  },
  navMobileActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  mobileAuthButton: {
    minHeight: 38,
    borderRadius: 19,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  mobileAuthButtonPhone: {
    paddingHorizontal: 10,
  },
  mobileAuthButtonText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: "700",
  },
  mobileProfileChip: {
    minHeight: 38,
    borderRadius: 19,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  mobileProfileChipText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: "700",
  },
  logoWrap: { flexDirection: "row", alignItems: "center", gap: 12 },
  logoWrapPhone: { flex: 1, minWidth: 0 },
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
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 60,
    elevation: 60,
  },
  menuBackdrop: { flex: 1, backgroundColor: "rgba(10,46,31,0.7)", justifyContent: "flex-start" },
  menuCard: {
    marginTop: 88,
    marginHorizontal: 20,
    borderRadius: 20,
    backgroundColor: colors.surface,
    padding: 18,
    gap: 12,
    width: "auto",
    maxWidth: 360,
    alignSelf: "flex-end",
  },
  menuCardPhone: {
    marginTop: 80,
    marginHorizontal: 16,
    maxWidth: 9999,
    alignSelf: "stretch",
    borderRadius: 18,
  },
  mobileMenuStack: {
    gap: 10,
  },
  mobileMenuLink: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  mobileMenuLinkText: {
    color: colors.primaryDeepest,
    fontSize: 14,
    fontWeight: "700",
  },
  mobileMenuPrimary: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  mobileMenuPrimaryText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "800",
  },
  dropdownBackdrop: {
    flex: 1,
    backgroundColor: "rgba(10,46,31,0.28)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  dropdownModal: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 360,
    borderRadius: 18,
    backgroundColor: colors.white,
    padding: 18,
    gap: 10,
    ...shadow.lg,
  },
  dropdownTitle: {
    color: colors.primaryDeepest,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  dropdownOption: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownOptionActive: {
    borderColor: "rgba(26,122,74,0.35)",
    backgroundColor: colors.surfaceMuted,
  },
  dropdownOptionText: {
    color: colors.primaryDeepest,
    fontSize: 14,
    fontWeight: "600",
  },
  dropdownOptionTextActive: {
    color: colors.primary,
  },
  hero: {
    minHeight: Platform.OS === "web" ? 720 : 0,
    overflow: "hidden",
    backgroundColor: colors.primaryDeepest,
  },
  heroMobile: { flexDirection: "column" },
  heroPhone: {
    minHeight: 0,
  },
  heroLeft: {
    flex: 1,
    backgroundColor: colors.primaryDeepest,
    justifyContent: "flex-end",
    paddingHorizontal: Platform.OS === "web" ? 64 : 28,
    paddingBottom: 80,
    paddingTop: 130,
  },
  heroLeftFull: {
    width: "100%",
  },
  heroLeftPhone: {
    paddingHorizontal: 18,
    paddingTop: 92,
    paddingBottom: 22,
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
    fontSize: Platform.OS === "web" ? 48 : 38,
    lineHeight: Platform.OS === "web" ? 56 : 46,
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
  heroTitlePhone: {
    fontSize: 30,
    lineHeight: 37,
    marginBottom: 16,
  },
  heroSubPhone: {
    fontSize: 13,
    lineHeight: 22,
    marginBottom: 22,
  },
  heroStats: {
    flexDirection: "row",
    gap: 40,
    paddingTop: 44,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    marginTop: 44,
    flexWrap: "wrap",
  },
  heroStatsPhone: {
    gap: 18,
    paddingTop: 22,
    marginTop: 22,
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
  heroSearchWrap: {
    paddingHorizontal: Platform.OS === "web" ? 60 : 28,
    paddingBottom: 44,
    marginTop: -12,
    backgroundColor: colors.primaryDeepest,
  },
  heroSearchWrapPhone: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    marginTop: 0,
  },
  searchBarInline: {
    width: "100%",
    maxWidth: 1120,
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 18,
    paddingHorizontal: 24,
    paddingVertical: 20,
    ...(Platform.OS === "web"
      ? ({
          display: "grid",
          gridTemplateColumns: "1fr 1fr auto",
          gap: 14,
          alignItems: "end",
        } as any)
      : {}),
    ...shadow.lg,
  },
  searchBarInlinePhone: {
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
  },
  searchField: { flex: 1 },
  searchFieldPhone: { width: "100%" },
  searchLabel: {
    color: "#6B7A6E",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  searchSelect: {
    width: "100%",
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D4DDD6",
    paddingHorizontal: 12,
    backgroundColor: "#F8FAF7",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  searchSelectText: {
    color: colors.primaryDeepest,
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
    marginRight: 8,
  },
  searchSelectTextPhone: {
    fontSize: 12,
  },
  btnSearchWide: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.primaryDeepest,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
  },
  btnSearchWidePhone: { width: "100%" },
  btnSearchWideText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "700",
  },
  homeShell: {
    backgroundColor: "#F7F8F4",
    paddingTop: 92,
    paddingHorizontal: 16,
    paddingBottom: 30,
    gap: 18,
  },
  homeShellDesktop: {
    paddingTop: 120,
    paddingHorizontal: 28,
    gap: 24,
  },
  homeShellPhone: {
    paddingTop: 86,
    paddingHorizontal: 12,
  },
  homeTopCard: {
    backgroundColor: colors.white,
    borderRadius: 28,
    padding: 18,
    gap: 16,
    ...shadow.md,
  },
  homeTopCardDesktop: {
    padding: 22,
  },
  greetingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  locationText: {
    color: colors.stone500,
    fontSize: 13,
    fontWeight: "600",
  },
  greetingText: {
    color: colors.primaryDeepest,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    fontFamily: fonts.heading,
  },
  topIconsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  topIconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#F5F6F1",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  searchHeroBar: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: "#FBFBF8",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchHeroText: {
    color: colors.stone400,
    fontSize: 15,
    fontWeight: "500",
  },
  searchControlsRow: {
    gap: 12,
  },
  compactFilter: {
    flex: 1,
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: "#F7F8F4",
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: "center",
  },
  compactFilterLabel: {
    color: colors.stone400,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  compactFilterValue: {
    color: colors.primaryDeepest,
    fontSize: 14,
    fontWeight: "700",
  },
  compactSearchButton: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: colors.primaryDeepest,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  compactSearchButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "800",
  },
  homeSectionBlock: {
    gap: 14,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  mobileSectionTitle: {
    color: colors.primaryDeepest,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
    fontFamily: fonts.heading,
  },
  premiumPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  premiumPillText: {
    color: colors.accentDark,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  featuredScroller: {
    gap: 14,
    paddingRight: 6,
  },
  featuredScrollerDesktop: {
    flexDirection: "row",
  },
  featuredProjectCard: {
    width: 254,
    borderRadius: 26,
    overflow: "hidden",
    backgroundColor: colors.primaryDark,
    ...shadow.md,
  },
  featuredProjectCardDesktop: {
    flex: 1,
    width: "auto",
    minWidth: 0,
  },
  featuredProjectMedia: {
    height: 190,
    position: "relative",
    backgroundColor: "#9DAC9C",
  },
  featuredProjectMediaImage: {
    width: "100%",
    height: "100%",
  },
  featuredProjectOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(12,33,23,0.22)",
  },
  featuredProjectBadge: {
    position: "absolute",
    left: 14,
    top: 14,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  featuredProjectBadgeText: {
    color: colors.primaryDeepest,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  featuredProjectCopy: {
    padding: 16,
    gap: 6,
  },
  featuredProjectName: {
    color: colors.white,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "800",
    fontFamily: fonts.heading,
  },
  featuredProjectLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  featuredProjectLocation: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 13,
    flex: 1,
  },
  featuredProjectPrice: {
    color: "#F3C47D",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 4,
  },
  categoryScroller: {
    gap: 10,
    paddingRight: 10,
  },
  categoryChip: {
    minHeight: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryChipText: {
    color: colors.primaryDeepest,
    fontSize: 14,
    fontWeight: "700",
  },
  categoryChipTextActive: {
    color: colors.white,
  },
  quickActionsGrid: {
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
    gap: 12,
  },
  quickActionsGridDesktop: {
    justifyContent: "flex-start",
  },
  quickActionCard: {
    flex: 1,
    alignItems: "center",
    gap: 10,
  },
  quickActionIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionText: {
    color: colors.primaryDeepest,
    fontSize: 13,
    fontWeight: "600",
  },
  propertiesGrid: {
    gap: 14,
  },
  propertiesGridDesktop: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  propertyListCard: {
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    ...shadow.sm,
  },
  propertyListMedia: {
    height: 180,
    position: "relative",
    backgroundColor: "#E3E6DF",
  },
  propertyListMediaImage: {
    width: "100%",
    height: "100%",
  },
  propertyListTag: {
    position: "absolute",
    left: 12,
    top: 12,
    borderRadius: 7,
    backgroundColor: colors.available,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  propertyListTagText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  propertyListTypeTag: {
    position: "absolute",
    right: 12,
    top: 12,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  propertyListTypeTagText: {
    color: colors.primaryDeepest,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  propertyListBody: {
    padding: 16,
    gap: 4,
  },
  propertyListName: {
    color: colors.primaryDeepest,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "800",
    fontFamily: fonts.heading,
  },
  propertyListLocation: {
    color: colors.stone500,
    fontSize: 13,
    lineHeight: 18,
  },
  propertyListPrice: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 4,
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
  sectionPhone: {
    paddingVertical: 56,
    paddingHorizontal: 16,
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
  propBodyPhone: { padding: 16 },
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
    paddingVertical: 84,
    paddingHorizontal: Platform.OS === "web" ? 60 : 28,
    flexDirection: "row",
    gap: 48,
    alignItems: "center",
  },
  loginSectionMobile: { flexDirection: "column", gap: 28, alignItems: "stretch" },
  loginSectionPhone: {
    paddingVertical: 56,
    paddingHorizontal: 16,
    gap: 24,
  },
  loginLeft: { flex: 1 },
  loginHeading: {
    color: colors.white,
    fontSize: Platform.OS === "web" ? 32 : 26,
    lineHeight: Platform.OS === "web" ? 40 : 34,
    fontWeight: "500",
    fontFamily: Platform.OS === "web" ? ("Georgia, serif" as any) : undefined,
    marginBottom: 20,
  },
  loginParagraph: { color: "rgba(255,255,255,0.55)", fontSize: 14, lineHeight: 24, marginBottom: 24 },
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
  portalCardPhone: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
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
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 22,
  },
  loginFormWrapPhone: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderRadius: 18,
  },
  formLogo: {
    color: colors.primaryDeepest,
    fontSize: 18,
    fontWeight: "700",
    fontFamily: Platform.OS === "web" ? ("Georgia, serif" as any) : undefined,
    marginBottom: 2,
  },
  formSub: { color: "#6B7A6E", fontSize: 12, marginBottom: 18, lineHeight: 18 },
  roleSwitch: { backgroundColor: "#F1F5F2", borderRadius: 10, padding: 5, marginBottom: 28 },
  roleSwitchActive: { backgroundColor: colors.white, borderRadius: 7, paddingVertical: 10, alignItems: "center" },
  roleSwitchText: { color: colors.primaryDeepest, fontSize: 13, fontWeight: "600" },
  customerPill: {
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  customerPillText: { color: colors.primaryDeepest, fontSize: 14, fontWeight: "600" },
  accessBars: { gap: 10 },
  accessBar: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  accessBarCopy: { flex: 1, gap: 4 },
  accessBarTitle: { color: colors.primaryDeepest, fontSize: 13, fontWeight: "800" },
  accessBarText: { color: colors.stone500, fontSize: 12, lineHeight: 18 },
  accessBarButton: {
    minHeight: 36,
    borderRadius: 18,
    paddingHorizontal: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  accessBarButtonText: { color: colors.white, fontSize: 12, fontWeight: "800" },
  accessBarButtonMuted: {
    minHeight: 36,
    borderRadius: 18,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(26,122,74,0.18)",
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  accessBarButtonMutedText: { color: colors.primaryDeepest, fontSize: 12, fontWeight: "800" },
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
  formDivider: { textAlign: "center", color: "#B0BCB3", fontSize: 11, marginTop: 14, lineHeight: 18 },
  footer: {
    backgroundColor: colors.primaryDark,
    paddingHorizontal: Platform.OS === "web" ? 60 : 28,
    paddingTop: 60,
    paddingBottom: 40,
  },
  footerPhone: {
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 28,
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
    fontFamily: fonts.heading,
  },
  footerBrand: { flexDirection: "row", alignItems: "center", gap: 12 },
  footerLogoImage: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.white },
  footerLinks: { flexDirection: "row", gap: 28, flexWrap: "wrap" },
  footerLink: { color: "rgba(255,255,255,0.55)", fontSize: 13 },
});
