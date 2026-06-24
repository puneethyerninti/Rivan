import React from "react";
import { Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { Feather } from "@expo/vector-icons";

import { colors, fonts, shadow } from "@/src/theme";

const LOGO = require("../../assets/images/rivan-logo.png");

type Point = {
  icon: React.ComponentProps<typeof Feather>["name"];
  text: string;
};

type Props = {
  eyebrow: string;
  title: string;
  body: string;
  points: Point[];
  formEyebrow: string;
  formTitle: string;
  formSubtitle: string;
  onHome?: () => void;
  onClose?: () => void;
  homeLabel?: string;
  children: React.ReactNode;
  scrollable?: boolean;
};

export function AuthSplitShell({
  eyebrow,
  title,
  body,
  points,
  formEyebrow,
  formTitle,
  formSubtitle,
  onHome,
  onClose,
  homeLabel = "Home",
  children,
  scrollable = true,
}: Props) {
  const { width } = useWindowDimensions();
  const isWide = width >= 1080;

  const content = (
    <View style={[styles.card, isWide && styles.cardWide]}>
      <View style={[styles.brandPanel, isWide ? styles.brandPanelWide : styles.brandPanelNarrow]}>
        <View style={styles.brandTop}>
          <View style={styles.logoFrame}>
            <Image source={LOGO} style={styles.logoImage} resizeMode="contain" />
          </View>
          <View>
            <Text style={styles.logoWord}>RIVAN</Text>
            <Text style={styles.logoSub}>Realty platform</Text>
          </View>
        </View>

        <Text style={styles.brandEyebrow}>{eyebrow}</Text>
        <Text style={styles.brandTitle}>{title}</Text>
        <Text style={styles.brandBody}>{body}</Text>

        <View style={styles.points}>
          {points.map((point) => (
            <View key={point.text} style={styles.point}>
              <Feather name={point.icon} size={17} color={colors.accentLight} />
              <Text style={styles.pointText}>{point.text}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.formPanel}>
        <View style={styles.formTop}>
          <View style={styles.formHeadings}>
            <Text style={styles.formEyebrow}>{formEyebrow}</Text>
            <Text style={styles.formTitle}>{formTitle}</Text>
            <Text style={styles.formSubtitle}>{formSubtitle}</Text>
          </View>

          <View style={styles.topActions}>
            {onHome ? (
              <TouchableOpacity style={styles.homeButton} onPress={onHome}>
                <Feather name="arrow-left" size={16} color={colors.primaryDeepest} />
                <Text style={styles.homeButtonText}>{homeLabel}</Text>
              </TouchableOpacity>
            ) : null}
            {onClose ? (
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Feather name="x" size={18} color={colors.stone700} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {children}
      </View>
    </View>
  );

  if (!scrollable) {
    return <View style={styles.centerWrap}>{content}</View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.centerWrap}>{content}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 16,
  },
  centerWrap: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    width: "100%",
    maxWidth: 980,
    backgroundColor: "#FBF8F1",
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(220,211,197,0.9)",
    ...shadow.lg,
  },
  cardWide: {
    minHeight: 520,
    flexDirection: "row",
  },
  brandPanel: {
    backgroundColor: colors.primaryDeepest,
    paddingHorizontal: 28,
    paddingVertical: 28,
  },
  brandPanelWide: {
    width: 320,
    justifyContent: "center",
  },
  brandPanelNarrow: {
    justifyContent: "center",
    gap: 14,
  },
  brandTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
  },
  logoFrame: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  logoImage: { width: 28, height: 28 },
  logoWord: { color: colors.white, fontSize: 18, fontWeight: "800", letterSpacing: 4, fontFamily: fonts.heading },
  logoSub: { color: "rgba(255,255,255,0.68)", fontSize: 12, marginTop: 2 },
  brandEyebrow: {
    color: colors.accentLight,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.6,
    textTransform: "uppercase",
    marginBottom: 14,
  },
  brandTitle: {
    color: colors.white,
    fontSize: Platform.OS === "web" ? 32 : 27,
    lineHeight: Platform.OS === "web" ? 40 : 34,
    fontWeight: "800",
    fontFamily: fonts.heading,
    marginBottom: 12,
    maxWidth: 260,
  },
  brandBody: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    lineHeight: 24,
    maxWidth: 260,
    marginBottom: 16,
  },
  points: { gap: 12 },
  point: { flexDirection: "row", alignItems: "flex-start", gap: 10, maxWidth: 260 },
  pointText: { flex: 1, color: "rgba(255,255,255,0.8)", fontSize: 12, lineHeight: 20, fontWeight: "600" },
  formPanel: {
    flex: 1,
    backgroundColor: "#FBF8F1",
    paddingHorizontal: 28,
    paddingVertical: 24,
  },
  formTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 16,
  },
  formHeadings: { flex: 1 },
  formEyebrow: {
    color: colors.accentDark,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.6,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  formTitle: {
    color: colors.primaryDeepest,
    fontSize: Platform.OS === "web" ? 25 : 22,
    lineHeight: Platform.OS === "web" ? 31 : 28,
    fontWeight: "800",
    fontFamily: fonts.heading,
    marginBottom: 6,
  },
  formSubtitle: {
    color: colors.stone500,
    fontSize: 14,
    lineHeight: 22,
  },
  topActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  homeButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F3EEDF",
    borderWidth: 1,
    borderColor: "rgba(200,169,110,0.25)",
  },
  homeButtonText: { color: colors.primaryDeepest, fontSize: 13, fontWeight: "800" },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F3EEDF",
    alignItems: "center",
    justifyContent: "center",
  },
});
