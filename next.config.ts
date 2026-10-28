import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The microphone stays blocked (Permissions-Policy) unless voice tutoring is activated, or the labelled
// developer fixture or the local AI preview runs in development. Same rule as microphoneAllowed() in src/tutor/server/activation.ts.
function microphoneAllowed(): boolean {
  const env = process.env;
  if (env.NOESIS_TUTOR_FIXTURES === "1" && env.NODE_ENV === "development") return true;
  // local AI preview with OpenAI voice: development only, key present in .env.local (D-083)
  if (env.NODE_ENV === "development" && env.STUDENT_AI_ENABLED !== "false" && env.STUDENT_AI_VOICE !== "false"
    && !!env.OPENAI_API_KEY?.trim() && (!env.STUDENT_AI_PROVIDER || env.STUDENT_AI_PROVIDER === "openai")) return true;
  try {
    const rec = JSON.parse(readFileSync(join(process.cwd(), "config", "student-ai.json"), "utf8")) as Record<string, unknown>;
    const filled = (k: string) => typeof rec[k] === "string" && (rec[k] as string).trim().length > 0;
    return env.STUDENT_AI_ENABLED === "true" && env.STUDENT_AI_VOICE === "true" && rec.voice === true && filled("provider") && filled("providerDecision") && filled("privacyReview");
  } catch {
    return false;
  }
}

const securityHeaders = [
  // Student runtime talks to no AI service (docs/01, docs/09). The only third parties are Firebase Auth and
  // Firestore, used only after a student chooses to sign in for cloud backup (D-086).
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Firebase sign-in (optional cloud backup, D-086) loads Google's sign-in helper and its iframe
      "script-src 'self' 'unsafe-inline' https://apis.google.com" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      // only the Firebase Auth and Firestore hosts are added (D-086); no AI host is ever allowed here
      "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com" + (process.env.NODE_ENV === "development" ? " ws:" : ""),
      "frame-src https://noesis-f3903.firebaseapp.com https://accounts.google.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: `microphone=${microphoneAllowed() ? "(self)" : "()"}, camera=(), geolocation=()` },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "10.18.83.66"],
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
