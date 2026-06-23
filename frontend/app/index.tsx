import React from "react";
import { Redirect } from "expo-router";

import { useAuth } from "@/src/auth-context";
import { HomeScreen } from "@/app/(tabs)/index";

export default function IndexScreen() {
  const { user, isLoading, isAuthed } = useAuth();

  if (isLoading) return null;

  const isAgent = user?.role === "agent" || user?.role === "sub_agent";

  if (isAuthed && isAgent) {
    return <Redirect href="/agent" />;
  }

  if (isAuthed && user?.is_admin) {
    return <Redirect href="/admin" />;
  }

  return <HomeScreen />;
}
