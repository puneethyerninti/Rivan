import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { normalizePropertyRecord } from "@/src/property-presenter";
import { enrichProperty } from "@/src/real-property-overrides";
import { colors, radii, spacing, typography, shadow } from "@/src/theme";
import { Button } from "@/src/components/Button";

const TIME_SLOTS = ["10:00 AM", "11:00 AM", "12:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM"];

export default function CentreVisitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const idStr = id as string;
  const isSiteVisit = idStr?.startsWith("site-");
  const propertyId = isSiteVisit ? idStr.replace("site-", "") : null;

  const [centre, setCentre] = useState<any>(null);
  const [property, setProperty] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState("");
  const [time, setTime] = useState(TIME_SLOTS[0]);
  const [name, setName] = useState(user?.name || "");
  const [mobile, setMobile] = useState(user?.phone || "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (isSiteVisit && propertyId) {
          const p = await api.getProperty(propertyId);
          setProperty(enrichProperty(normalizePropertyRecord(p)));
        } else {
          const c = await api.getCentre(idStr);
          setCentre(c);
        }
      } catch (e: any) {
        Alert.alert("Error", e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [idStr, isSiteVisit, propertyId]);

  async function handleBook() {
    if (!date || !name || mobile.length < 10) {
      Alert.alert("Required", "Please fill all required fields");
      return;
    }
    setSubmitting(true);
    try {
      if (isSiteVisit && property) {
        await api.bookSiteVisit({
          property_id: property.id,
          visit_date: date,
          name,
          mobile,
        });
      } else if (centre) {
        await api.bookCentreVisit({
          centre_id: centre.id,
          visit_date: date,
          visit_time: time,
          name,
          mobile,
        });
      }
      Alert.alert("Visit Confirmed!", `Your ${isSiteVisit ? "site" : "centre"} visit on ${date}${!isSiteVisit ? ` at ${time}` : ""} has been scheduled.`, [
        { text: "OK", onPress: () => router.replace("/(tabs)/visits") },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <View style={styles.loader}><ActivityIndicator color={colors.primary} size="large" /></View>;

  const title = isSiteVisit ? property?.name : centre?.name;
  const subtitle = isSiteVisit ? property?.location : centre?.address;
  const image = isSiteVisit ? property?.image : centre?.image;

  return (
    <SafeAreaView style={styles.safe} testID="centre-visit-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <TouchableOpacity testID="centre-back" style={styles.headerBtn} onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color={colors.primaryDeepest} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isSiteVisit ? "Schedule Site Visit" : "Book Visit Slot"}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {image ? <Image source={{ uri: image }} style={styles.image} /> : null}

          <View style={styles.infoCard}>
            <Text style={styles.title}>{title}</Text>
            <View style={styles.row}>
              <Feather name="map-pin" size={12} color={colors.stone500} />
              <Text style={styles.meta} numberOfLines={2}>{subtitle}</Text>
            </View>
            {centre?.timings ? (
              <View style={styles.row}>
                <Feather name="clock" size={12} color={colors.stone500} />
                <Text style={styles.meta}>{centre.timings}</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.sectionTitle}>Schedule Details</Text>

          <View style={styles.inputBlock}>
            <Text style={styles.label}>Visit Date *</Text>
            <TextInput
              testID="centre-date-input"
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder="e.g. 28 March 2026"
              placeholderTextColor={colors.stone400}
            />
          </View>

          {!isSiteVisit ? (
            <View style={styles.inputBlock}>
              <Text style={styles.label}>Preferred Time</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeRow}>
                {TIME_SLOTS.map((t) => (
                  <TouchableOpacity
                    key={t}
                    testID={`centre-time-${t}`}
                    style={[styles.timeChip, time === t && styles.timeChipActive]}
                    onPress={() => setTime(t)}
                  >
                    <Text style={[styles.timeChipText, time === t && styles.timeChipTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.inputBlock}>
            <Text style={styles.label}>Your Name *</Text>
            <TextInput testID="centre-name-input" style={styles.input} value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={colors.stone400} />
          </View>

          <View style={styles.inputBlock}>
            <Text style={styles.label}>Mobile Number *</Text>
            <TextInput
              testID="centre-mobile-input"
              style={styles.input}
              value={mobile}
              onChangeText={(t) => setMobile(t.replace(/\D/g, "").slice(0, 10))}
              placeholder="10-digit number"
              placeholderTextColor={colors.stone400}
              keyboardType="phone-pad"
              maxLength={10}
            />
          </View>

          <Button title="Confirm Visit" onPress={handleBook} loading={submitting} testID="centre-confirm-button" style={{ marginTop: spacing.md }} />
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
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  image: { width: "100%", height: 160, borderRadius: radii.md },
  infoCard: { padding: spacing.md, backgroundColor: colors.offWhite, borderRadius: radii.md, gap: 6, borderWidth: 1, borderColor: colors.stone100 },
  title: { ...typography.h3, color: colors.primaryDeepest, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  meta: { ...typography.small, color: colors.stone600, flex: 1 },
  sectionTitle: { ...typography.h4, color: colors.primaryDeepest, fontWeight: "700", marginTop: spacing.md },
  inputBlock: { gap: 6 },
  label: { ...typography.small, color: colors.stone600, fontWeight: "600" },
  input: { backgroundColor: colors.offWhite, borderWidth: 1, borderColor: colors.stone200, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, color: colors.stone900 },
  timeRow: { gap: 8 },
  timeChip: { paddingHorizontal: spacing.md, paddingVertical: 10, backgroundColor: colors.offWhite, borderRadius: radii.full, borderWidth: 1, borderColor: colors.stone200 },
  timeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  timeChipText: { ...typography.small, color: colors.stone700, fontWeight: "600" },
  timeChipTextActive: { color: colors.white },
});
