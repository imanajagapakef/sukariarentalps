import { createHash, randomBytes } from "node:crypto";
import type { NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * Identitas voter anonim dari server (bukan localStorage).
 * Cookie httpOnly berisi nilai acak; `voter_ref` = sha256(cookie).
 */
export const VOTER_COOKIE = "sr_voter";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function getOrCreateVoter(res: NextResponse): Promise<string> {
  const jar = await cookies();
  let raw = jar.get(VOTER_COOKIE)?.value;
  if (!raw) {
    raw = randomBytes(24).toString("base64url");
    res.cookies.set({
      name: VOTER_COOKIE,
      value: raw,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  return sha256(raw);
}
