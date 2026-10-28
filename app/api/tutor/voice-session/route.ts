// POST /api/tutor/voice-session — answers 404 unless the feature is active (docs/09).
import { handleVoiceSession } from "@/src/tutor/server/handlers";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleVoiceSession(request);
}
