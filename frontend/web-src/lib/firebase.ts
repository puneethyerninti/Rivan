import { getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  RecaptchaVerifier,
  setPersistence,
  signInWithPhoneNumber,
  signInWithPopup,
  type Auth,
} from "firebase/auth";

function env(name: string) {
  return String(import.meta.env[name] || "").trim().replace(/^['"]|['"]$/g, "");
}

const firebaseConfig = {
  apiKey: env("EXPO_PUBLIC_FIREBASE_API_KEY"),
  authDomain: env("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: env("EXPO_PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: env("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: env("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: env("EXPO_PUBLIC_FIREBASE_APP_ID"),
};

export const hasFirebaseConfig = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);

export const firebaseConfigError = hasFirebaseConfig
  ? ""
  : "Firebase configuration is missing. Set the EXPO_PUBLIC_FIREBASE_* environment variables.";

const firebaseApp = hasFirebaseConfig
  ? getApps().length
    ? getApps()[0]
    : initializeApp(firebaseConfig)
  : null;

let authInstance: Auth | null = null;
const recaptchaVerifiers = new Map<string, RecaptchaVerifier>();

export async function getFirebaseAuth() {
  if (!firebaseApp || !hasFirebaseConfig) {
    throw new Error(firebaseConfigError || "Firebase configuration is unavailable.");
  }
  if (authInstance) return authInstance;
  authInstance = getAuth(firebaseApp);
  await setPersistence(authInstance, browserLocalPersistence);
  return authInstance;
}

export async function createRecaptchaVerifier(containerId: string, normal = false) {
  const existing = recaptchaVerifiers.get(containerId);
  if (existing) return existing;
  const auth = await getFirebaseAuth();
  auth.languageCode = "en";
  const verifier = new RecaptchaVerifier(auth, containerId, {
    size: normal ? "normal" : "invisible",
  });
  recaptchaVerifiers.set(containerId, verifier);
  return verifier;
}

export { GoogleAuthProvider, signInWithPhoneNumber, signInWithPopup };
