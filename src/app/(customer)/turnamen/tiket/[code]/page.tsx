import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRegistrationByCode } from "@/services/tournament.service";
import { hasTournamentAccess } from "@/lib/tournament-access";
import { getTournamentBySlug } from "@/lib/tournaments";
import { TournamentPaymentBox } from "@/components/tournament-payment-box";
import { REGISTRATION_STATUS_LABEL } from "@/lib/tournament-rules";
import { fmtDateTime, rp } from "@/lib/format";
import { ticketShareBody, waShareHref } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/** Absolute origin for the QR, read per request like the booking ticket does. */
async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * A player's ticket.
 *
 * It exists from the moment of registration, whether or not the fee is paid — the code
 * is what the counter checks, and the status line is what tells staff what to do. Paid
 * tickets get a share button that opens WhatsApp with the whole message written out,
 * because a tournament is something people tell their friends about.
 */
export default async function TournamentTicketPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  // The ticket renders the player's name and a share link that embeds their
  // phone, so the code alone must not grant access. Checked before any query:
  // a visitor without the cookie never reaches the database at all.
  if (!(await hasTournamentAccess(code))) {
    redirect(`/cek-turnamen?code=${encodeURIComponent(code)}`);
  }
  const db = createAdminClient();
  const registration = await getRegistrationByCode(db, code);
  if (!registration) notFound();

  const tournament = registration.tournaments;
  // The game name lives on the overview read (the same one the cards use), so the ticket
  // and the list cannot disagree about which game is being played.
  const overview = tournament ? await getTournamentBySlug(tournament.slug) : null;
  const origin = await siteOrigin();
  const ticketUrl = `${origin}/turnamen/tiket/${registration.registration_code}`;
  const qr = await QRCode.toDataURL(ticketUrl, { width: 480, margin: 1 });

  const share = await ticketShareBody({
    name: registration.name,
    code: registration.registration_code,
    title: tournament?.title ?? "Turnamen",
    startsAt: tournament ? fmtDateTime(tournament.starts_at) : "-",
    branch: registration.branch?.short_name ?? registration.branch?.name ?? "-",
    free: registration.fee_amount === 0,
    fee: registration.fee_amount,
  });

  const paid = registration.status === "PAID" || registration.status === "CHECKED_IN";
  const expired = registration.status === "EXPIRED";
  const cancelled = registration.status === "CANCELLED";

  return (
    <div className="mx-auto max-w-lg px-4 py-8 md:px-8">
      <Link href="/turnamen" className="text-sm text-muted-foreground hover:text-primary">
        ← Semua Turnamen
      </Link>

      <div className="mt-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Tiket Turnamen</p>
            <h1 className="font-display text-2xl uppercase">{tournament?.title ?? "-"}</h1>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${
              paid
                ? "bg-primary/15 text-primary"
                : expired || cancelled
                  ? "bg-danger/15 text-danger"
                  : "bg-warning/15 text-warning"
            }`}
          >
            {REGISTRATION_STATUS_LABEL[registration.status]}
          </span>
        </div>

        <div className="mt-4 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt={`QR tiket ${registration.registration_code}`}
            className="w-56 shrink-0 rounded-lg bg-white p-2"
          />
        </div>

        <p className="mt-3 text-center font-display text-2xl tracking-widest">
          {registration.registration_code}
        </p>
        <p className="text-center text-xs text-muted-foreground">
          Tunjukkan kode ini ke kasir untuk check-in
        </p>

        <dl className="mt-5 space-y-2 text-sm">
          <Row label="Nama" value={registration.name} />
          <Row label="Mulai" value={tournament ? fmtDateTime(tournament.starts_at) : "-"} />
          <Row
            label="Tempat"
            value={registration.branch?.short_name ?? registration.branch?.name ?? "-"}
          />
          {registration.branch?.address && (
            <Row label="Alamat" value={registration.branch.address} />
          )}
          {overview?.game_name && <Row label="Game" value={overview.game_name} />}
          {registration.seed_number && (
            <Row label="Seed" value={`#${registration.seed_number}`} />
          )}
          <Row
            label="HTM"
            value={
              registration.fee_amount === 0
                ? "Gratis"
                : `${rp(registration.fee_amount)}${paid ? " · lunas" : ""}`
            }
          />
        </dl>

        {tournament?.prize && (
          <p className="mt-4 rounded-lg bg-surface-low p-3 text-sm">
            <span className="text-muted-foreground">Hadiah: </span>
            <span className="font-medium text-primary">{tournament.prize}</span>
          </p>
        )}

        <div className="mt-5 space-y-3">
          {registration.status === "WAITING_PAYMENT" && registration.fee_amount > 0 && (
            <TournamentPaymentBox
              code={registration.registration_code}
              amount={registration.fee_amount}
            />
          )}

          {expired && (
            <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">
              Batas pembayaran sudah lewat, jadi kursi ini dilepas. Kalau masih mau ikut,
              daftar lagi.
            </p>
          )}

          {paid && (
            <a
              href={waShareHref(registration.phone, share)}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg border border-primary px-3 py-2 text-center text-sm font-bold text-primary transition-colors hover:bg-primary/10"
            >
              Bagikan ke WhatsApp
            </a>
          )}

          {tournament && (
            <Link
              href={`/turnamen/${tournament.slug}`}
              className="block rounded-lg border border-border px-3 py-2 text-center text-sm transition-colors hover:border-primary hover:text-primary"
            >
              Lihat detail & bracket
            </Link>
          )}
        </div>
      </div>

      {tournament?.rules && (
        <div className="mt-4 rounded-xl border border-border bg-card p-5">
          <h2 className="font-display uppercase">Aturan main</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
            {tournament.rules}
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border pb-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}