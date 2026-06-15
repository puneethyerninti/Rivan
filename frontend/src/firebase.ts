import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp, getApps } from "firebase/app";
import { Platform } from "react-native";
import { getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";

function readPublicEnv(name: string) {
  return (process.env[name] || "").trim().replace(/^['"]|['"]$/g, "");
}

const firebaseConfig = {
  apiKey: readPublicEnv("EXPO_PUBLIC_FIREBASE_API_KEY"),
  authDomain: readPublicEnv("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: readPublicEnv("EXPO_PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: readPublicEnv("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: readPublicEnv("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: readPublicEnv("EXPO_PUBLIC_FIREBASE_APP_ID"),
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
  throw new Error(
    `Firebase configuration is missing for ${Platform.OS}. Set EXPO_PUBLIC_FIREBASE_* variables before starting or building the app.`
  );
}

export const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

let firebaseAuthInstance: ReturnType<typeof getAuth> | null = null;

export function getFirebaseAuth() {
  if (firebaseAuthInstance) {
    return firebaseAuthInstance;
  }

  if (Platform.OS === "web") {
    firebaseAuthInstance = getAuth(firebaseApp);
    return firebaseAuthInstance;
  }

  try {
    firebaseAuthInstance = initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
    return firebaseAuthInstance;
  } catch (error: any) {
    const message = String(error?.message || "");
    if (
      message.includes("already exists") ||
      message.includes("has already been initialized") ||
      message.includes("already-initialized")
    ) {
      firebaseAuthInstance = getAuth(firebaseApp);
      return firebaseAuthInstance;
    }
    throw error;
  }
}

export { firebaseConfig };
