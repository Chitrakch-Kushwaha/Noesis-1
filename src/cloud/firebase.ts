// Firebase for optional sign-in and cloud backup of progress (D-086). Nothing here runs until a student
// chooses "Sign in": the SDK is loaded on demand, so a student who never signs in sends nothing to Google.
//
// This web config is public by design: it identifies the project, it is not a secret. Access is
// controlled by Firestore security rules (firestore.rules: each user can read and write only their own
// document) and should be narrowed further with API key restrictions (allowed websites) in Google Cloud.
// No Analytics: the app is used by under-18 students and sends no tracking data (docs/10).
import type { FirebaseApp } from "firebase/app";

export const firebaseConfig = {
  apiKey: "AIzaSyBa25jnAEUr6TmnfNqq3qcaLfPSQfzIsfw",
  authDomain: "noesis-f3903.firebaseapp.com",
  projectId: "noesis-f3903",
  storageBucket: "noesis-f3903.firebasestorage.app",
  messagingSenderId: "830038009603",
  appId: "1:830038009603:web:6018b2f3ee828fc0acab36",
};

let app: Promise<FirebaseApp> | null = null;
export function firebaseApp(): Promise<FirebaseApp> {
  return (app ??= import("firebase/app").then(({ initializeApp, getApps }) => getApps()[0] ?? initializeApp(firebaseConfig)));
}
