import { createHash } from "node:crypto";

const BASE_URLS = {
  sandbox: "https://app.sandbox.midtrans.com",
  production: "https://app.midtrans.com",
} as const;

function serverKey(): string {
  const key = process.env.MIDTRANS_SERVER_KEY;
  if (!key) throw new Error("MIDTRANS_SERVER_KEY belum diisi");
  return key;
}

function baseUrl(): string {
  const env = process.env.MIDTRANS_ENVIRONMENT ?? "sandbox";
  return BASE_URLS[env === "production" ? "production" : "sandbox"];
}

export type SnapTransaction = {
  order_id: string;
  gross_amount: number;
  customer: { first_name: string; phone: string };
  description?: string;
};

export type SnapToken = {
  token: string;
  redirect_url: string;
};

/**
 * Create a Snap transaction and return the token the customer is redirected to.
 * ponytail: direct fetch instead of midtrans-client — Snap is one POST + one
 * SHA512 check; a dependency would only re-wrap those.
 */
export async function createSnapTransaction(t: SnapTransaction): Promise<SnapToken> {
  const res = await fetch(`${baseUrl()}/snap/v1/transactions`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${serverKey()}:`).toString("base64")}`,
    },
    body: JSON.stringify({
      transaction_details: { order_id: t.order_id, gross_amount: t.gross_amount },
      customer: { first_name: t.customer.first_name, phone: t.customer.phone },
      ...(t.description ? { item_details: [{ id: t.order_id, name: t.description, quantity: 1, price: t.gross_amount }] } : {}),
    }),
  });

  const body = (await res.json().catch(() => null)) as Partial<SnapToken> & { message?: string } | null;

  if (!res.ok || !body?.token || !body.redirect_url) {
    throw new Error(`Midtrans Snap gagal (${res.status}): ${body?.message ?? res.statusText}`);
  }

  return { token: body.token, redirect_url: body.redirect_url };
}

/** Midtrans server-to-server signature: SHA512(order_id + status_code + gross_amount + server_key). */
export function verifySignature(n: {
  order_id: string;
  status_code: string;
  gross_amount: string | number;
  signature_key?: string;
}): boolean {
  if (!n.signature_key) return false;
  const expected = createHash("sha512")
    .update(`${n.order_id}${n.status_code}${String(n.gross_amount)}${serverKey()}`)
    .digest("hex");
  return expected === n.signature_key;
}
