import React, { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Button } from "@/src/components/Button";
import { api } from "@/src/api";
import { colors, radii, shadow, spacing, typography } from "@/src/theme";

type FormState = {
  name: string;
  phone: string;
  email: string;
  occupation: string;
  address: string;
  aadhaar_number: string;
  bank_details: string;
  agent_brand_name: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  phone: "",
  email: "",
  occupation: "",
  address: "",
  aadhaar_number: "",
  bank_details: "",
  agent_brand_name: "",
  notes: "",
};

export default function AgentApplyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ phone?: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 980;
  const initialPhone = typeof params.phone === "string" ? params.phone.replace(/\D/g, "").slice(-10) : "";
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, phone: initialPhone });
  const [loading, setLoading] = useState(false);
  const [submissionMessage, setSubmissionMessage] = useState("");
  const [submittedPhone, setSubmittedPhone] = useState("");

  const phoneDigits = useMemo(() => form.phone.replace(/\D/g, "").slice(-10), [form.phone]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submitApplication() {
    setSubmissionMessage("");
    if (!form.name.trim()) {
      Alert.alert("Agent application", "Please enter your full name.");
      return;
    }
    if (phoneDigits.length !== 10) {
      Alert.alert("Agent application", "Please enter a valid 10-digit mobile number.");
      return;
    }
    if (!form.email.trim()) {
      Alert.alert("Agent application", "Please enter your email address.");
      return;
    }
    if (!form.address.trim()) {
      Alert.alert("Agent application", "Please enter your address.");
      return;
    }

    setLoading(true);
    try {
      const response = await api.agentApply({
        name: form.name.trim(),
        phone: `+91${phoneDigits}`,
        email: form.email.trim() || undefined,
        occupation: form.occupation.trim() || undefined,
        address: form.address.trim() || undefined,
        aadhaar_number: form.aadhaar_number.trim() || undefined,
        bank_details: form.bank_details.trim() || undefined,
        agent_brand_name: form.agent_brand_name.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });

      if (response.already_approved) {
        router.replace({ pathname: "/agent-login", params: { phone: `+91${phoneDigits}`, application: "approved" } });
        return;
      }
      setSubmittedPhone(`+91${phoneDigits}`);
      setSubmissionMessage(response.message || "Agent application submitted. Manager approval is required before login.");
    } catch (error: any) {
      Alert.alert("Agent application", error?.message || "Unable to submit your application right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]}>
          <View style={[styles.shell, isWide && styles.shellWide]}>
              <View style={styles.hero}>
              <View style={styles.heroBadge}>
                <Feather name="briefcase" size={14} color={colors.white} />
                <Text style={styles.heroBadgeText}>AGENT APPROVAL FLOW</Text>
              </View>
              <Text style={styles.heroTitle}>Apply once. Get approved. Start selling with live inventory.</Text>
              <Text style={styles.heroBody}>
                Submit your registered mobile number and your working details here. Your manager can review the request in the admin dashboard and approve you for phone OTP login.
              </Text>

              <View style={styles.heroSteps}>
                <View style={styles.heroStep}>
                  <Text style={styles.heroStepNumber}>01</Text>
                  <Text style={styles.heroStepText}>Apply with your real phone number</Text>
                </View>
                <View style={styles.heroStep}>
                  <Text style={styles.heroStepNumber}>02</Text>
                  <Text style={styles.heroStepText}>Manager reviews and approves access</Text>
                </View>
                <View style={styles.heroStep}>
                  <Text style={styles.heroStepNumber}>03</Text>
                  <Text style={styles.heroStepText}>Login through OTP on the live URL</Text>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View>
                  <Text style={styles.cardTitle}>Agent Access Request</Text>
                  <Text style={styles.cardSubtitle}>This creates a real pending application for manager approval.</Text>
                </View>
                <TouchableOpacity onPress={() => router.replace("/agent-login")}>
                  <Text style={styles.backLink}>Back to Agent Login</Text>
                </TouchableOpacity>
              </View>

              {submissionMessage ? (
                <View style={styles.successCard}>
                  <View style={styles.successIcon}>
                    <Feather name="check" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.successCopy}>
                    <Text style={styles.successTitle}>Application submitted successfully</Text>
                    <Text style={styles.successBody}>{submissionMessage}</Text>
                    <Text style={styles.successBody}>Awaiting manager approval.</Text>
                    <Text style={styles.successBody}>
                      The same phone number {submittedPhone || `+91${phoneDigits}`} can be used after approval.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.successButton}
                    onPress={() =>
                      router.replace({
                        pathname: "/agent-login",
                        params: { phone: submittedPhone || `+91${phoneDigits}`, application: "submitted" },
                      })
                    }
                  >
                    <Text style={styles.successButtonText}>Back to agent login</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <View style={styles.fieldGrid}>
                <View style={styles.field}>
                  <Text style={styles.label}>Full Name</Text>
                  <TextInput
                    value={form.name}
                    onChangeText={(value) => setField("name", value)}
                    placeholder="Agent full name"
                    placeholderTextColor={colors.stone400}
                    style={styles.input}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Mobile Number</Text>
                  <View style={styles.phoneShell}>
                    <Text style={styles.phonePrefix}>+91</Text>
                    <TextInput
                      value={form.phone}
                      onChangeText={(value) => setField("phone", value.replace(/\D/g, ""))}
                      placeholder="9900012345"
                      placeholderTextColor={colors.stone400}
                      keyboardType="phone-pad"
                      maxLength={10}
                      style={styles.phoneInput}
                    />
                  </View>
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    value={form.email}
                    onChangeText={(value) => setField("email", value)}
                    placeholder="agent@rivan.com"
                    placeholderTextColor={colors.stone400}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    style={styles.input}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Brand / Team Name</Text>
                  <TextInput
                    value={form.agent_brand_name}
                    onChangeText={(value) => setField("agent_brand_name", value)}
                    placeholder="Rivan Crest Partners"
                    placeholderTextColor={colors.stone400}
                    style={styles.input}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Occupation</Text>
                  <TextInput
                    value={form.occupation}
                    onChangeText={(value) => setField("occupation", value)}
                    placeholder="Sales executive, broker, channel partner"
                    placeholderTextColor={colors.stone400}
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Address</Text>
                <TextInput
                  value={form.address}
                  onChangeText={(value) => setField("address", value)}
                  placeholder="Current address"
                  placeholderTextColor={colors.stone400}
                  style={styles.input}
                />
              </View>

              <View style={styles.fieldGrid}>
                <View style={styles.field}>
                  <Text style={styles.label}>Aadhaar Number</Text>
                  <TextInput
                    value={form.aadhaar_number}
                    onChangeText={(value) => setField("aadhaar_number", value)}
                    placeholder="Optional KYC reference"
                    placeholderTextColor={colors.stone400}
                    style={styles.input}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Bank Details</Text>
                  <TextInput
                    value={form.bank_details}
                    onChangeText={(value) => setField("bank_details", value)}
                    placeholder="Optional payout details"
                    placeholderTextColor={colors.stone400}
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Manager Notes / Experience</Text>
                <TextInput
                  value={form.notes}
                  onChangeText={(value) => setField("notes", value)}
                  placeholder="Projects handled, local market knowledge, or manager note"
                  placeholderTextColor={colors.stone400}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  style={[styles.input, styles.textarea]}
                />
              </View>

              <Button title="Submit For Manager Approval" onPress={submitApplication} loading={loading} />

              <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>What happens next</Text>
                <Text style={styles.infoText}>Your request appears in the admin agent queue with pending approval.</Text>
                <Text style={styles.infoText}>After approval, the same phone number can be used on the live agent OTP login screen.</Text>
                <Text style={styles.infoText}>Rejected or suspended accounts are blocked automatically until the manager updates the status.</Text>
              </View>
              </View>
            </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.offWhite },
  scroll: { flexGrow: 1, padding: spacing.xl },
  scrollWide: { justifyContent: "center", paddingVertical: spacing.xxxl },
  shell: { gap: spacing.xl },
  shellWide: { flexDirection: "row", alignItems: "stretch" },
  hero: {
    flex: 1,
    minHeight: 360,
    borderRadius: radii.xl,
    backgroundColor: colors.primaryDeepest,
    padding: spacing.xxl,
    gap: spacing.lg,
    justifyContent: "space-between",
    ...shadow.md,
  },
  heroBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  heroBadgeText: { ...typography.label, color: colors.white },
  heroTitle: { ...typography.h1, color: colors.white, fontWeight: "800" },
  heroBody: { ...typography.body, color: "#D7E7DD", lineHeight: 24 },
  heroSteps: { gap: spacing.md },
  heroStep: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  heroStepNumber: { color: colors.accentLight, fontWeight: "800", fontSize: 13 },
  heroStepText: { color: colors.white, fontWeight: "600", flex: 1 },
  card: {
    flex: 1.1,
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    padding: spacing.xxl,
    ...shadow.md,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  cardTitle: { ...typography.h3, color: colors.primaryDeepest, fontWeight: "800" },
  cardSubtitle: { ...typography.body, color: colors.stone500, lineHeight: 24, maxWidth: 560 },
  backLink: { color: colors.primary, fontWeight: "700" },
  successCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: "rgba(26,122,74,0.18)",
    backgroundColor: "#F3FAF5",
    padding: spacing.lg,
    gap: spacing.md,
  },
  successIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(26,122,74,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  successCopy: { gap: spacing.xs },
  successTitle: { ...typography.h4, color: colors.primaryDeepest },
  successBody: { ...typography.body, color: colors.stone600, lineHeight: 22 },
  successButton: {
    alignSelf: "flex-start",
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  successButtonText: { ...typography.body, color: colors.white, fontWeight: "800" },
  fieldGrid: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },
  field: { flex: 1, minWidth: 240, gap: spacing.sm },
  label: { ...typography.label, color: colors.primaryDeepest },
  input: {
    minHeight: 56,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: spacing.lg,
    color: colors.primaryDeepest,
    backgroundColor: colors.surfaceAlt,
  },
  phoneShell: {
    minHeight: 56,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surfaceAlt,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  phonePrefix: { color: colors.primaryDeepest, fontWeight: "800", marginRight: spacing.sm },
  phoneInput: { flex: 1, color: colors.primaryDeepest, paddingVertical: 0 },
  textarea: { minHeight: 128, paddingTop: spacing.lg },
  infoBox: {
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.lg,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoTitle: { ...typography.label, color: colors.primaryDeepest, fontSize: 12 },
  infoText: { ...typography.body, color: colors.stone600, lineHeight: 22 },
});
