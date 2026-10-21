import { timingSafeEqual } from "node:crypto";
import { isProduction, validateRuntimeConfig } from "@/lib/config";
import { getIngestionHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const expected = process.env.INTERNAL_HEALTH_TOKEN;
  if (!expected) return !isProduction();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function GET(request: Request) {
  validateRuntimeConfig();
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const health = await getIngestionHealth();
    return Response.json(health, {
      status: health.status === "healthy" ? 200 : 503,
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: "health_check_failed",
      errorType: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "unknown"
    }));
    return Response.json({ status: "degraded", error: "Health data unavailable" }, { status: 503 });
  }
}
