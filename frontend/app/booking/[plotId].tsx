import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, KeyboardAvoidingView, Platform, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { colors, radii, spacing, typography, shadow, formatINR, plotStatusColor, plotStatusLabel } from "@/src/theme";
import { Button } from "@/src/components/Button";

export default function BookingScreen() {
  const { plotId } = useLocalSearchParams<{ plotId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [plot, setPlot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [mobile, setMobile] = useState(user?.phone || "");
  const [whatsapp, setWhatsapp] = useState(user?.phone || "");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p = await api.getPlot(plotId as string);
        setPlot(p);
      } catch (e: any) {
        Alert.alert("Error", e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [plotId]);

  async function handleSubmit() {
    if (!name || mobile.length < 10) {
      Alert.alert("Required", "Please enter your name and a valid mobile number");
      return;
    }
    setSubmitting(true);
    try {
      await api.createBooking({
        plot_id: plotId,
        name,
        mobile,
        whatsapp: whatsapp || mobile,
        message,
      });
      setSuccess(true);
    } catch (e: any) {
      Alert.alert("Booking failed", e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <View style={styles.loader}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }

  if (success) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.successWrap} testID="booking-success">
          <View style={styles.successIcon}>
            <Feather name="check" size={48} color={colors.white} />
          </View>
          <Text style={styles.successTitle}>Booking Request Received!</Text>
          <Text style={styles.successText}>
            Thank you, {name}. Our Rivan team will contact you shortly to confirm your booking for plot {plot?.plot_number}.
          </Text>
          <View style={styles.successDetails}>
            <Text style={styles.successDetailLabel}>Plot Number</Text>
            <Text style={styles.successDetailValue}>{plot?.plot_number}</Text>
            <Text style={styles.successDetailLabel}>Total Price</Text>
            <Text style={styles.successDetailValue}>{formatINR(plot?.price)}</Text>
          </View>
          <Button title="View My Bookings" onPress={() => router.replace("/(tabs)/myland")} testID="booking-view-mybookings" />
          <Button title="Back to Home" variant="ghost" onPress={() => router.replace("/")} testID="booking-back-home" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} testID="booking-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <TouchableOpacity testID="booking-back-button" style={styles.headerBtn} onPress={() => router.back()}>
            <Feather name="x" size={22} color={colors.primaryDeepest} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Book Plot</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Plot summary */}
          <View style={styles.plotCard}>
            <View style={styles.plotCardHeader}>
              <View>
                <Text style={styles.plotNumber}>Plot {plot?.plot_number}</Text>
                <Text style={styles.plotMeta}>{plot?.size} · {plot?.facing}</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: plotStatusColor(plot?.status) }]}>
                <Text style={styles.statusText}>{plotStatusLabel(plot?.status)}</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.row}>
              <Text style={styles.priceLabel}>Total Price</Text>
              <Text style={styles.price}>{formatINR(plot?.price)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.priceLabel}>Token Amount</Text>
              <Text style={styles.tokenPrice}>₹50,000</Text>
            </View>
          </View>

          <View style={styles.form}>
            <Text style={styles.formTitle}>Your Details</Text>

            <View style={styles.inputBlock}>
              <Text style={styles.label}>Full Name *</Text>
              <TextInput
                testID="booking-name-input"
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Enter your full name"
                placeholderTextColor={colors.stone400}
              />
            </View>

            <View style={styles.inputBlock}>
              <Text style={styles.label}>Mobile Number *</Text>
              <TextInput
                testID="booking-mobile-input"
                style={styles.input}
                value={mobile}
                onChangeText={(t) => setMobile(t.replace(/\D/g, "").slice(0, 10))}
                placeholder="10-digit number"
                placeholderTextColor={colors.stone400}
                keyboardType="phone-pad"
                maxLength={10}
              />
            </View>

            <View style={styles.inputBlock}>
              <Text style={styles.label}>WhatsApp Number</Text>
              <TextInput
                testID="booking-whatsapp-input"
                style={styles.input}
                value={whatsapp}
                onChangeText={(t) => setWhatsapp(t.replace(/\D/g, "").slice(0, 10))}
                placeholder="Same as mobile (if empty)"
                placeholderTextColor={colors.stone400}
                keyboardType="phone-pad"
                maxLength={10}
              />
            </View>

            <View style={styles.inputBlock}>
              <Text style={styles.label}>Message (optional)</Text>
              <TextInput
                testID="booking-message-input"
                style={[styles.input, { height: 100, textAlignVertical: "top" }]}
                value={message}
                onChangeText={setMessage}
                placeholder="Any specific requirements or questions"
                placeholderTextColor={colors.stone400}
                multiline
              />
            </View>

            <View style={styles.consentBox}>
              <Feather name="info" size={14} color={colors.primary} />
              <Text style={styles.consentText}>
                By submitting, you consent to be contacted by Rivan Reality about this property.
              </Text>
            </View>

            <Button title="Confirm Booking Request" onPress={handleSubmit} loading={submitting} testID="booking-submit-button" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.stone100 },
  headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.offWhite, alignItems: "center", justifyContent: "center" },
  headerTitle: { ...typography.h3, color: colors.primaryDeepest, fontWeight: "700" },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  plotCard: { backgroundColor: colors.offWhite, borderRadius: radii.md, padding: spacing.md, borderWidth: 1, borderColor: colors.stone100 },
  plotCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  plotNumber: { ...typography.h3, color: colors.primaryDeepest, fontWeight: "700" },
  plotMeta: { ...typography.small, color: colors.stone600, marginTop: 2 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.sm },
  statusText: { color: colors.white, fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  divider: { height: 1, backgroundColor: colors.stone200, marginVertical: spacing.sm },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  priceLabel: { ...typography.body, color: colors.stone600 },
  price: { ...typography.h3, color: colors.primary, fontWeight: "700" },
  tokenPrice: { ...typography.body, color: colors.accent, fontWeight: "700" },
  form: { gap: spacing.md, marginTop: spacing.md },
  formTitle: { ...typography.h3, color: colors.primaryDeepest, fontWeight: "700" },
  inputBlock: { gap: 6 },
  label: { ...typography.small, color: colors.stone600, fontWeight: "600" },
  input: { backgroundColor: colors.offWhite, borderWidth: 1, borderColor: colors.stone200, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, color: colors.stone900 },
  consentBox: { flexDirection: "row", gap: 8, padding: spacing.sm, backgroundColor: "#E6F4EA", borderRadius: radii.md, alignItems: "flex-start" },
  consentText: { flex: 1, ...typography.small, color: colors.primaryDeepest, lineHeight: 18 },
  successWrap: { flex: 1, padding: spacing.lg, alignItems: "center", justifyContent: "center", gap: spacing.md },
  successIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },
  successTitle: { ...typography.h1, color: colors.primaryDeepest, fontWeight: "700", textAlign: "center", marginTop: spacing.md },
  successText: { ...typography.body, color: colors.stone600, textAlign: "center", lineHeight: 22, maxWidth: 320 },
  successDetails: { backgroundColor: colors.offWhite, padding: spacing.md, borderRadius: radii.md, alignSelf: "stretch", marginVertical: spacing.md },
  successDetailLabel: { ...typography.small, color: colors.stone500, marginTop: 6 },
  successDetailValue: { ...typography.h4, color: colors.primaryDeepest, fontWeight: "700" },
});
