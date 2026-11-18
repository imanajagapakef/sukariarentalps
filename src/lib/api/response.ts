import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { AuthError } from "@/lib/authz";

export function jsonError(message: string, status: number, code?: string, correlationId?: string) {
  return NextResponse.json(
    { error: { message, code, ...(correlationId ? { correlationId } : {}) } },
    { status, ...(correlationId ? { headers: { "x-correlation-id": correlationId } } : {}) },
  );
}

/** Map a thrown error to an HTTP response, treating domain errors as 4xx. */
export function handleRouteError(error: unknown) {
  if (error instanceof AuthError) return jsonError(error.message, error.status);
  if (error instanceof ZodError) {
    const issues = error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    const first = issues[0];
    const message = first
      ? first.path
        ? `${first.path}: ${first.message}`
        : first.message
      : "Data yang dikirim tidak valid";
    return NextResponse.json(
      { error: { message, code: "VALIDATION_ERROR", issues } },
      { status: 422 },
    );
  }
  if (error instanceof Error) {
    const isClient =
      "isClientError" in error && (error as { isClientError?: boolean }).isClientError;
    const code = "code" in error ? ((error as { code?: string }).code ?? undefined) : undefined;

    if (isClient) return jsonError(error.message, 400, code);
    // 5xx: pesan mentah (termasuk config seperti "QRIS_STATIC_STRING belum diisi")
    // tidak boleh bocor ke endpoint publik. Detail hanya di log server.
    const correlationId = randomUUID();
    console.error(`[route:${correlationId}]`, error);
    return jsonError("Terjadi kesalahan. Coba lagi nanti.", 500, "INTERNAL_ERROR", correlationId);
  }
  return jsonError("Terjadi kesalahan tak terduga", 500);
}

/** 429 with the standard Retry-After header. */
export function jsonRateLimited(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      error: {
        message: `Terlalu banyak percobaan. Coba lagi dalam ${retryAfterSeconds} detik.`,
        code: "RATE_LIMITED",
      },
    },
    { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil(retryAfterSeconds))) } },
  );
}