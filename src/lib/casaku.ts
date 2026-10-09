import crypto from "crypto";

const BASE = "https://api.casaku.id";

function licenseKey(): string {
  const key = process.env.CASAKU_LICENSE_KEY;
  if (!key) throw new Error("CASAKU_LICENSE_KEY belum diisi");
  return key;
}

function qrId(): string {
  const id = process.env.CASAKU_QR_ID;
  if (!id) throw new Error("CASAKU_QR_ID belum diisi");
  return id;
}

function packageIds(): string[] {
  const raw = process.env.CASAKU_PACKAGE_IDS ?? "id.dana";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export type CasakuQrisResult = {
  transactionId: string;
  qr_string: string;
  totalAmount: number;
  originalAmount?: number;
  uniqueNominal?: number;
  expiredAt?: string;
};

export async function generateQrisV2(opts: {
  amount: number;
  expiredInMinutes?: number;
  prefix?: string;
  paymentMethod?: "qris" | "ewallet";
  qrType?: "dynamic" | "static";
}): Promise<CasakuQrisResult> {
  const res = await fetch(`${BASE}/api/generate/v2/qris`, {
    method: "POST",
    headers: {
      "x-license-key": licenseKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      qr_id: qrId(),
      amount: opts.amount,
      useUniqueCode: true,
      packageIds: packageIds(),
      expiredInMinutes: opts.expiredInMinutes ?? 15,
      qrType: opts.qrType ?? "dynamic",
      paymentMethod: opts.paymentMethod ?? "qris",
      useQris: true,
      prefix: opts.prefix ?? "CSK",
    }),
  });

  const body = (await res.json().catch(() => null)) as { status?: number; message?: string; data?: CasakuQrisResult } | null;
  if (!res.ok || !body?.data?.transactionId) {
    throw new Error(`Casaku generate gagal (${res.status}): ${body?.message ?? res.statusText}`);
  }
  return body.data;
}

export async function checkStatus(transactionId: string): Promise<{ status: string; paidAt?: string }> {
  const res = await fetch(`${BASE}/api/generate/check-status`, {
    method: "POST",
    headers: {
      "x-license-key": licenseKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ transactionId }),
  });
  const body = (await res.json().catch(() => null)) as { status?: number; data?: { status: string; paidAt?: string } } | null;
  if (!res.ok || !body?.data?.status) {
    throw new Error(`Casaku check gagal (${res.status})`);
  }
  return body.data;
}

export function verifyCasakuWebhook(rawBody: string, signature: string | null): boolean {
  const secret = process.env.CASAKU_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  try {
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
