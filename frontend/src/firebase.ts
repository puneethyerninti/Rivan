import AsyncStorage from "@react-native-async-storage/async-storage";
import type { FirebaseApp } from "firebase/app";
import { initializeApp, getApps } from "firebase/app";
import { Platform } from "react-native";

function normalizePublicEnv(value?: string) {
  return (value || "").trim().replace(/^['"]|['"]$/g, "");
}

const firebaseConfig = {
  apiKey: normalizePublicEnv(process.env.EXPO_PUBLIC_FIREBASE_API_KEY),
  authDomain: normalizePublicEnv(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: normalizePublicEnv(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: normalizePublicEnv(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: normalizePublicEnv(process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
  appId: normalizePublicEnv(process.env.EXPO_PUBLIC_FIREBASE_APP_ID),
};

export const hasFirebaseConfig = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

export const firebaseConfigError = hasFirebaseConfig
  ? ""
  : `Firebase configuration is missing for ${Platform.OS}. Set EXPO_PUBLIC_FIREBASE_* variables before starting or building the app.`;

export const firebaseApp: FirebaseApp | null = hasFirebaseConfig
  ? getApps().length
    ? getApps()[0]
    : initializeApp(firebaseConfig)
  : null;

let firebaseAuthInstance: any | null = null;
let firebaseAuthModulePromise: Promise<any> | null = null;

async function loadFirebaseAuthModule() {
  if (!firebaseAuthModulePromise) {
    firebaseAuthModulePromise = import("firebase/auth");
  }
  return firebaseAuthModulePromise;
}

export async function getFirebaseAuth() {
  if (firebaseAuthInstance) {
    return firebaseAuthInstance;
  }

  if (!firebaseApp || !hasFirebaseConfig) {
    throw new Error(firebaseConfigError || "Firebase configuration is unavailable.");
  }

  const { browserLocalPersistence, getAuth, getReactNativePersistence, initializeAuth, setPersistence } =
    await loadFirebaseAuthModule();

  if (Platform.OS === "web") {
    try {
      firebaseAuthInstance = getAuth(firebaseApp);
      await setPersistence(firebaseAuthInstance, browserLocalPersistence);
      return firebaseAuthInstance;
    } catch (error: any) {
      const message = String(error?.message || "");
      if (message.includes("already exists") || message.includes("has already been initialized") || message.includes("already-initialized")) {
        firebaseAuthInstance = getAuth(firebaseApp);
        return firebaseAuthInstance;
      }
      throw error;
    }
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

export async function getFirebasePhoneAuthHelpers() {
  const authModule = await loadFirebaseAuthModule();
  return {
    RecaptchaVerifier: authModule.RecaptchaVerifier,
    signInWithPhoneNumber: authModule.signInWithPhoneNumber,
    getIdToken: authModule.getIdToken,
  };
}

export async function signInWithFirebaseGooglePopup() {
  if (Platform.OS !== "web") {
    throw new Error("Firebase Google popup sign-in is only available on web.");
  }

  const auth = await getFirebaseAuth();
  const authModule = await loadFirebaseAuthModule();
  const provider = new authModule.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const result = await authModule.signInWithPopup(auth, provider);
  const idToken = await result.user.getIdToken(true);

  if (!idToken) {
    throw new Error("Firebase did not return a valid session token after Google sign-in.");
  }

  return idToken;
}

export { firebaseConfig };
