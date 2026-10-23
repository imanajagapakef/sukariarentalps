import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonRateLimited } from "@/lib/api/response";
import { rateLimit } from "@/lib/rate-limit";

const vitalsSchema = z
  .object({
    metric: z.enum(["LCP", "INP", "CLS", "FCP", "TTFB"]),
    value: z.number().finite(),
    rating: z.string().max(20).optional(),
    path: z.string().max(300).optional(),
  })
  .strict();

/**
 * Collects Core Web Vitals beacons from the browser. Anonymous by design:
 * the row is a metric sample, not user data. Rate-limit at the edge before
 * real traffic (same note as /api/feedback).
 */
export async function POST(request: NextRequest) {
  const limit = rateLimit("vitals", request);
  if (!limit.allowed) return jsonRateLimited(limit.retryAfterSeconds);

  const parsed = vitalsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const db = createAdminClient();
  const { error } = await db.from("web_vitals").insert({
    metric: parsed.data.metric,
    value: parsed.data.value,
    rating: parsed.data.rating ?? null,
    path: parsed.data.path ?? null,
  });

  return NextResponse.json({ ok: !error }, { status: error ? 500 : 202 });
}