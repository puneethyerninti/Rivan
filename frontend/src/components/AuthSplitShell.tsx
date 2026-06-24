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
  const isWide = width >= 980;
  const isPhone = width < 520;

  const content = (
    <View style={[styles.card, isWide && styles.cardWide]}>
      <View style={[styles.formPanel, isPhone && styles.formPanelPhone]}>
        <View style={[styles.formTop, isPhone && styles.formTopPhone]}>
          <View style={styles.formHeadings}>
            <View style={styles.brandTop}>
              <View style={styles.logoFrame}>
                <Image source={LOGO} style={styles.logoImage} resizeMode="contain" />
              </View>
              <View>
                <Text style={styles.logoWordDark}>RIVAN</Text>
                <Text style={styles.logoSubDark}>Realty platform</Text>
              </View>
            </View>
            <Text style={styles.formEyebrow}>{formEyebrow}</Text>
            <Text style={styles.formTitle}>{formTitle}</Text>
            <Text style={styles.formSubtitle}>{formSubtitle}</Text>
          </View>

          <View style={styles.topActions}>
            {onHome ? (
              <TouchableOpacity style={[styles.homeButton, isPhone && styles.homeButtonPhone]} onPress={onHome}>
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
    maxWidth: 760,
    backgroundColor: "#FBF8F1",
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(220,211,197,0.9)",
    ...shadow.lg,
  },
  cardWide: {
    minHeight: 0,
  },
  brandTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  logoFrame: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  logoImage: { width: 22, height: 22 },
  logoWordDark: { color: colors.primaryDeepest, fontSize: 15, fontWeight: "800", letterSpacing: 3, fontFamily: fonts.heading },
  logoSubDark: { color: colors.stone500, fontSize: 10, marginTop: 1 },
  formPanel: {
    flex: 1,
    backgroundColor: "#FBF8F1",
    paddingHorizontal: 22,
    paddingVertical: 20,
  },
  formPanelPhone: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  formTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  formTopPhone: {
    flexDirection: "column",
    alignItems: "stretch",
    marginBottom: 12,
  },
  formHeadings: { flex: 1 },
  formEyebrow: {
    color: colors.accentDark,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2.2,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  formTitle: {
    color: colors.primaryDeepest,
    fontSize: Platform.OS === "web" ? 20 : 18,
    lineHeight: Platform.OS === "web" ? 26 : 24,
    fontWeight: "800",
    fontFamily: fonts.heading,
    marginBottom: 4,
  },
  formSubtitle: {
    color: colors.stone500,
    fontSize: 12,
    lineHeight: 18,
  },
  topActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  homeButton: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F3EEDF",
    borderWidth: 1,
    borderColor: "rgba(200,169,110,0.25)",
  },
  homeButtonPhone: {
    alignSelf: "flex-start",
  },
  homeButtonText: { color: colors.primaryDeepest, fontSize: 12, fontWeight: "800" },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#F3EEDF",
    alignItems: "center",
    justifyContent: "center",
  },
});
