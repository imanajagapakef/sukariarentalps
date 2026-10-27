import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  Clock,
  Hourglass,
  MessageCircle,
  Plus,
  Sparkles,
  Ticket,
  TriangleAlert,
  UserX,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getExtensionInfo } from "@/services/extension.service";
import { hasBookingAccess } from "@/lib/booking-access";
import { BookingStatusPill } from "@/components/status-pill";
import { Countdown, CopyCodeButton } from "@/components/ticket-actions";
import { LiveBooking } from "@/components/live-booking";
import { Button } from "@/components/ui/button";
import { fmtDateTime, fmtISODay, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const WA_NUMBER = "6281398765432";
const HOUR_MS = 3_600_000;
/** Berapa pilihan tambahan jam yang ditawarkan, paling banyak. */
const MAX_CHIPS = 3;
/** Sisa menit di bawah ini dianggap mendesak. */
const URGENT_MINUTES = 15;

type Tone = "success" | "warning" | "primary" | "danger" | "neutral";

const TONE_BOX: Record<Tone, string> = {
  success: "border-success/40 bg-success/10",
  warning: "border-warning/40 bg-warning/10",
  primary: "border-primary/40 bg-primary/10",
  danger: "border-danger/40 bg-danger/10",
  neutral: "border-border bg-card",
};
const TONE_TEXT: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  primary: "text-primary",
  danger: "text-danger",
  neutral: "text-muted-foreground",
};

/** Penjelasan per status yang tidak bisa diperpanjang: tanpa ini halaman terasa rusak, bukan "belum waktunya". */
const BLOCKED: Record<string, { icon: LucideIcon; tone: Tone; title: string; body: string; toTicket?: boolean }> = {
  WAITING_PAYMENT: {
    icon: Hourglass,
    tone: "warning",
    title: "Selesaikan pembayaran dulu",
    body: "Extension baru bisa diminta setelah booking terkonfirmasi. Buka tiket untuk menyelesaikan pembayaran.",
    toTicket: true,
  },
  COMPLETED: {
    icon: Sparkles,
    tone: "neutral",
    title: "Sesi sudah selesai",
    body: "Makasih sudah main! Mau lanjut? Buat booking baru.",
  },
  READY: {
    icon: Sparkles,
    tone: "neutral",
    title: "Sesi sudah selesai",
    body: "Makasih sudah main! Mau lanjut? Buat booking baru.",
  },
  CANCELLED: {
    icon: Ban,
    tone: "danger",
    title: "Booking dibatalkan",
    body: "Booking yang dibatalkan tidak bisa diperpanjang. Kamu bisa membuat booking baru kapan saja.",
  },
  EXPIRED: {
    icon: Hourglass,
    tone: "danger",
    title: "Batas pembayaran terlewat",
    body: "Booking ini sudah kedaluwarsa, jadi tidak bisa diperpanjang. Buat booking baru untuk main.",
  },
  NO_SHOW: {
    icon: UserX,
    tone: "danger",
    title: "Tercatat tidak hadir",
    body: "Sesi ini lewat tanpa check-in, jadi tidak bisa diperpanjang. Kalau ini keliru, hubungi kasir.",
  },
};

const FALLBACK_BLOCKED = {
  icon: Clock,
  tone: "neutral" as Tone,
  title: "Extension belum tersedia",
  body: "Extension hanya bisa saat sesi berlangsung (status Sedang Main / Terkonfirmasi).",
  toTicket: true,
};

const dayOf = (ms: number) => fmtISODay(new Date(ms));
/** Jam saja kalau masih hari yang sama dengan `ref`, tanggal lengkap kalau tidak. */
const stamp = (ms: number, ref: number) =>
  dayOf(ms) === dayOf(ref) ? fmtTime(new Date(ms).toISOString()) : fmtDateTime(new Date(ms).toISOString());

const STEPS = [
  "Sebutkan kode booking dan durasi tambahan ke kasir (atau kirim lewat WhatsApp).",
  "Kasir mengecek slot dan total di tempat.",
  "Setelah disetujui, kamu bisa lanjut main.",
];

