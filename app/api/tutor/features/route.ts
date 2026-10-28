// GET /api/tutor/features — which tutor mode is active (booleans only). See docs/09.
import { handleFeatures } from "@/src/tutor/server/handlers";

export const dynamic = "force-dynamic";

export function GET() {
  return handleFeatures();
}
