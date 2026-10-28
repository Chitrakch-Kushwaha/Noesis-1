// POST /api/tutor/turn — answers 404 unless the feature is active (docs/09).
import { handleTurn } from "@/src/tutor/server/handlers";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleTurn(request);
}
