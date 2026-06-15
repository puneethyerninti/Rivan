import React from "react";
import { Redirect } from "expo-router";

import { useAuth } from "@/src/auth-context";

export default function IndexScreen() {
  const { user, isLoading, isAuthed } = useAuth();

  if (isLoading) return null;

  const isAgent = user?.role === "agent" || user?.role === "sub_agent";

  if (!isAuthed) {
    return <Redirect href="/login" />;
  }

  if (isAgent) {
    return <Redirect href="/agent" />;
  }

  return <Redirect href="/(tabs)" />;
}
