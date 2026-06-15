import { Platform } from "react-native";

// Rivan Reality design tokens
export const colors = {
  // Brand
  primary: "#0B5D1E",
  primaryDark: "#074116",
  primaryDeepest: "#052F0F",
  primaryLight: "#11802B",
  primaryGlow: "#19A83A",
  accent: "#F08A2E",
  accentDark: "#C96D1E",
  accentLight: "#F6B473",
  accentSoft: "#FDE6D2",
  // Neutrals
  white: "#FFFFFF",
  offWhite: "#F9FAF9",
  stone50: "#F4F5F4",
  stone100: "#ECEEEC",
  stone200: "#E5E7E5",
  stone300: "#D1D5D1",
  stone400: "#9CA3AF",
  stone500: "#6B7280",
  stone600: "#4B5563",
  stone700: "#374151",
  stone900: "#111827",
  black: "#000000",
  // Plot status
  available: "#10B981",
  reserved: "#F59E0B",
  booked: "#3B82F6",
  sold: "#EF4444",
  // Semantic
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  info: "#3B82F6",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radii = {
  sm: 4,
  md: 8,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const fonts = {
  // System fallbacks since we don't load custom fonts
  heading: "serif" as const,
  body: "System" as const,
};

export const typography = {
  h1: { fontSize: 32, lineHeight: 40, fontWeight: "700" as const, letterSpacing: -0.5 },
  h2: { fontSize: 24, lineHeight: 32, fontWeight: "700" as const, letterSpacing: -0.3 },
  h3: { fontSize: 20, lineHeight: 28, fontWeight: "600" as const },
  h4: { fontSize: 18, lineHeight: 24, fontWeight: "600" as const },
  bodyLarge: { fontSize: 16, lineHeight: 24, fontWeight: "400" as const },
  body: { fontSize: 14, lineHeight: 20, fontWeight: "400" as const },
  small: { fontSize: 12, lineHeight: 16, fontWeight: "400" as const },
  label: { fontSize: 11, lineHeight: 14, fontWeight: "700" as const, letterSpacing: 1.2, textTransform: "uppercase" as const },
};

export const shadow = {
  sm: Platform.OS === "web"
    ? { boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }
    : {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 2,
        elevation: 1,
      },
  md: Platform.OS === "web"
    ? { boxShadow: "0 2px 6px rgba(0,0,0,0.08)" }
    : {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
        elevation: 3,
      },
  lg: Platform.OS === "web"
    ? { boxShadow: "0 6px 16px rgba(0,0,0,0.12)" }
    : {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 6,
      },
};

export const plotStatusColor = (status: string): string => {
  switch (status) {
    case "available": return colors.available;
    case "reserved": return colors.reserved;
    case "booked": return colors.booked;
    case "sold": return colors.sold;
    default: return colors.stone400;
  }
};

export const plotStatusLabel = (status: string): string => {
  switch (status) {
    case "available": return "Available";
    case "reserved": return "Reserved";
    case "booked": return "Booked";
    case "sold": return "Sold";
    default: return status;
  }
};

export const formatINR = (amount: number): string => {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
  return `₹${amount.toLocaleString("en-IN")}`;
};

export const formatINRFull = (amount: number): string => {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
};
