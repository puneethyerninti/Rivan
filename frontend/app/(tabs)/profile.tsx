import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { colors } from "@/src/theme";

export default function ProfileRouteRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace({ pathname: "/", params: { profile: "1" } });
  }, [router]);

  return (
    <View style={styles.loader}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    backgroundColor: colors.offWhite,
    alignItems: "center",
    justifyContent: "center",
  },
});
