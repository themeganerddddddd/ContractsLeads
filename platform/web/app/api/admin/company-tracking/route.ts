import { z } from "zod";

import { validateRuntimeConfig } from "@/lib/config";
import { internalRequestAuthorized } from "@/lib/internal-auth";
import { createMonitorTarget, getAdminTrackingSnapshot, updateMonitorTarget } from "@/lib/tracking";

export const dynamic = "force-dynamic";

const sourceFlags = {
  monitorProcurement: z.boolean().optional(),
  monitorMovements: z.boolean().optional(),
  monitorPermits: z.boolean().optional(),
  monitorSec: z.boolean().optional(),
};

const createSchema = z.object({
  companyId: z.string().uuid(),
  reason: z.enum(["manually_added", "procurement_activity", "movement_signal", "permit_signal", "sec_signal", "saved_search_match", "analyst_review", "other"]).default("analyst_review"),
  priority: z.enum(["high", "normal", "low"]).default("normal"),
  actor: z.string().trim().min(1).max(120),
  ...sourceFlags,
});

const updateSchema = z.object({
  companyId: z.string().uuid(),
  status: z.enum(["active", "paused", "review_required", "archived"]).optional(),
  priority: z.enum(["high", "normal", "low"]).optional(),
  actor: z.string().trim().min(1).max(120),
  ...sourceFlags,
});

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: Request) {
  validateRuntimeConfig();
  if (!internalRequestAuthorized(request)) return unauthorized();
  const search = new URL(request.url).searchParams.get("q") || "";
  return Response.json(await getAdminTrackingSnapshot(search), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  validateRuntimeConfig();
  if (!internalRequestAuthorized(request)) return unauthorized();
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Invalid tracking request" }, { status: 400 });
  try {
    return Response.json(await createMonitorTarget(parsed.data), { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to create target" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  validateRuntimeConfig();
  if (!internalRequestAuthorized(request)) return unauthorized();
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Invalid tracking update" }, { status: 400 });
  try {
    return Response.json(await updateMonitorTarget(parsed.data));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update target" }, { status: 400 });
  }
}
