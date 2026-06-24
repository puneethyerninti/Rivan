import { Platform } from "react-native";

export const colors = {
  primary: "#0F5A37",
  primaryDark: "#0B452A",
  primaryDeepest: "#0A2D1C",
  primaryLight: "#2B7A55",
  primaryGlow: "#72B08D",
  primarySoft: "#E8F3EC",
  accent: "#C98943",
  accentDark: "#A66D32",
  accentLight: "#E7BB88",
  accentSoft: "#F8EBDC",
  white: "#FFFFFF",
  offWhite: "#FAF7F0",
  surface: "#FFFDF8",
  surfaceMuted: "#F4F0E6",
  surfaceAlt: "#EFF4EE",
  stone50: "#F7F4EE",
  stone100: "#EEE8DD",
  stone200: "#DDD4C5",
  stone300: "#C4B8A4",
  stone400: "#9B907E",
  stone500: "#72685B",
  stone600: "#5B5146",
  stone700: "#3E3A35",
  stone900: "#171512",
  black: "#000000",
  available: "#2E8E5A",
  reserved: "#D7A63F",
  booked: "#3D6FA8",
  sold: "#C95A45",
  success: "#2E8E5A",
  warning: "#C98943",
  danger: "#C95A45",
  info: "#3D6FA8",
  pendingBg: "#F9F1E3",
  pendingText: "#9A6A2E",
  approvedBg: "#E7F4EC",
  approvedText: "#1E6A41",
  rejectedBg: "#FDEAEA",
  rejectedText: "#A83F32",
  border: "#DCD3C5",
  borderSoft: "#E9E2D7",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radii = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 9999,
  full: 9999,
};

export const fonts = {
  heading: "System" as const,
  body: "System" as const,
};

export const typography = {
  h1: { fontSize: 42, lineHeight: 50, fontWeight: "800" as const, letterSpacing: -1.1 },
  h2: { fontSize: 32, lineHeight: 40, fontWeight: "800" as const, letterSpacing: -0.8 },
  h3: { fontSize: 24, lineHeight: 32, fontWeight: "700" as const, letterSpacing: -0.4 },
  h4: { fontSize: 18, lineHeight: 24, fontWeight: "700" as const },
  bodyLarge: { fontSize: 17, lineHeight: 27, fontWeight: "400" as const },
  body: { fontSize: 15, lineHeight: 24, fontWeight: "400" as const },
  small: { fontSize: 13, lineHeight: 20, fontWeight: "400" as const },
  label: { fontSize: 11, lineHeight: 14, fontWeight: "700" as const, letterSpacing: 1.5, textTransform: "uppercase" as const },
};

export const shadow = {
  sm:
    Platform.OS === "web"
      ? ({ boxShadow: "0 8px 18px rgba(34, 32, 27, 0.06)" } as const)
      : {
          shadowColor: "#1F1B16",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.06,
          shadowRadius: 10,
          elevation: 2,
        },
  md:
    Platform.OS === "web"
      ? ({ boxShadow: "0 18px 38px rgba(34, 32, 27, 0.08)" } as const)
      : {
          shadowColor: "#1F1B16",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.08,
          shadowRadius: 24,
          elevation: 4,
        },
  lg:
    Platform.OS === "web"
      ? ({ boxShadow: "0 28px 60px rgba(34, 32, 27, 0.12)" } as const)
      : {
          shadowColor: "#1F1B16",
          shadowOffset: { width: 0, height: 18 },
          shadowOpacity: 0.12,
          shadowRadius: 36,
          elevation: 8,
        },
};

export const plotStatusColor = (status: string): string => {
  switch (status) {
    case "available":
      return colors.available;
    case "reserved":
      return colors.reserved;
    case "booked":
      return colors.booked;
    case "sold":
      return colors.sold;
    default:
      return colors.stone400;
  }
};

export const plotStatusLabel = (status: string): string => {
  switch (status) {
    case "available":
      return "Available";
    case "reserved":
      return "Reserved";
    case "booked":
      return "Booked";
    case "sold":
      return "Sold";
    default:
      return status;
  }
};

export const formatINR = (amount: number): string => {
  if (amount >= 10000000) return `Rs ${Number(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `Rs ${Number(amount / 100000).toFixed(2)} L`;
  return `Rs ${amount.toLocaleString("en-IN")}`;
};

export const formatINRFull = (amount: number): string => {
  return `Rs ${Math.round(amount).toLocaleString("en-IN")}`;
};
