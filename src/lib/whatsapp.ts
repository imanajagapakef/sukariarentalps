/**
 * WhatsApp notifications.
 *
 * The database queues a row per event (notifications, template + payload) and this
 * module is the only thing that actually talks to a provider. That split is deliberate:
 * sending needs an API key, a network call and a timeout, none of which belong inside
 * the transaction that registers someone — a provider that is down must not roll back a
 * seat, and a failed message must be retryable from the admin panel rather than lost.
 *
 * Fonnte is the default and Wablas is supported because both speak a one-endpoint HTTP
 * shape; nothing else in the app depends on the choice. With no key configured the
 * dispatcher marks rows SKIPPED and carries on — a deployment without a provider should
 * still register people, it just should not pretend a message went out.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { rp } from "@/lib/format";

export type WaTemplate =
  | "TOURNAMENT_REGISTERED_FREE"
  | "TOURNAMENT_REGISTERED_PENDING_PAYMENT"
  | "TOURNAMENT_PAID"
  | "TOURNAMENT_EXPIRED"
  | "TOURNAMENT_CANCELLED"
  | "TOURNAMENT_REMINDER"
  | "TOURNAMENT_BRACKET_READY";

export type WaMessage = { to: string; body: string };

/** Indonesian, plain, and short enough that a phone shows it without scrolling. */
const MESSAGES: Record<WaTemplate, (p: Record<string, string | number>) => string> = {
  TOURNAMENT_REGISTERED_FREE: (p) =>
    `Halo ${p.name}! Registrasi kamu untuk ${p.tournament_title} sudah kami catat.\n\n` +
    `Kode tiket: ${p.registration_code}\nMulai: ${p.starts_at}\nTempat: ${p.branch_name}\n` +
    `HTM: GRATIS\n\nSimpan tiketnya, cek turnout di ${p.site}`,

  TOURNAMENT_REGISTERED_PENDING_PAYMENT: (p) =>
    `Halo ${p.name}! Registrasi ${p.tournament_title} sudah masuk antrean.\n\n` +
    `Kode tiket: ${p.registration_code}\nHTM: ${p.fee}\nBayar sebelum: ${p.deadline}\n\n` +
    `Bayar di ${p.site}/turnamen/tiket/${p.registration_code} — kodenya berlaku buat bayar QRIS atau di kasir.`,

  TOURNAMENT_PAID: (p) =>
    `Pembayaran ${p.fee} untuk ${p.tournament_title} sudah kami terima, ${p.name}.\n\n` +
    `Kode tiket: ${p.registration_code}\nMulai: ${p.starts_at}\nTempat: ${p.branch_name}\n\n` +
    `Datang 15 menit lebih awal biar round pertamanya nggak telat.`,

  TOURNAMENT_EXPIRED: (p) =>
    `Pendaftaran ${p.tournament_title} belum dibayar dalam batas waktu, jadi slot-nya kami lepaskan.\n` +
    `Kalau mau ikut lagi dan masih ada kursi: ${p.site}/turnamen/${p.tournament_slug}`,

  TOURNAMENT_CANCELLED: (p) =>
    `Pendaftaran ${p.name} di ${p.tournament_title} dibatalkan (${p.reason ?? "tanpa alasan"}).` +
    (p.refund ? ` Dana ${p.refund} dikembalikan lewat kasir.` : ""),

  TOURNAMENT_REMINDER: (p) =>
    `Besok main! ${p.tournament_title} dimulai ${p.starts_at} di ${p.branch_name}.\n` +
    `Kode tiket: ${p.registration_code}\n` +
    (p.seed ? `Kamu seed ${p.seed}.` : "UrutanSeat kamu diacak saat bracket keluar."),

  TOURNAMENT_BRACKET_READY: (p) =>
    `Bracket ${p.tournament_title} sudah keluar!\n${p.seed ? `Kamu seed ${p.seed}.` : ""}\n` +
    `Ceklawanan kamu: ${p.site}/turnamen/${p.tournament_slug}`,
};

/** Public site origin, read per request like the ticket page's QR origin. */
async function siteOrigin(): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (url) return url.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export function renderMessage(
  template: WaTemplate,
  payload: Record<string, string | number>,
): string {
  const build = MESSAGES[template];
  return build ? build(payload) : String(payload.message ?? "");
}

