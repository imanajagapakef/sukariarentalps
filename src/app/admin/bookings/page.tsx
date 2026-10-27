import { PageHero } from "@/components/page-hero";
import Link from "next/link";
import {
  CalendarDays,
  CircleCheck,
  CircleSlash,
  Download,
  Filter,
  Hourglass,
  Plus,
  RotateCcw,
  Search,
  Ticket,
  TriangleAlert,
  BadgeCheck,
  Wallet,
  Zap,
  X,
} from "lucide-react";
import { BookingStatusPill } from "@/components/status-pill";
import { ActionButtons } from "@/components/admin/action-buttons";
import { hasBookingActions } from "@/lib/booking-actions";
import {
  BOOKING_LABEL,
  BOOKING_TONE,
  coverTint,
  fmtDate,
  fmtDateTime,
  fmtDuration,
  fmtISODay,
  fmtTime,
  rp,
} from "@/lib/format";
import { SelectField } from "@/components/ui/select-field";
import { StatCards } from "@/components/stat-cards";
import { EmptyState } from "@/components/empty-state";
import { STATUSES, countByStatus, listBookingsPage } from "@/lib/bookings-query";
import { TablePagination } from "@/components/admin/table-pagination";
import { listPaymentProofs, type PaymentProofWithUrl } from "@/lib/payment-proofs";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthError, getStaffUser } from "@/lib/authz";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/* -------------------------------------------------------------------------- */
/*  Helpers (di luar komponen supaya tidak dibuat ulang tiap render)          */
/* -------------------------------------------------------------------------- */

const STRIPE: Record<string, string> = {
  success: "bg-primary",
  warning: "bg-amber",
  danger: "bg-coral",
  neutral: "bg-muted-foreground/40",
};

/** Di bawah ini (menit) sisa waktu bayar dianggap genting. */
const URGENT_MINUTES = 15;

/**
 * Sisa waktu bayar. Jam absolut tetap ditampilkan di sebelahnya karena teks ini
 * dirender server dan bisa basi selama satu siklus refresh - jam absolut tidak
 * pernah bohong, "kurang dari 1 menit" justru bahaya untuk kasir yang mau
 * melepas slot yang sebenarnya sudah dibayar.
 */
function deadlineHint(deadlineIso: string, nowMs: number) {
  const minutes = Math.round((Date.parse(deadlineIso) - nowMs) / 60_000);
  if (minutes <= 0) return { text: "lewat — akan dilepas", minutes };
  if (minutes < 60) return { text: `sisa ${minutes} menit`, minutes };
  const hours = Math.floor(minutes / 60);
  return { text: `sisa ${hours} jam ${minutes % 60} menit`, minutes };
}

/** Petunjuk relatif untuk jadwal: "dalam 2 jam", "waktunya check-in", "berlangsung". */
function whenHint(status: string, startIso: string, nowMs: number): { text: string; live?: boolean } | null {
  if (status === "IN_USE") return { text: "berlangsung", live: true };
  if (status !== "CONFIRMED" && status !== "WAITING_PAYMENT") return null;
  const diff = Math.round((Date.parse(startIso) - nowMs) / 60_000);
  if (diff <= 0) return { text: status === "CONFIRMED" ? "waktunya check-in" : "jadwal sudah lewat" };
  if (diff < 60) return { text: `mulai ${diff} mnt lagi` };
  if (diff < 1440) return { text: `mulai ${Math.floor(diff / 60)} jam lagi` };
  return { text: `mulai ${Math.floor(diff / 1440)} hari lagi` };
}

/**
 * Apa yang diklaim customer vs apa yang diharapkan kelab.
 *
 * Selisih adalah intinya: nominal yang beda dari total itu bukan soal format,
 * itu pertanyaan yang harus dijawab kasir sebelum menekan Konfirmasi - makanya
 * dirender dengan warna peringatan, bukan disembunyikan.
 *
 * Sengaja tanpa accept/reject: bukti itu klaim, hanya mutasi bank yang
 * menyelesaikannya. Tombol "approved" di sini akan mengarang otoritas yang
 * tidak dimiliki layar ini.
 */
