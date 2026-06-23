import React, { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as WebBrowser from "expo-web-browser";
import { View, ActivityIndicator, Platform, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/auth-context";
import { colors } from "@/src/theme";

SplashScreen.preventAutoHideAsync();
WebBrowser.maybeCompleteAuthSession();
export const unstable_settings = {
  initialRouteName: "index",
};

function RootLayoutInner() {
  const { user, isLoading, isAuthed } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;
    const rootSegment = segments[0];
    const isAgent = user?.role === "agent" || user?.role === "sub_agent";
    const isAuthScreen = ["login", "admin-login", "agent-login", "agent-apply"].includes(rootSegment || "");

    if (!isAuthed && rootSegment === "admin") {
      router.replace("/admin-login");
      return;
    }

    if (!isAuthed && rootSegment === "agent" && Platform.OS !== "web") {
      router.replace("/agent-login");
      return;
    }

    if (isAuthed && user?.is_admin && rootSegment !== "admin" && isAuthScreen) {
      router.replace("/admin");
      return;
    }

    if (isAuthed && isAgent && rootSegment !== "agent" && isAuthScreen) {
      router.replace("/agent");
      return;
    }

    if (isAuthed && !user?.is_admin && !isAgent && isAuthScreen) {
      router.replace("/(tabs)");
    }
  }, [isAuthed, isLoading, router, segments, user]);

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.white } }} />
  );
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthProvider>
        <RootLayoutInner />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
});