/**
 * wa.me deep link, used by the ticket's "Bagikan" button.
 *
 * encodeURIComponent matters twice over: the phone number has to be country coded and
 * the body contains newlines, both of which a raw href mangles into a broken link.
 */
export function waShareHref(phone: string, body: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  const cc = digits.startsWith("62") ? digits : `62${digits.replace(/^0/, "")}`;
  return `https://wa.me/${cc}?text=${encodeURIComponent(body)}`;
}

type Provider = "fonnte" | "wablas" | null;

function provider(): Provider {
  if (process.env.WA_API_KEY && process.env.WA_PROVIDER === "wablas") return "wablas";
  if (process.env.WA_API_KEY) return "fonnte";
  return null;
}

async function sendViaProvider(to: string, body: string): Promise<void> {
  const key = process.env.WA_API_KEY;
  const which = provider();

  if (!key || !which) throw new Error("WA_API_KEY belum diisi");

  const res =
    which === "fonnte"
      ? await fetch("https://api.fonnte.com/send", {
          method: "POST",
          headers: { Authorization: key, "Content-Type": "application/json" },
          body: JSON.stringify({ target: to, message: body, countryCode: "62" }),
        })
      : await fetch("https://console.wablas.com/api/send-message", {
          method: "POST",
          headers: { Authorization: key, "Content-Type": "application/json" },
          body: JSON.stringify({ phone: to.startsWith("62") ? to : `62${to.replace(/^0/, "")}`, message: body }),
        });

  if (!res.ok) throw new Error(`${which} HTTP ${res.status}`);
  const json = (await res.json().catch(() => null)) as { status?: boolean; message?: string } | null;
  // Fonnte answers 200 with status:false when the number is not on WhatsApp.
  if (json?.status === false) throw new Error(json.message ?? "provider menolak nomor");
}

/**
 * Drain the queue for one recipient.
 *
 * Called right after the event that queued the message, and again from the admin
 * panel's "kirim ulang". Returns how many went out so the caller can log it, and never
 * throws: a notification failure must not undo the registration that caused it.
 */
export async function dispatchPendingFor(recipientRef: string): Promise<{ sent: number; failed: number }> {
  const db = createAdminClient();
  const { data } = await db
    .from("notifications")
    .select("id, template, payload")
    .eq("recipient_ref", recipientRef)
    .eq("channel", "WHATSAPP")
    .eq("status", "PENDING")
    .order("id", { ascending: true })
    .limit(5);

  if (!data || data.length === 0) return { sent: 0, failed: 0 };
  if (!provider()) {
    // Not an error: a fresh deployment has no provider yet. Marking them keeps the
    // admin panel honest about what actually went out instead of showing a false 0.
    await db
      .from("notifications")
      .update({ status: "FAILED", error: "WA_API_KEY belum diisi" })
      .in(
        "id",
        data.map((n) => n.id),
      );
    return { sent: 0, failed: data.length };
  }

  const site = await siteOrigin();
  let sent = 0;
  let failed = 0;

  for (const row of data) {
    const body = renderMessage(row.template as WaTemplate, {
      ...(row.payload as Record<string, string | number>),
      site,
    });
    try {
      await sendViaProvider(recipientRef, body);
      await db
        .from("notifications")
        .update({ status: "SENT", sent_at: new Date().toISOString(), error: null })
        .eq("id", row.id);
      sent += 1;
    } catch (error) {
      // Keep the row PENDING when the failure is transient so a retry picks it up; a
      // bad number will simply fail again, which is how it gets noticed.
      const message = error instanceof Error ? error.message : "gagal kirim";
      await db.from("notifications").update({ error: message }).eq("id", row.id);
      failed += 1;
    }
  }

  return { sent, failed };
}

/** The copy the ticket's share button offers, same wording as the WA message. */
export async function ticketShareBody(args: {
  name: string;
  code: string;
  title: string;
  startsAt: string;
  branch: string;
  free: boolean;
  fee: number;
}): Promise<string> {
  return renderMessage(args.free ? "TOURNAMENT_REGISTERED_FREE" : "TOURNAMENT_PAID", {
    name: args.name,
    registration_code: args.code,
    tournament_title: args.title,
    starts_at: args.startsAt,
    branch_name: args.branch,
    fee: rp(args.fee),
    site: await siteOrigin(),
  });
}