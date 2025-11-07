MovieBox — Next.js + Firebase
================================

This is a Next.js (App Router) project bootstrapped with create-next-app and wired with Firebase for auth and data. The app is a base for a movie search and watch platform.

Project structure
-----------------

```
moviebox/
├─ src/
│  ├─ app/                  # Next.js App Router pages
│  │  ├─ layout.tsx
│  │  └─ page.tsx
│  ├─ lib/
│  │  └─ firebase.ts        # Firebase initialization (Auth, Firestore)
│  ├─ components/           # UI components (to be added)
│  └─ styles/               # Global/tailwind styles (via app/globals.css)
├─ public/                  # Static assets
├─ .env.local.example       # Env var template for Firebase config
├─ next.config.ts
├─ tailwind/postcss configs
├─ package.json
```

Getting started
---------------

1) Install dependencies

```powershell
npm install
```

2) Configure Firebase

- Copy `.env.local.example` to `.env.local` and fill in your Firebase project keys.
- Keys are exposed as NEXT_PUBLIC_* and safe for client usage.

```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
# Optional
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=...
```

3) Run the dev server

```powershell
npm run dev
```

Open http://localhost:3000 to view the app.

Firebase usage
--------------

Import initialized SDKs from `src/lib/firebase`:

```ts
import { auth, db, getAnalyticsIfAvailable } from '@/lib/firebase'
```

Notes
-----

- Analytics is loaded lazily on the client only when a measurement ID is provided.
- This template uses TypeScript, Tailwind, ESLint, and the App Router with `src/` directory.

Admin login setup
-----------------

- Ensure you enable a sign-in provider in your Firebase project (Google is recommended for admins):
	1) Firebase Console → Build → Authentication → Sign-in method
	2) Enable Google (or your preferred provider)
	3) Add `localhost` to Authorized domains (during local dev)
- Define admin emails (comma-separated) in `.env.local`:

```env
NEXT_PUBLIC_ADMIN_EMAILS=admin1@example.com,admin2@example.com
```

Flow
- Go to `/user` and click the “Admin” button.
- If not signed in, a Google popup will appear.
- After sign-in, if your email matches the admin list, you’ll be redirected to `/admin`.
