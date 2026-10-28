// POST /api/tutor/transcribe — answers 404 unless the feature is active (docs/09).
import { handleTranscribe } from "@/src/tutor/server/handlers";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleTranscribe(request);
}