export default async function ExtensionPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code: rawCode } = await searchParams;
  const code = rawCode?.trim();

  if (!code) {
    return (
      <div className="relative isolate overflow-hidden">
        <div aria-hidden className="absolute -right-24 -top-28 -z-10 size-96 rounded-full bg-primary/15 blur-3xl" />
        <div className="mx-auto max-w-md px-4 py-20 text-center md:px-8">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-primary/10 text-primary">
            <Zap aria-hidden className="size-8" />
          </span>
          <h1 className="font-display mt-5 text-4xl uppercase">Extension</h1>
          <p className="mt-2 text-muted-foreground">
            Buka halaman ini dari tiket kamu, supaya kode booking terisi otomatis.
          </p>
          <Button asChild className="mt-6">
            <Link href="/cek-booking">
              <Ticket aria-hidden className="mr-2 size-4" /> Cek Booking
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // The ticket page refuses to read anything until the visitor has proved ownership, and
  // this page used to read the same booking on the code alone. Same gate, same place:
  // before any query.
  if (!(await hasBookingAccess(code))) {
    redirect(`/cek-booking?code=${encodeURIComponent(code)}`);
  }

  const db = createAdminClient();
  const info = await getExtensionInfo(db, code);
  if (!info) notFound();

  const codeParam = encodeURIComponent(info.booking_code);
  const unitName = info.units?.name ?? null;
  const extendable = info.status === "IN_USE" || info.status === "CONFIRMED";

  /* ---- waktu (dihitung di server, saat halaman dimuat) ---- */
  const now = Date.now();
  const endMs = Date.parse(info.scheduled_end_at);
  const maxMs = info.latest_extendable_at ? Date.parse(info.latest_extendable_at) : Number.NaN;
  const hasMax = Number.isFinite(maxMs);
  const maxHours = hasMax ? Math.max(0, Math.floor((maxMs - endMs) / HOUR_MS)) : null;
  // A limit already behind us, or with no whole hour of room left, means there is nothing
  // to offer: sending the customer to the counter for it would only waste the minutes
  // they have left.
  const noRoom = hasMax && (maxMs <= now || maxHours === 0);
  const hours = noRoom ? [] : Array.from({ length: Math.min(MAX_CHIPS, maxHours ?? MAX_CHIPS) }, (_, i) => i + 1);

  const ended = Number.isFinite(endMs) && endMs <= now;
  const minsLeft = Number.isFinite(endMs) ? Math.round((endMs - now) / 60_000) : null;
  const urgent = info.status === "IN_USE" && !ended && minsLeft !== null && minsLeft <= URGENT_MINUTES;

  const waLink = (text: string) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;
  const askHref = (n: number) =>
    waLink(`Halo kasir, saya mau perpanjang ${n} jam untuk booking ${info.booking_code}${unitName ? ` (${unitName})` : ""}.`);
  const helpHref = waLink(`Halo kasir, saya butuh bantuan soal extension booking ${info.booking_code}.`);

  const blocked = extendable ? null : (BLOCKED[info.status] ?? FALLBACK_BLOCKED);
  const BlockedIcon = blocked?.icon;

  return (
    <div className="relative isolate overflow-hidden">
      <div aria-hidden className="absolute -right-24 -top-28 -z-10 size-96 rounded-full bg-primary/15 blur-3xl" />
      <div aria-hidden className="absolute -left-24 top-1/2 -z-10 size-80 rounded-full bg-amber/10 blur-3xl" />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-[0.04]"
        style={{ backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)", backgroundSize: "20px 20px" }}
      />

      <div className="mx-auto max-w-4xl space-y-6 px-4 py-10 md:px-8 md:py-14">
        <LiveBooking code={info.booking_code} status={info.status} />

        {/* ============================ HEADER ============================ */}
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary">
              <Zap aria-hidden className="size-3.5" /> Perpanjang main
            </span>
            <h1 className="font-display mt-3 text-4xl uppercase leading-tight md:text-5xl">
              Tambah <span className="text-primary">Waktu</span>
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{info.booking_code}</span>
              {unitName && <span>· {unitName}</span>}
            </p>
          </div>
          <BookingStatusPill status={info.status} />
        </header>

        {/* ======================== TIDAK BISA DIPERPANJANG ================ */}
        {blocked && BlockedIcon && (
          <section className={cn("rounded-2xl border p-5", TONE_BOX[blocked.tone])}>
            <div className="flex items-start gap-3">
              <span className={cn("grid size-11 shrink-0 place-items-center rounded-full bg-background/60", TONE_TEXT[blocked.tone])}>
                <BlockedIcon aria-hidden className="size-6" />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-xl uppercase">{blocked.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{blocked.body}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {blocked.toTicket ? (
                    <Button asChild size="sm">
                      <Link href={`/tiket/${codeParam}`}>
                        <Ticket aria-hidden className="mr-1.5 size-4" /> Buka tiket
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild size="sm">
                      <Link href="/booking">
                        <Plus aria-hidden className="mr-1.5 size-4" /> Booking lagi
                      </Link>
                    </Button>
                  )}
                  <Button asChild size="sm" variant="outline">
                    <a href={helpHref} target="_blank" rel="noopener noreferrer">
                      <MessageCircle aria-hidden className="mr-1.5 size-4" /> Tanya kasir
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          </section>
        )}

        {extendable && (
          <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr] lg:items-start">
            {/* ============================ KIRI ============================ */}
            <div className="space-y-6">
              {/* Sisa waktu */}
              <section className={cn("rounded-2xl border p-5", urgent ? TONE_BOX.warning : TONE_BOX.primary)}>
                {info.status === "IN_USE" ? (
                  <>
                    <p className={cn("inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest", urgent ? "text-warning" : "text-primary")}>
                      <span className="relative flex size-2">
                        <span className="absolute inline-flex size-full rounded-full bg-current opacity-75 motion-safe:animate-ping" />
                        <span className="relative inline-flex size-2 rounded-full bg-current" />
                      </span>
                      Sedang main
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">Sesi kamu selesai dalam:</p>
                    <Countdown deadline={info.scheduled_end_at} doneLabel="Waktu main habis — perpanjang di kasir" />
                    {urgent && (
                      <p className="mt-3 flex items-start gap-2 rounded-lg bg-background/60 px-3 py-2 text-sm text-warning">
                        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                        {minsLeft! > 0
                          ? `Tinggal sekitar ${minsLeft} menit. Putuskan sekarang supaya tidak terputus.`
                          : "Waktu main hampir habis. Putuskan sekarang supaya tidak terputus."}
                      </p>
                    )}
                    {ended && (
                      <p className="mt-3 flex items-start gap-2 rounded-lg bg-background/60 px-3 py-2 text-sm text-warning">
                        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                        Waktu main sudah lewat. Segera ke kasir.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
                      <Clock aria-hidden className="size-4" /> Terkonfirmasi
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">Sesi berakhir</p>
                  </>
                )}
                <p className="font-display mt-2 text-xl uppercase">{fmtDateTime(info.scheduled_end_at)}</p>
              </section>

              {/* Jendela perpanjangan */}
              {hasMax && !noRoom && (
                <section aria-label="Batas perpanjangan" className="rounded-2xl border border-border bg-card p-5">
                  <h2 className="text-xs uppercase tracking-wider text-muted-foreground">Ruang perpanjangan</h2>
                  <div className="mt-4 flex items-center gap-2">
                    <span aria-hidden className="size-3 shrink-0 rounded-full bg-primary" />
                    <span className="relative flex h-6 flex-1 items-center">
                      <span aria-hidden className="h-0 w-full border-t-2 border-dashed border-primary/60" />
                      <span className="absolute left-1/2 -translate-x-1/2 rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                        s/d +{maxHours} jam
                      </span>
                    </span>
                    <span aria-hidden className="size-3 shrink-0 rounded-full border-2 border-primary bg-background" />
                  </div>
                  <div className="mt-2 flex justify-between gap-3 text-xs">
                    <span>
                      <span className="block text-muted-foreground">Berakhir</span>
                      <b>{stamp(endMs, endMs)}</b>
                    </span>
                    <span className="text-right">
                      <span className="block text-muted-foreground">Maks. sampai</span>
                      <b>{stamp(maxMs, endMs)}</b>
                    </span>
                  </div>
                </section>
              )}

              {noRoom && (
                <section className={cn("rounded-2xl border p-5", TONE_BOX.warning)}>
                  <p className="inline-flex items-center gap-2 text-sm font-bold text-warning">
                    <TriangleAlert aria-hidden className="size-4" /> Belum ada ruang untuk tambahan 1 jam penuh
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Batas perpanjangan untuk sesi ini sudah dekat atau terlewat
                    {hasMax && maxMs > now ? ` (maks. ${fmtDateTime(info.latest_extendable_at!)})` : ""}. Tanya kasir untuk
                    opsi lain.
                  </p>
                </section>
              )}

              {/* Pilihan tambahan */}
              {hours.length > 0 && (
                <section>
                  <h2 className="font-display flex items-center gap-2 text-lg uppercase">
                    <Zap aria-hidden className="size-4 text-primary" /> Pilih tambahan waktu
                  </h2>
                  <ul className="mt-3 grid gap-3 sm:grid-cols-3">
                    {hours.map((n) => (
                      <li key={n}>
                        <a
                          href={askHref(n)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group relative block overflow-hidden rounded-2xl border border-border bg-card p-4 text-center transition-all hover:-translate-y-1 hover:border-primary/60 hover:shadow-lg active:scale-[0.98]"
                        >
                          <span aria-hidden className="absolute -right-6 -top-8 size-20 rounded-full bg-primary/10 blur-2xl transition-opacity group-hover:opacity-100" />
                          <span className="font-display block text-4xl leading-none tabular-nums text-primary">+{n}</span>
                          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">jam</span>
                          {endMs > now && (
                            <span className="mt-2 block text-xs text-muted-foreground">
                              sampai <b className="text-foreground">{stamp(endMs + n * HOUR_MS, endMs)}</b>
                            </span>
                          )}
                          <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold uppercase text-primary">
                            <MessageCircle aria-hidden className="size-3.5" /> Minta via WA
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Ini hanya permintaan ke kasir. Ketersediaan slot dan total dicek kasir di tempat
                    {maxHours === null ? ", dan batas maksimumnya belum diketahui dari sini" : ""}.
                  </p>
                </section>
              )}
            </div>

            {/* ============================ KANAN =========================== */}
            <aside className="space-y-6 lg:sticky lg:top-24">
              <section className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
                <div aria-hidden className="absolute -right-10 -top-12 size-40 rounded-full bg-primary/15 blur-3xl" />
                <div className="relative p-5">
                  <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    <Ticket aria-hidden className="size-3.5 text-primary" /> Kode untuk kasir
                  </p>
                  <p className="font-display mt-3 break-all text-3xl uppercase tracking-widest md:text-4xl">
                    {info.booking_code}
                  </p>
                  {unitName && <p className="mt-1 text-sm text-muted-foreground">{unitName}</p>}
                </div>

                <div className="relative">
                  <span aria-hidden className="absolute -left-3 top-1/2 size-6 -translate-y-1/2 rounded-full border border-border bg-background" />
                  <span aria-hidden className="absolute -right-3 top-1/2 size-6 -translate-y-1/2 rounded-full border border-border bg-background" />
                  <div className="mx-6 border-t-2 border-dashed border-border" />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 p-5">
                  <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                    Sebutkan atau tunjukkan layar ini ke kasir.
                  </p>
                  <CopyCodeButton code={info.booking_code} />
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-card p-5">
                <h2 className="font-display text-lg uppercase">Cara perpanjang</h2>
                <ol className="mt-3 space-y-3">
                  {STEPS.map((s, i) => (
                    <li key={s} className="flex items-start gap-3 text-sm">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full border border-primary/50 text-xs font-bold text-primary">
                        {i + 1}
                      </span>
                      <span className="pt-0.5 text-muted-foreground">{s}</span>
                    </li>
                  ))}
                </ol>
              </section>
            </aside>
          </div>
        )}

        {/* ============================ NAVIGASI ========================== */}
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href={`/tiket/${codeParam}`}>
              <ArrowLeft aria-hidden className="mr-2 size-4" /> Kembali ke Tiket
            </Link>
          </Button>
          {extendable && (
            <Button asChild variant="ghost">
              <a href={helpHref} target="_blank" rel="noopener noreferrer">
                <MessageCircle aria-hidden className="mr-2 size-4" /> Chat Kasir
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}