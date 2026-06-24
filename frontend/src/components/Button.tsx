import React from "react";
import {
  ActivityIndicator,
  GestureResponderEvent,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";

import { colors, radii, shadow, spacing, typography } from "@/src/theme";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";

type Props = {
  title: string;
  onPress?: (e: GestureResponderEvent) => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  testID?: string;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  size?: "sm" | "md" | "lg";
};

export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  style,
  textStyle,
  testID,
  icon,
  fullWidth = true,
  size = "md",
}: Props) {
  const isDisabled = disabled || loading;
  const variantStyles = getVariantStyles(variant);
  const sizeStyles = getSizeStyles(size);

  return (
    <TouchableOpacity
      testID={testID}
      activeOpacity={0.9}
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.base,
        shadow.sm,
        sizeStyles.container,
        variantStyles.container,
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variantStyles.text.color} size="small" />
      ) : (
        <View style={styles.row}>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <Text style={[sizeStyles.text, variantStyles.text, textStyle]}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function getVariantStyles(variant: Variant): { container: ViewStyle; text: TextStyle } {
  switch (variant) {
    case "primary":
      return {
        container: { backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.primaryDark },
        text: { color: colors.white, fontWeight: "800" },
      };
    case "secondary":
      return {
        container: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
        text: { color: colors.primaryDeepest, fontWeight: "700" },
      };
    case "accent":
      return {
        container: { backgroundColor: colors.accent, borderWidth: 1, borderColor: colors.accentDark },
        text: { color: colors.white, fontWeight: "800" },
      };
    case "ghost":
      return {
        container: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.borderSoft },
        text: { color: colors.primaryDeepest, fontWeight: "700" },
      };
    case "danger":
      return {
        container: { backgroundColor: colors.rejectedBg, borderWidth: 1, borderColor: "#EDC1B8" },
        text: { color: colors.rejectedText, fontWeight: "800" },
      };
  }
}

function getSizeStyles(size: "sm" | "md" | "lg"): { container: ViewStyle; text: TextStyle } {
  switch (size) {
    case "sm":
      return {
        container: { minHeight: 42, paddingHorizontal: spacing.xl },
        text: { ...typography.small, fontWeight: "700" },
      };
    case "lg":
      return {
        container: { minHeight: 58, paddingHorizontal: spacing.xxl },
        text: { ...typography.bodyLarge, fontWeight: "700" },
      };
    case "md":
    default:
      return {
        container: { minHeight: 52, paddingHorizontal: spacing.xl },
        text: { ...typography.body, fontWeight: "700" },
      };
  }
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  fullWidth: {
    alignSelf: "stretch",
  },
  disabled: {
    opacity: 0.55,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  icon: {
    marginRight: 2,
  },
});