function ProofCell({ proofs, expected }: { proofs: PaymentProofWithUrl[]; expected: number }) {
  if (proofs.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground">
        Belum ada bukti
      </span>
    );
  }

  const [latest, ...older] = proofs;
  const mismatch = latest.nominal !== expected;

  return (
    <div
      className={cn(
        "min-w-44 space-y-1 rounded-lg border px-2.5 py-2",
        mismatch ? "border-warning/40 bg-warning/10" : "border-primary/30 bg-primary/5",
      )}
    >
      <span className="flex items-center gap-1.5">
        {mismatch ? (
          <TriangleAlert aria-hidden className="size-3.5 shrink-0 text-warning" />
        ) : (
          <BadgeCheck aria-hidden className="size-3.5 shrink-0 text-primary" />
        )}
        <span className={cn("font-mono text-sm font-bold tabular-nums", mismatch ? "text-warning" : "text-primary")}>
          {rp(latest.nominal)}
        </span>
      </span>
      <span
        className={cn(
          "block text-[10px] font-bold uppercase tracking-wide",
          mismatch ? "text-warning" : "text-primary",
        )}
      >
        {mismatch ? "≠ tagihan — cek mutasi" : "sama dengan tagihan"}
      </span>
      {latest.signedUrl ? (
        <a
          href={latest.signedUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="block text-xs font-medium text-primary hover:underline"
        >
          Lihat bukti ↗
        </a>
      ) : (
        <span className="block text-xs text-muted-foreground">File tidak bisa dibuka</span>
      )}
      {latest.note && <span className="block text-xs text-muted-foreground">“{latest.note}”</span>}
      {older.length > 0 && (
        <span className="block text-[10px] text-muted-foreground">+{older.length} pengiriman sebelumnya</span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; date?: string; page?: string }>;
}) {
  const filters = await searchParams;
  const { status, q, date } = filters;
  // STAFF only ever see their own branch here; OWNER/ADMIN (unbound) see all.
  const me = await getStaffUser().catch(() => null);
  // Defense in depth: the layout blocks non-staff, but a null profile here would
  // fall through to the OWNER view below (branchId: null reads every outlet).
  // Fail closed instead of trusting that the layout ran.
  if (!me) throw new AuthError("Harus login dulu", 401);
  if (me.role === "STAFF" && !me.branch_id) {
    // fail-closed tripwire: a branchless STAFF would fall through to the OWNER
    // view below (branchId: null reads every outlet). Migration 0034 makes the
    // state impossible for new rows; a corrupt or historical row must not
    // quietly grant cross-branch visibility, so the read bounces with a 403.
    throw new AuthError("Akun staff belum terikat cabang", 403);
  }
  // Only the three real filters reach the query and the export link. `page` belongs to
  // this view alone — letting it through would export one page as if it were the book.
  const filterParams = { status, q, date };

  const { rows, total, page, pageCount, from, to } = await listBookingsPage(
    { ...filterParams, branchId: me?.branch_id },
    Number(filters.page ?? "1"),
  );

  // Exact counts rather than arithmetic over the rows on screen. Four head-count
  // queries, no rows over the wire.
  const [waitingCount, activeCount, inUseCount, cancelledCount] = await Promise.all([
    countByStatus("WAITING_PAYMENT", me?.branch_id),
    countByStatus("CONFIRMED", me?.branch_id),
    countByStatus("IN_USE", me?.branch_id),
    countByStatus("CANCELLED", me?.branch_id),
  ]).catch(() => [0, 0, 0, 0] as [number, number, number, number]);

  // Money for the rows on screen only. Reports is where revenue counts.
  const pageRevenue = rows
    .filter((b) => !["DRAFT", "CANCELLED", "EXPIRED"].includes(b.status))
    .reduce((sum, b) => sum + b.total_amount, 0);

  const exportParams = new URLSearchParams(
    Object.entries(filterParams).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  ).toString();
  const exportHref = `/api/admin/bookings/export${exportParams ? `?${exportParams}` : ""}`;

  // Only worth a column while something is actually waiting. Server-rendered, no
  // per-row timer: LiveRefresh already re-renders the page every 60s.
  const showDeadlineColumn = rows.some((b) => b.status === "WAITING_PAYMENT");
  const now = Date.now();

  // Proofs for every row on screen, not just the queue: the evidence must outlive the
  // Konfirmasi click, because that is exactly when a dispute needs it.
  const proofs = await listPaymentProofs(createAdminClient(), rows.map((b) => b.booking_id)).catch((e) => {
    console.error("gagal memuat bukti bayar:", e);
    return new Map<string, PaymentProofWithUrl[]>();
  });
  const proofsFor = (bookingId: string) => proofs.get(bookingId) ?? [];
  const hasAnyProof = rows.some((b) => proofsFor(b.booking_id).length > 0);
  const showProofColumn = showDeadlineColumn || hasAnyProof;

  /* ---- insight dari rows yang sudah ada (tanpa query baru) ---- */
  const waitingRows = rows.filter((b) => b.status === "WAITING_PAYMENT");
  const urgentCount = waitingRows.filter(
    (b) => b.payment_deadline_at && deadlineHint(b.payment_deadline_at, now).minutes <= URGENT_MINUTES,
  ).length;
  const mismatchCount = waitingRows.filter((b) => {
    const latest = proofsFor(b.booking_id)[0];
    return latest && latest.nominal !== b.total_amount;
  }).length;
  const noProofCount = waitingRows.filter((b) => proofsFor(b.booking_id).length === 0).length;

  // Komposisi halaman ini, dikelompokkan per tone.
  const mix = { success: 0, warning: 0, danger: 0, neutral: 0 };
  for (const b of rows) mix[BOOKING_TONE[b.status] ?? "neutral"] += 1;
  const MIX_META = [
    { key: "success", label: "Lancar", bar: "bg-primary" },
    { key: "warning", label: "Menunggu", bar: "bg-amber" },
    { key: "danger", label: "Gagal", bar: "bg-coral" },
    { key: "neutral", label: "Selesai / draft", bar: "bg-muted-foreground/40" },
  ] as const;

  /* ---- builder URL yang mempertahankan filter lain ---- */
  const hrefWith = (o: Partial<Record<"status" | "q" | "date", string | undefined>>) => {
    const merged = { status, q, date, ...o };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const qs = sp.toString();
    return qs ? `/admin/bookings?${qs}` : "/admin/bookings";
  };

  const hasFilter = Boolean(status || q || date);
  const todayIso = fmtISODay(new Date());

  const CHIPS: { key: string | undefined; label: string; count?: number }[] = [
    { key: undefined, label: "Semua" },
    { key: "WAITING_PAYMENT", label: BOOKING_LABEL.WAITING_PAYMENT, count: waitingCount },
    { key: "CONFIRMED", label: BOOKING_LABEL.CONFIRMED, count: activeCount },
    { key: "IN_USE", label: BOOKING_LABEL.IN_USE, count: inUseCount },
    { key: "COMPLETED", label: BOOKING_LABEL.COMPLETED },
    { key: "CANCELLED", label: BOOKING_LABEL.CANCELLED, count: cancelledCount },
    { key: "NO_SHOW", label: BOOKING_LABEL.NO_SHOW },
  ];

  const th = "px-4 py-3 font-semibold";

  return (
    <div className="space-y-6">
      {/* ============================ HERO ============================ */}
      <PageHero
        size="admin"
        eyebrow={{
          label: (
            <>
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75 motion-reduce:animate-none" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              Live · auto-refresh 60 dtk
            </>
          ),
        }}
        title="Bookings"
        titleIcon={Ticket}
        description={
          <>
            <b className="text-foreground tabular-nums">{total}</b> booking
            {hasFilter ? " sesuai filter" : " tercatat"}, terbaru dulu
            {pageCount > 1 ? ` · halaman ${page} dari ${pageCount}` : ""}.
          </>
        }
        actions={
          <>
            <Link
              href="/admin/walk-in"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground transition-transform hover:scale-105"
            >
              <Plus className="size-4" /> Walk-in
            </Link>
            <Link
              href={exportHref}
              prefetch={false}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background/60 px-4 text-sm font-medium backdrop-blur transition-colors hover:border-primary"
            >
              <Download className="size-4" /> Export CSV
            </Link>
            <Link
              href={hrefWith({ date: todayIso })}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium backdrop-blur transition-colors hover:border-primary",
                date === todayIso ? "border-primary bg-primary/10 text-primary" : "border-border bg-background/60",
              )}
            >
              <CalendarDays className="size-4" /> Hari ini
            </Link>
          </>
        }
        aside={
          rows.length > 0 && (
            <div className="w-full sm:w-72">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Komposisi halaman ini
              </p>
              <div
                role="img"
                aria-label="Komposisi status booking pada halaman ini"
                className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-muted"
              >
                {MIX_META.map((m) =>
                  mix[m.key] ? (
                    <div
                      key={m.key}
                      className={cn("h-full", m.bar)}
                      style={{ width: `${(mix[m.key] / rows.length) * 100}%` }}
                      title={`${m.label}: ${mix[m.key]}`}
                    />
                  ) : null,
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {MIX_META.filter((m) => mix[m.key]).map((m) => (
                  <span key={m.key} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <span className={cn("size-2 rounded-full", m.bar)} />
                    {m.label} {mix[m.key]}
                  </span>
                ))}
              </div>
            </div>
          )
        }
      />

      {/* ============================= KPI ============================ */}
      <StatCards
        className={cn("mt-0!", !status && "lg:grid-cols-6")}
        cards={
          status
            ? // A status filter answers "what is in this set", so the strip reports that
              // instead of four book-wide numbers the filter is not looking at.
              [
                { label: "Cocok filter", value: total, icon: Filter, hint: BOOKING_LABEL[status] ?? status },
                {
                  label: "Antrean bayar",
                  value: waitingCount,
                  tone: "warning",
                  icon: Hourglass,
                  href: hrefWith({ status: "WAITING_PAYMENT" }),
                },
                {
                  label: "Nilai halaman ini",
                  value: rp(pageRevenue),
                  tone: "primary",
                  icon: Wallet,
                  hint: `${rows.length} baris di layar`,
                },
              ]
            : [
                { label: "Total booking", value: total, icon: Ticket, hint: hasFilter ? "sesuai filter" : "seluruh buku" },
                {
                  label: "Aktif",
                  value: activeCount,
                  tone: "primary",
                  icon: CircleCheck,
                  href: hrefWith({ status: "CONFIRMED" }),
                  hint: "terkonfirmasi",
                },
                {
                  label: "Dipakai",
                  value: inUseCount,
                  icon: Zap,
                  href: hrefWith({ status: "IN_USE" }),
                  hint: "lagi main",
                },
                {
                  label: "Menunggu bayar",
                  value: waitingCount,
                  tone: waitingCount ? "warning" : "muted",
                  icon: Hourglass,
                  href: hrefWith({ status: "WAITING_PAYMENT" }),
                  hint: waitingCount ? "perlu dicek mutasi" : "antrean kosong",
                },
                {
                  label: "Dibatalkan",
                  value: cancelledCount,
                  tone: "danger",
                  icon: CircleSlash,
                  href: hrefWith({ status: "CANCELLED" }),
                },
                {
                  label: "Nilai halaman ini",
                  value: rp(pageRevenue),
                  tone: "primary",
                  icon: Wallet,
                  hint: `${rows.length} baris di layar`,
                },
              ]
        }
      />

      {/* ====================== FILTER + QUICK CHIPS ================== */}
      <section className="rounded-2xl border border-border bg-card p-4">
        {/* chip status: satu klik, tanpa dropdown */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-3">
          {CHIPS.map((c) => {
            const active = (status ?? undefined) === c.key;
            return (
              <Link
                key={c.label}
                href={hrefWith({ status: c.key })}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background/60 text-muted-foreground hover:border-primary/60 hover:text-foreground",
                )}
              >
                {c.label}
                {typeof c.count === "number" && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                      active ? "bg-primary-foreground/20" : "bg-muted",
                    )}
                  >
                    {c.count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        <form className="flex flex-wrap gap-2" method="get">
          <label className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Kode / nama / no. HP"
              aria-label="Cari booking"
              className="h-12 w-56 rounded-lg border border-input bg-background pl-9 pr-3 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </label>
          <label className="relative">
            <CalendarDays aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="date"
              name="date"
              defaultValue={date}
              aria-label="Tanggal"
              className="h-12 rounded-lg border border-input bg-background pl-9 pr-3 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </label>
          <SelectField name="status" defaultValue={status ?? ""} aria-label="Status" className="w-auto">
            <option value="">Semua status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {BOOKING_LABEL[s] ?? s}
              </option>
            ))}
          </SelectField>
          <button
            type="submit"
            className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground transition-transform hover:scale-[1.02]"
          >
            <Search className="size-4" /> Cari
          </button>
          {hasFilter && (
            <Link
              href="/admin/bookings"
              className="inline-flex h-12 items-center gap-2 rounded-lg border border-border px-4 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              <RotateCcw className="size-4" /> Reset
            </Link>
          )}
        </form>

        {/* filter aktif, bisa dilepas satu per satu */}
        {hasFilter && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Filter aktif:</span>
            {status && (
              <Link
                href={hrefWith({ status: undefined })}
                className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 font-medium text-primary hover:bg-primary/20"
              >
                {BOOKING_LABEL[status] ?? status} <X className="size-3" aria-label="Hapus filter status" />
              </Link>
            )}
            {q && (
              <Link
                href={hrefWith({ q: undefined })}
                className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 font-medium text-primary hover:bg-primary/20"
              >
                “{q}” <X className="size-3" aria-label="Hapus pencarian" />
              </Link>
            )}
            {date && (
              <Link
                href={hrefWith({ date: undefined })}
                className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 font-medium text-primary hover:bg-primary/20"
              >
                {fmtDate(`${date}T00:00:00+07:00`)} <X className="size-3" aria-label="Hapus filter tanggal" />
              </Link>
            )}
          </div>
        )}
      </section>

      {/* ===================== BANNER ANTREAN BAYAR =================== */}
      {/* Nothing settles on its own, so the cashier has to come looking for the queue.
          This puts it one click away instead of behind the status dropdown. */}
      {!status && waitingCount > 0 && (
        <Link
          href={hrefWith({ status: "WAITING_PAYMENT" })}
          className="group relative isolate flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-2xl border border-warning/50 bg-warning/10 px-5 py-4 transition-colors hover:bg-warning/20"
        >
          <div aria-hidden className="absolute -left-10 top-0 -z-10 size-40 rounded-full bg-amber/20 blur-3xl" />
          <div className="flex items-center gap-4">
            <span className="relative grid size-12 shrink-0 place-items-center rounded-full bg-warning/20 text-warning">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-warning/30" />
              <Hourglass className="relative size-6" aria-hidden />
            </span>
            <span>
              <span className="block font-bold text-foreground">
                {waitingCount} booking menunggu konfirmasi pembayaran
              </span>
              <span className="block text-xs text-muted-foreground">
                Urutan paling mendesak lebih dulu. Cek mutasi, lalu tekan Konfirmasi.
              </span>
              {(urgentCount > 0 || mismatchCount > 0 || noProofCount > 0) && (
                <span className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold uppercase">
                  {urgentCount > 0 && (
                    <span className="rounded-full bg-coral/20 px-2 py-0.5 text-coral">
                      {urgentCount} hampir lewat batas
                    </span>
                  )}
                  {mismatchCount > 0 && (
                    <span className="rounded-full bg-warning/20 px-2 py-0.5 text-warning">
                      {mismatchCount} nominal ≠ tagihan
                    </span>
                  )}
                  {noProofCount > 0 && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                      {noProofCount} belum kirim bukti
                    </span>
                  )}
                  <span className="self-center text-[10px] font-medium normal-case text-muted-foreground">
                    (dihitung dari halaman ini)
                  </span>
                </span>
              )}
            </span>
          </div>
          <span className="shrink-0 rounded-full bg-warning px-4 py-2 text-sm font-bold uppercase text-background transition-transform group-hover:scale-105">
            Buka antrean →
          </span>
        </Link>
      )}

      {/* ============================ TABEL =========================== */}
      {rows.length === 0 ? (
        <EmptyState
          title="Tidak ada booking"
          description={hasFilter ? "Coba longgarkan filter pencarian." : "Belum ada booking yang masuk."}
          actionHref={hasFilter ? { label: "Reset filter", href: "/admin/bookings" } : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-240 text-sm">
            <thead className="bg-surface-container text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="[&>th]:sticky [&>th]:top-0 [&>th]:z-10">
                <th scope="col" className={th}>Kode</th>
                <th scope="col" className={th}>Status</th>
                <th scope="col" className={th}>Customer</th>
                <th scope="col" className={th}>Unit</th>
                <th scope="col" className={th}>Jadwal</th>
                {showDeadlineColumn && (
                  <th scope="col" className={cn(th, "hidden md:table-cell")}>Batas Bayar</th>
                )}
                <th scope="col" className={cn(th, "hidden text-right md:table-cell")}>Durasi</th>
                <th scope="col" className={cn(th, "hidden text-right md:table-cell")}>Total</th>
                {showProofColumn && (
                  <th scope="col" className={cn(th, "hidden md:table-cell")}>Bukti Bayar</th>
                )}
                <th scope="col" className={cn(th, "hidden md:table-cell")}>Sumber</th>
                <th scope="col" className={cn(th, "text-right")}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const tone = BOOKING_TONE[b.status] ?? "neutral";
                const when = whenHint(b.status, b.scheduled_start_at, now);
                const dl = b.payment_deadline_at ? deadlineHint(b.payment_deadline_at, now) : null;
                const urgent = b.status === "WAITING_PAYMENT" && dl !== null && dl.minutes <= URGENT_MINUTES;
                const bookingProofs = proofsFor(b.booking_id);
                const mismatch = b.status === "WAITING_PAYMENT" && bookingProofs[0] && bookingProofs[0].nominal !== b.total_amount;
                const name = b.customers?.name ?? "";
                const isWalkIn = (b.source ?? "").toLowerCase().includes("walk");

                return (
                  <tr
                    key={b.booking_id}
                    className={cn(
                      "border-t border-border align-top transition-colors hover:bg-accent/40",
                      urgent && "bg-coral/5",
                      !urgent && mismatch && "bg-warning/5",
                    )}
                  >
                    <td className="relative whitespace-nowrap py-3 pl-5 pr-4">
                      <span
                        aria-hidden
                        className={cn(
                          "absolute inset-y-0 left-0 w-1",
                          STRIPE[tone],
                          b.status === "IN_USE" && "animate-pulse",
                        )}
                      />
                      <Link
                        href={`/tiket/${b.booking_code}`}
                        className="font-display inline-flex items-center gap-1.5 uppercase tracking-wide hover:text-primary hover:underline"
                      >
                        <Ticket aria-hidden className="size-3.5 text-muted-foreground" />
                        {b.booking_code}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <BookingStatusPill status={b.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          aria-hidden
                          className="grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                          style={{ backgroundColor: coverTint(name || b.booking_code) }}
                        >
                          {name.trim().charAt(0).toUpperCase() || "?"}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{name || "—"}</span>
                          <span className="block text-xs text-muted-foreground">{b.customers?.phone}</span>
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs font-medium">
                        {b.units?.name ?? "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="block">{fmtDateTime(b.scheduled_start_at)}</span>
                      <span className="block text-xs text-muted-foreground">s/d {fmtTime(b.scheduled_end_at)}</span>
                      {when && (
                        <span
                          className={cn(
                            "mt-1 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide",
                            when.live ? "text-primary" : "text-muted-foreground",
                          )}
                        >
                          {when.live && (
                            <span className="relative flex size-1.5">
                              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
                              <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
                            </span>
                          )}
                          {when.text}
                        </span>
                      )}
                    </td>
                    {showDeadlineColumn && (
                      <td className="hidden whitespace-nowrap px-4 py-3 md:table-cell">
                        {b.payment_deadline_at && dl ? (
                          <>
                            <span className="block text-xs">{fmtDateTime(b.payment_deadline_at)}</span>
                            <span
                              className={cn(
                                "mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold",
                                urgent ? "bg-coral/20 text-coral" : "bg-muted text-muted-foreground",
                              )}
                            >
                              {dl.text}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    )}
                    <td className="hidden whitespace-nowrap px-4 py-3 text-right md:table-cell">
                      <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
                        {fmtDuration(b.duration_minutes)}
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-right font-mono font-bold tabular-nums md:table-cell">
                      {rp(b.total_amount)}
                    </td>
                    {showProofColumn && (
                      <td className="hidden px-4 py-3 md:table-cell">
                        {bookingProofs.length > 0 || b.status === "WAITING_PAYMENT" ? (
                          <ProofCell proofs={bookingProofs} expected={b.total_amount} />
                        ) : null}
                      </td>
                    )}
                    <td className="hidden px-4 py-3 md:table-cell">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          isWalkIn
                            ? "border-amber/40 bg-amber/10 text-amber"
                            : "border-border text-muted-foreground",
                        )}
                      >
                        {b.source ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        {hasBookingActions(b.status) ? (
                          <ActionButtons code={b.booking_code} status={b.status} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <TablePagination
        basePath="/admin/bookings"
        params={filterParams}
        page={page}
        pageCount={pageCount}
        total={total}
        from={from}
        to={to}
      />
    </div>
  );
}