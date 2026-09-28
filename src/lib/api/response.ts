import { NextResponse } from "next/server";
import { AuthError } from "@/lib/authz";

export function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ error: { message, code } }, { status });
}

/** Map a thrown error to an HTTP response, treating domain errors as 4xx. */
export function handleRouteError(error: unknown) {
  if (error instanceof AuthError) return jsonError(error.message, error.status);
  if (error instanceof Error) {
    const isClient =
      "isClientError" in error && (error as { isClientError?: boolean }).isClientError;
    const code = "code" in error ? ((error as { code?: string }).code ?? undefined) : undefined;

    if (isClient) return jsonError(error.message, 400, code);
    return jsonError(error.message, 500, code);
  }
  return jsonError("Terjadi kesalahan tak terduga", 500);
}