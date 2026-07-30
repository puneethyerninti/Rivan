# Rivan Realty

Production web and Android app for Rivan Realty property discovery, customer bookings, scheduled visits, Partner CRM operations, and Admin management.

The project is web-first and uses the same React/Vite frontend for the public website, PWA-style web app, and Capacitor Android APK.

## Table Of Contents

- [Overview](#overview)
- [Core Features](#core-features)
- [Architecture](#architecture)
- [Repository Structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Local Development](#local-development)
- [Android APK Build](#android-apk-build)
- [Deployment](#deployment)
- [Testing](#testing)
- [Operational Notes](#operational-notes)
- [Security Guidelines](#security-guidelines)
- [Troubleshooting](#troubleshooting)

## Overview

Rivan Realty supports three production roles:

- Customer: browse properties, schedule visits, submit bookings, view documents, manage profile/settings, and receive notifications.
- Partner: manage assigned properties, leads, visits, bookings, tasks, customer follow-ups, profile, and notifications.
- Admin: approve Partners, manage users/properties/plots/bookings/visits/support/settings/audit logs, and monitor CRM metrics.

Current production domains:

- Web app: `https://www.rivanrealty.com`
- Backend API: `https://rivan.onrender.com`
- Firebase project: `rivan-auth-live`

## Core Features

- Firebase phone OTP authentication for Customer, Partner, and Admin login.
- FastAPI backend with JWT access/refresh sessions.
- MongoDB as the production source of truth.
- Real-time updates through `/ws/live` with automatic polling fallback.
- Customer property browsing, visit scheduling, booking requests, profile, notifications, and documents.
- Partner dashboard with live CRM KPIs, assigned inventory, site visits, bookings, leads, tasks, notifications, and profile persistence.
- Admin dashboard with Partner approvals, user management, property/plot management, bookings, visits, support, notifications, audit logs, and settings.
- Firebase Cloud Messaging support for Android push notifications.
- Capacitor Android app using the live web origin.

## Architecture

```text
Customer / Partner / Admin
        |
        v
React + Vite frontend
        |
        | HTTPS API + WebSocket
        v
FastAPI backend on Render
        |
        v
MongoDB Atlas

Firebase Auth verifies phone OTP.
Firebase Cloud Messaging sends Android push notifications.
Capacitor packages the web app for Android.
```

## Repository Structure

```text
.
|-- backend/
|   |-- server.py              # FastAPI application and API routes
|   |-- auth_service.py        # JWT, Firebase token verification, auth helpers
|   |-- requirements.txt       # Backend Python dependencies
|   `-- tests/                 # Backend tests
|-- frontend/
|   |-- src/                   # React application
|   |-- public/                # Static assets, logos, manifest, privacy page
|   |-- android/               # Active Capacitor Android project
|   |-- package.json           # Frontend scripts/dependencies
|   `-- capacitor.config.ts    # Capacitor app config
|-- render.yaml                # Render backend deployment config
|-- vercel.json                # Root Vercel routing config
`-- PLAY_STORE_RELEASE_CHECKLIST.md
```

Important: `frontend/android` is the active Android project. The root-level `android/` folder is legacy and should not be used for release builds.

## Prerequisites

- Node.js 20 or newer
- npm
- Python 3.11 or newer
- Android Studio with Android SDK and JDK support
- MongoDB Atlas database
- Firebase project with Phone Authentication enabled
- Render account for backend hosting
- Vercel account for frontend hosting

## Environment Configuration

Create environment files from the examples:

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```

### Backend Variables

Required for production:

```text
MONGO_URL=
DB_NAME=rivaan
JWT_SECRET=
FIREBASE_PROJECT_ID=rivan-auth-live
CORS_ORIGINS=https://rivanrealty.com,https://www.rivanrealty.com,https://rivan.onrender.com
COOKIE_SECURE=true
COOKIE_SAMESITE=none
```

Required for Android push notifications:

```text
FIREBASE_SERVICE_ACCOUNT_JSON=
```

Paste the full Firebase service account JSON object as the value in Render. Do not commit this value to Git.

Optional backend tuning:

```text
MONGO_SERVER_SELECTION_TIMEOUT_MS=15000
MONGO_CONNECT_TIMEOUT_MS=15000
MONGO_SOCKET_TIMEOUT_MS=20000
DB_AVAILABILITY_TIMEOUT_SECONDS=10
DB_AVAILABILITY_TTL_SECONDS=10
FEATURED_PROPERTIES_CACHE_TTL_SECONDS=90
```

Production safety defaults:

```text
ALLOW_DEV_OTP=false
ALLOW_LOCAL_AUTH_FALLBACK=false
ENABLE_DEMO_DATA=false
```

### Frontend Variables

```text
EXPO_PUBLIC_BACKEND_URL=https://rivan.onrender.com
VITE_ENABLE_WEBSOCKETS=true
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=rivan-auth-live.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=rivan-auth-live
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
VITE_ENABLE_NATIVE_PHONE_AUTH=false
```

For sideloaded APKs, `VITE_ENABLE_NATIVE_PHONE_AUTH=false` is intentional. The APK loads the live web origin so Firebase web OTP can use authorized domains.

## Local Development

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn server:app --host 127.0.0.1 --port 8000
```

Backend health checks:

```text
GET /api/health
GET /api/ready
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Default local frontend:

```text
http://127.0.0.1:8082
```

Production build:

```powershell
cd frontend
npm run build
```

## Android APK Build

Active Android package:

```text
com.rivan.app
```

Build a release APK for direct installation:

```powershell
cd frontend
npm run android:apk
```

APK output:

```text
frontend/android/app/build/outputs/apk/release/app-release.apk
```

Build a debug APK:

```powershell
cd frontend
npm run android:debug
```

Debug APK output:

```text
frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

Open Android Studio:

```powershell
cd frontend
npm run android:open
```

## Deployment

### Backend On Render

The backend is configured by `render.yaml`.

Production deploy checklist:

- Add all required backend environment variables in Render.
- Ensure `FIREBASE_SERVICE_ACCOUNT_JSON` is added only in Render secrets.
- Confirm `CORS_ORIGINS` includes `https://rivanrealty.com` and `https://www.rivanrealty.com`.
- Confirm `/api/ready` returns ready before relying on the deployment.
- Confirm `/api/health` reports Mongo, Firebase project, live updates, and push status.

### Frontend On Vercel

The frontend app is in `frontend/`.

Production deploy checklist:

- Add frontend environment variables in Vercel.
- Confirm Firebase Authorized Domains include:
  - `rivanrealty.com`
  - `www.rivanrealty.com`
  - `rivan-auth-live.firebaseapp.com`
- Confirm the latest deployment serves the newest hashed JS bundle after release.
- Hard refresh after deploy if an old PWA/browser cache was used.

## Testing

### Backend Tests

```powershell
cd backend
pytest
```

### Frontend Build Test

```powershell
cd frontend
npm run build
```

### Production Smoke Tests

Run the public readiness and WebSocket check:

```powershell
npm run verify:realtime
```

Run the broader production workflow check:

```powershell
npm run verify:production
```

To verify authenticated Customer, Partner, or Admin data, pass a live JWT access token from the browser session:

```powershell
$env:ACCESS_TOKEN="paste-access-token-here"
$env:EXPECTED_ROLE="agent"
npm run verify:production
```

Use `EXPECTED_ROLE=admin` for Admin sessions and `EXPECTED_ROLE=customer` for Customer sessions. The workflow smoke test is read-only by default and checks role dashboards, notifications, push status, readiness, and the payments-on-hold boundary.

If a local Windows machine reports `UNABLE_TO_VERIFY_LEAF_SIGNATURE` while the site works normally in Chrome, first update local certificates and retry. For a temporary local-only smoke run, use:

```powershell
$env:ALLOW_INSECURE_TLS="true"
npm run verify:production
```

Do not use `ALLOW_INSECURE_TLS=true` in production hosting.

### Critical Smoke Tests

- Customer OTP login, session restore, logout.
- Partner OTP login with approved number.
- Admin OTP login with authorized admin number.
- Customer schedules a visit from property flow.
- Customer submits booking.
- Partner dashboard shows assigned visits/bookings/leads/properties.
- Partner profile saves a real name and persists after refresh/re-login.
- Admin can approve/reject/suspend Partner applications.
- Admin can assign visits to Partners and update visit status.
- Admin dashboard metrics update after bookings/visits.
- Notifications show in-app and, on Android with permission granted, as system push notifications.
- WebSocket failure falls back to API refresh without blocking user actions.

## Operational Notes

- Payments are intentionally display-only for now. Do not enable real payment collection until the payment gateway and compliance work are approved.
- Render free tier can cold-start. A slow first request usually indicates backend wake-up, not necessarily MongoDB failure.
- WebSocket support depends on Render service availability and correct `/ws/live` routing.
- Firebase OTP delays, temporary blocks, or unusual activity warnings are controlled by Firebase abuse protection and cannot be bypassed safely in app code.
- Chrome Safe Browsing or lookalike-domain warnings must be resolved through Google Search Console / Safe Browsing review, not code changes.

## Security Guidelines

- Never commit `.env` files, Firebase service account JSON, upload keys, keystores, private keys, MongoDB URIs, JWT secrets, or API secrets.
- Store Firebase Admin SDK JSON only in Render environment variables.
- Store Android signing keys outside the repository.
- Keep `ALLOW_DEV_OTP=false`, `ALLOW_LOCAL_AUTH_FALLBACK=false`, and `ENABLE_DEMO_DATA=false` in production.
- Rotate credentials immediately if any secret is accidentally shared or committed.
- Use MongoDB Atlas network rules and credentials with least privilege.

## Troubleshooting

### OTP Shows reCAPTCHA Or Credential Errors

- Confirm Firebase Phone Authentication is enabled.
- Confirm Firebase Authorized Domains include the live domains.
- Confirm the APK uses the latest build.
- If Firebase temporarily blocks a number/device, wait before retrying or test with a different approved phone number.

### Partner Name Shows As Agent Or Partner

- Save the real Partner name once after the latest deployment.
- Refresh or re-login.
- If the issue persists, inspect MongoDB `users` for the phone number and ensure the `name` field is not still stored as `Agent` or `Partner`.

### Backend Returns 504 Or Failed To Fetch

- Check Render service status and logs.
- Open `/api/health` and `/api/ready`.
- Verify MongoDB Atlas connectivity and allowed network access.
- Consider an always-on Render plan if cold starts are affecting real users.

### Android Push Notifications Do Not Arrive

- Confirm notification permission is allowed on the phone.
- Confirm `FIREBASE_SERVICE_ACCOUNT_JSON` is present in Render.
- Confirm `/api/health` reports push notifications enabled.
- Reinstall the latest APK so the device registers a fresh FCM token.

## License

Proprietary. All rights reserved by Rivan Realty.
