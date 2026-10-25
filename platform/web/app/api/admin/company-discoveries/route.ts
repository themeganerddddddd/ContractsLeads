import { z } from "zod";

import { validateRuntimeConfig } from "@/lib/config";
import { internalRequestAuthorized } from "@/lib/internal-auth";
import { updateCompanyDiscovery } from "@/lib/tracking";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  discoveryId: z.string().uuid(),
  status: z.enum(["under_review", "dismissed"]),
  actor: z.string().trim().min(1).max(120),
});

export async function PATCH(request: Request) {
  validateRuntimeConfig();
  if (!internalRequestAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid discovery update" }, { status: 400 });
  }
  try {
    return Response.json(await updateCompanyDiscovery(parsed.data));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to update discovery" },
      { status: 400 },
    );
  }
}
