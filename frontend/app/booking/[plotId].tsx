import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Button } from "@/src/components/Button";
import { colors, formatINR, plotStatusColor, plotStatusLabel, radii, shadow, spacing, typography } from "@/src/theme";

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const normalized = Number(value.replace(/[^\d.]/g, ""));
      if (Number.isFinite(normalized) && normalized > 0) return normalized;
    }
  }
  return undefined;
}

export default function BookingScreen() {
  const { plotId } = useLocalSearchParams<{ plotId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isPhone = width < 520;

  const [plot, setPlot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [mobile, setMobile] = useState(user?.phone || "");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const payload = await api.getPlot(plotId as string);
        if (!active) return;
        setPlot({
          id: firstString(payload?.id, payload?._id),
          number: firstString(payload?.plot_number, payload?.plot_no, payload?.unit_number),
          size: firstString(payload?.size, payload?.area),
          facing: firstString(payload?.facing, payload?.orientation),
          price: firstNumber(payload?.price, payload?.base_price),
          status: firstString(payload?.status, "available").toLowerCase(),
        });
      } catch (error: any) {
        if (active) Alert.alert("Booking", error?.message || "Unable to load this unit.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [plotId]);

  async function handleSubmit() {
    if (!name.trim() || mobile.replace(/\D/g, "").length < 10) {
      Alert.alert("Required", "Please enter your full name and a valid mobile number.");
      return;
    }

    setSubmitting(true);
    try {
      await api.createBooking({
        plot_id: plotId,
        name: name.trim(),
        mobile: mobile.replace(/\D/g, "").slice(0, 10),
        message: message.trim(),
      });
      setSuccess(true);
    } catch (error: any) {
      Alert.alert("Booking failed", error?.message || "Unable to submit the booking request.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (success) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.successWrap}>
          <View style={styles.successIcon}>
            <Feather name="check" size={34} color={colors.white} />
          </View>
          <Text style={styles.successTitle}>Booking request received</Text>
          <Text style={styles.successBody}>
            Your enquiry for {plot?.number || "this unit"} has been submitted. The Rivan team will contact you shortly to continue the process.
          </Text>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Unit</Text>
            <Text style={styles.summaryValue}>{plot?.number || "-"}</Text>
            <Text style={styles.summaryLabel}>Price</Text>
            <Text style={styles.summaryValue}>{plot?.price ? formatINR(plot.price) : "On request"}</Text>
          </View>
          <View style={[styles.successActions, isPhone && styles.successActionsPhone]}>
            <Button title="View My Bookings" onPress={() => router.replace("/(tabs)/myland")} fullWidth={false} style={{ flex: 1 }} />
            <Button title="Back Home" variant="secondary" onPress={() => router.replace("/")} fullWidth={false} style={{ flex: 1 }} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={[styles.content, isPhone && styles.contentPhone]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
              <Feather name="arrow-left" size={18} color={colors.primaryDeepest} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Reserve your unit</Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={[styles.heroCard, isPhone && styles.heroCardPhone]}>
            <Text style={styles.heroEyebrow}>Booking request</Text>
            <Text style={styles.heroTitle}>A simpler booking step with clearer context.</Text>
            <Text style={styles.heroBody}>
              This form keeps the next step focused: confirm the unit, share your contact details, and let the team take it forward.
            </Text>
          </View>

          <View style={[styles.unitCard, isPhone && styles.unitCardPhone]}>
            <View style={[styles.unitTopRow, isPhone && styles.unitTopRowPhone]}>
              <View>
                <Text style={styles.unitNumber}>{plot?.number || "Selected unit"}</Text>
                <Text style={styles.unitMeta}>{[plot?.size, plot?.facing].filter(Boolean).join(" | ") || "Size and facing on request"}</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: plotStatusColor(plot?.status || "available") }]}>
                <Text style={styles.statusText}>{plotStatusLabel(plot?.status || "available")}</Text>
              </View>
            </View>

            <View style={styles.unitPriceRow}>
              <Text style={styles.unitPriceLabel}>Indicative price</Text>
              <Text style={styles.unitPriceValue}>{plot?.price ? formatINR(plot.price) : "On request"}</Text>
            </View>
          </View>

          <View style={[styles.formCard, isPhone && styles.formCardPhone]}>
            <Text style={styles.formTitle}>Your details</Text>

            <Field label="Full name">
              <TextInput
                testID="booking-name-input"
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Enter your full name"
                placeholderTextColor={colors.stone400}
              />
            </Field>

            <Field label="Mobile number">
              <TextInput
                testID="booking-mobile-input"
                style={styles.input}
                value={mobile}
                onChangeText={(text) => setMobile(text.replace(/\D/g, "").slice(0, 10))}
                placeholder="10-digit mobile number"
                placeholderTextColor={colors.stone400}
                keyboardType="phone-pad"
                maxLength={10}
              />
            </Field>

            <Field label="Message (optional)">
              <TextInput
                testID="booking-message-input"
                style={[styles.input, styles.textarea]}
                value={message}
                onChangeText={setMessage}
                placeholder="Share any pricing, visit, or documentation request"
                placeholderTextColor={colors.stone400}
                multiline
                textAlignVertical="top"
              />
            </Field>

            <View style={styles.notice}>
              <Feather name="info" size={14} color={colors.primary} />
              <Text style={styles.noticeText}>
                By continuing, you agree to be contacted by the Rivan team for booking confirmation and next steps.
              </Text>
            </View>

            <Button title="Submit Booking Request" onPress={handleSubmit} loading={submitting} testID="booking-submit-button" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.offWhite },
  flex: { flex: 1 },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  contentPhone: { padding: spacing.md, paddingBottom: spacing.xxl },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  headerTitle: { ...typography.h4, color: colors.primaryDeepest },
  headerSpacer: { width: 44 },
  heroCard: {
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.xl,
    gap: spacing.sm,
    ...shadow.sm,
  },
  heroCardPhone: { borderRadius: 18, padding: spacing.lg },
  heroEyebrow: { ...typography.label, color: colors.primary },
  heroTitle: { ...typography.h3, color: colors.primaryDeepest },
  heroBody: { ...typography.body, color: colors.stone500 },
  unitCard: {
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.lg,
    gap: spacing.lg,
    ...shadow.sm,
  },
  unitCardPhone: { borderRadius: 18 },
  unitTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm },
  unitTopRowPhone: { flexDirection: "column", alignItems: "flex-start" },
  unitNumber: { ...typography.h4, color: colors.primaryDeepest },
  unitMeta: { marginTop: spacing.sm, ...typography.body, color: colors.stone500 },
  statusPill: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.pill },
  statusText: { ...typography.small, color: colors.white, fontWeight: "800" },
  unitPriceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  unitPriceLabel: { ...typography.body, color: colors.stone500 },
  unitPriceValue: { ...typography.h4, color: colors.primary },
  formCard: {
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadow.sm,
  },
  formCardPhone: { borderRadius: 18, padding: spacing.lg },
  formTitle: { ...typography.h3, color: colors.primaryDeepest },
  field: { gap: spacing.sm },
  fieldLabel: { ...typography.small, color: colors.stone500, fontWeight: "700" },
  input: {
    minHeight: 54,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    color: colors.primaryDeepest,
    fontSize: 15,
  },
  textarea: { minHeight: 112, paddingTop: spacing.lg },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  noticeText: { flex: 1, ...typography.small, color: colors.primaryDeepest, lineHeight: 20 },
  successWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.lg },
  successIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: { ...typography.h2, color: colors.primaryDeepest, textAlign: "center" },
  successBody: { ...typography.body, color: colors.stone500, textAlign: "center", maxWidth: 360 },
  summaryCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  summaryLabel: { ...typography.label, color: colors.stone400 },
  summaryValue: { ...typography.h4, color: colors.primaryDeepest },
  successActions: { width: "100%", maxWidth: 420, flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  successActionsPhone: { flexDirection: "column" },
});
