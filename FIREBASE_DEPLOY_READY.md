# Firebase Deploy Checklist

## Frontend env

Set these in the deployed frontend environment:

```env
EXPO_PUBLIC_BACKEND_URL=https://your-backend-origin
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-google-web-client-id
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=your-google-android-client-id
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your-google-ios-client-id
EXPO_PUBLIC_FIREBASE_API_KEY=your-firebase-api-key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-firebase-project-id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
EXPO_PUBLIC_FIREBASE_APP_ID=your-firebase-app-id
EXPO_PUBLIC_FIREBASE_USE_TEST_PHONE_AUTH=false
```

## Backend env

Set these in the deployed backend environment:

```env
GOOGLE_WEB_CLIENT_ID=your-google-web-client-id
GOOGLE_ANDROID_CLIENT_ID=your-google-android-client-id
GOOGLE_IOS_CLIENT_ID=your-google-ios-client-id
GOOGLE_ALLOWED_CLIENT_IDS=optional-extra-client-ids-comma-separated
FIREBASE_PROJECT_ID=your-firebase-project-id
CORS_ORIGINS=https://your-frontend-origin,https://www.your-frontend-origin
```

## Firebase console

Enable these sign-in providers:

- Google
- Phone

Add these authorized domains:

- your deployed frontend domain
- any alternate production domain you use

For Google provider:

- use the same web client ID that you place in `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- create Android and iOS OAuth clients if you ship native builds

## Google Cloud console

Verify the OAuth app has:

- the production web origin in `Authorized JavaScript origins`
- the Firebase auth handler URL if Firebase asks for it
- matching Android and iOS client IDs for native builds

## Important behavior

- Hosted web Google login now uses Firebase popup auth, so it works from the homepage, login page, and property pages.
- Native Google login still uses Expo AuthSession and needs real Android and iOS client IDs.
- Real Firebase phone OTP is intended for the hosted web app in this codebase. Localhost should use Firebase test phone numbers only.
