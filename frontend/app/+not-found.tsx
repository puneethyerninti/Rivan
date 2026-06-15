import React, { useEffect } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/src/auth-context";
import { Button } from "@/src/components/Button";
import { colors, spacing } from "@/src/theme";

export default function NotFoundScreen() {
  const router = useRouter();
  const { user, isAuthed, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    const isAgent = user?.role === "agent" || user?.role === "sub_agent";
    const target = isAuthed ? (isAgent ? "/agent" : "/") : "/login";
    const timer = setTimeout(() => router.replace(target), 150);
    return () => clearTimeout(timer);
  }, [isAuthed, isLoading, router, user]);

  return (
    <View style={styles.safe}>
      <View style={styles.card}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.title}>Opening Rivan...</Text>
        <Text style={styles.text}>Recovering the correct route for Expo Go.</Text>
        {!isLoading ? (
          <View style={styles.actions}>
            <Button title="Go To Login" fullWidth={false} onPress={() => router.replace("/login")} />
            <Button title="Go To Home" variant="secondary" fullWidth={false} onPress={() => router.replace("/")} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.offWhite,
    borderRadius: 20,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    color: colors.primaryDeepest,
    textAlign: "center",
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.stone500,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
    justifyContent: "center",
  },
});
