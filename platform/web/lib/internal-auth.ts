import { timingSafeEqual } from "node:crypto";

import { isProduction } from "@/lib/config";

export function internalRequestAuthorized(request: Request): boolean {
  const expected = process.env.INTERNAL_HEALTH_TOKEN;
  if (!expected) return !isProduction();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}
