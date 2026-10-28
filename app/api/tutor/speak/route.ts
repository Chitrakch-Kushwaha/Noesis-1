// POST /api/tutor/speak — answers 404 unless the feature is active (docs/09).
import { handleSpeak } from "@/src/tutor/server/handlers";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleSpeak(request);
}
