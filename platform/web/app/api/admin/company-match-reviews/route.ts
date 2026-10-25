import { z } from "zod";

import { validateRuntimeConfig } from "@/lib/config";
import { internalRequestAuthorized } from "@/lib/internal-auth";
import { decideMatchReview } from "@/lib/tracking";

export const dynamic = "force-dynamic";

const decisionSchema = z.object({
  reviewId: z.string().uuid(),
  decision: z.enum(["approved", "rejected", "pending"]),
  actor: z.string().trim().min(1).max(120),
});

export async function PATCH(request: Request) {
  validateRuntimeConfig();
  if (!internalRequestAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = decisionSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Invalid review action" }, { status: 400 });
  try {
    return Response.json(await decideMatchReview(parsed.data));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update review" }, { status: 400 });
  }
}
