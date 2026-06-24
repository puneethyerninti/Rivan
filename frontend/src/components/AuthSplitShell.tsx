import React from "react";
import { Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { Feather } from "@expo/vector-icons";

import { colors, shadow } from "@/src/theme";

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
    padding: 24,
  },
  centerWrap: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    width: "100%",
    maxWidth: 1120,
    backgroundColor: "#FBF8F1",
    borderRadius: 36,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(220,211,197,0.9)",
    ...shadow.lg,
  },
  cardWide: {
    minHeight: 720,
    flexDirection: "row",
  },
  brandPanel: {
    backgroundColor: colors.primaryDeepest,
    paddingHorizontal: 48,
    paddingVertical: 48,
  },
  brandPanelWide: {
    width: 450,
    justifyContent: "center",
  },
  brandPanelNarrow: {
    justifyContent: "center",
    gap: 14,
  },
  brandTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 36,
  },
  logoFrame: {
    width: 68,
    height: 68,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  logoImage: { width: 34, height: 34 },
  logoWord: { color: colors.white, fontSize: 24, fontWeight: "800", letterSpacing: 5 },
  logoSub: { color: "rgba(255,255,255,0.68)", fontSize: 13, marginTop: 4 },
  brandEyebrow: {
    color: colors.accentLight,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2.6,
    textTransform: "uppercase",
    marginBottom: 18,
  },
  brandTitle: {
    color: colors.white,
    fontSize: Platform.OS === "web" ? 54 : 40,
    lineHeight: Platform.OS === "web" ? 66 : 50,
    fontWeight: "900",
    marginBottom: 20,
    maxWidth: 320,
  },
  brandBody: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 16,
    lineHeight: 28,
    maxWidth: 320,
    marginBottom: 28,
  },
  points: { gap: 18 },
  point: { flexDirection: "row", alignItems: "flex-start", gap: 12, maxWidth: 320 },
  pointText: { flex: 1, color: "rgba(255,255,255,0.8)", fontSize: 13, lineHeight: 23, fontWeight: "600" },
  formPanel: {
    flex: 1,
    backgroundColor: "#FBF8F1",
    paddingHorizontal: 48,
    paddingVertical: 44,
  },
  formTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 24,
  },
  formHeadings: { flex: 1 },
  formEyebrow: {
    color: colors.accentDark,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2.6,
    textTransform: "uppercase",
    marginBottom: 14,
  },
  formTitle: {
    color: colors.primaryDeepest,
    fontSize: Platform.OS === "web" ? 42 : 34,
    lineHeight: Platform.OS === "web" ? 50 : 42,
    fontWeight: "900",
    marginBottom: 8,
  },
  formSubtitle: {
    color: colors.stone500,
    fontSize: 16,
    lineHeight: 26,
  },
  topActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  homeButton: {
    minHeight: 54,
    paddingHorizontal: 22,
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F3EEDF",
    borderWidth: 1,
    borderColor: "rgba(200,169,110,0.25)",
  },
  homeButtonText: { color: colors.primaryDeepest, fontSize: 14, fontWeight: "800" },
  closeButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#F3EEDF",
    alignItems: "center",
    justifyContent: "center",
  },
});
