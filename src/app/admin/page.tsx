import { PageHero } from "@/components/page-hero";
import Link from "next/link";
import { Activity, AlertTriangle, CalendarCheck, Flame, Gamepad2, Wallet, Zap } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/authz";
import { UnitStatusPill } from "@/components/status-pill";
import { StatCards } from "@/components/stat-cards";
import { fmtTime, rp, UNIT_LABEL, UNIT_TONE } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const WIB_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

const wibHour = (iso: string) =>
  Number(new Date(iso).toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Jakarta" })) % 24;

const STRIPE: Record<string, string> = {
  success: "bg-primary",
  warning: "bg-amber",
  danger: "bg-coral",
  neutral: "bg-muted-foreground/40",
};

// urutan & warna segmen di occupancy bar
const SEGMENTS = [
  { key: "IN_USE", bar: "bg-primary" },
  { key: "BOOKED", bar: "bg-amber" },
  { key: "IN_ORDER", bar: "bg-primary/50" },
  { key: "AVAILABLE", bar: "bg-muted-foreground/30" },
  { key: "MAINTENANCE", bar: "bg-coral" },
  { key: "OFFLINE", bar: "bg-border" },
] as const;

export default async function AdminDashboard() {
  const db = createAdminClient();
  const staff = await getStaffUser().catch(() => null);
  // Defense in depth: the layout already blocks non-staff, but this page reads
  // cross-branch aggregates through the service-role client, so it must fail
  // closed rather than trust that the layout ran.
  if (!staff) return null;
  const staffName = staff.full_name ?? "Boss";

  // Batas "hari ini" dihitung di WIB, bukan timezone server (Vercel = UTC).
  const nowMs = Date.now();
  const startMs = Math.floor((nowMs + WIB_MS) / DAY_MS) * DAY_MS - WIB_MS;
  const today = new Date(startMs);
  const tomorrow = new Date(startMs + DAY_MS);
  const nowHour = wibHour(new Date(nowMs).toISOString());

  const [{ count: activeBookings }, { count: waiting }, { count: sessions }, { data: revenue }, { data: units }] =
    await Promise.all([
      db.from("bookings").select("*", { count: "exact", head: true }).in("status", ["CONFIRMED", "IN_USE"]),
      db.from("bookings").select("*", { count: "exact", head: true }).eq("status", "WAITING_PAYMENT"),
      db.from("bookings").select("*", { count: "exact", head: true }).eq("status", "IN_USE"),
      db
        .from("bookings")
        .select("total_amount, status, scheduled_start_at")
        .gte("scheduled_start_at", today.toISOString())
        .lt("scheduled_start_at", tomorrow.toISOString())
        .not("status", "in", "(DRAFT,CANCELLED,EXPIRED)"),
      db.from("units").select("unit_id, name, status, branches(short_name)").order("unit_id"),
    ]);

  const rows = revenue ?? [];
  const allUnits = units ?? [];

  const todayRevenue = rows.reduce((sum, b) => sum + b.total_amount, 0);
  const avgTicket = rows.length ? Math.round(todayRevenue / rows.length) : 0;

  // --- tren per jam (dari data yang sudah ada, tanpa query baru) ---
  const perHour = Array.from({ length: 24 }, () => ({ count: 0, amount: 0 }));
  for (const b of rows) {
    const h = wibHour(b.scheduled_start_at);
    perHour[h].count += 1;
    perHour[h].amount += b.total_amount;
  }
  const maxHour = Math.max(1, ...perHour.map((h) => h.amount));
  const peak = perHour.reduce((best, h, i) => (h.amount > perHour[best].amount ? i : best), 0);
  const hasTrend = rows.length > 0;

  // --- okupansi unit ---
  const byStatus = new Map<string, number>();
  for (const u of allUnits) byStatus.set(u.status, (byStatus.get(u.status) ?? 0) + 1);
  const operational = allUnits.filter((u) => u.status !== "MAINTENANCE" && u.status !== "OFFLINE").length;
  const busy = (byStatus.get("IN_USE") ?? 0) + (byStatus.get("BOOKED") ?? 0);
  const occupancy = operational ? Math.round((busy / operational) * 100) : 0;
  const free = byStatus.get("AVAILABLE") ?? 0;

  // --- kelompokkan unit per cabang ---
  const byBranch = new Map<string, typeof allUnits>();
  for (const u of allUnits) {
    const key = u.branches?.short_name ?? "Tanpa cabang";
    byBranch.set(key, [...(byBranch.get(key) ?? []), u]);
  }

  const hour = nowHour;
  const greeting = hour < 11 ? "Pagi" : hour < 15 ? "Siang" : hour < 18 ? "Sore" : "Malam";
  const dateLabel = new Date(nowMs).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Jakarta",
  });

  const needsAttention = (waiting ?? 0) > 0 || (byStatus.get("MAINTENANCE") ?? 0) > 0;

  return (
    <div className="space-y-8">
      {/* ================= HERO ================= */}
      <PageHero
        size="admin"
        eyebrow={{
          label: (
            <>
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75 motion-reduce:animate-none" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              Live · {fmtTime(new Date(nowMs).toISOString())}
            </>
          ),
        }}
        title={
          <>
            {greeting}, {staffName} <span className="text-primary">🎮</span>
          </>
        }
        description={
          <>
            {dateLabel} ·{" "}
            {(sessions ?? 0) > 0 ? (
              <>
                <b className="text-foreground">{sessions}</b> sesi lagi jalan, <b className="text-foreground">{free}</b> unit siap
                dipakai.
              </>
            ) : (
              <>Belum ada sesi jalan, {free} unit nganggur siap tempur.</>
            )}
          </>
        }
        actions={
          <>
            <Link
              href="/admin/bookings"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-transform hover:scale-105"
            >
              <CalendarCheck className="size-4" /> Jadwal hari ini
            </Link>
            <Link
              href="/admin/units"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-4 py-2 text-sm font-medium backdrop-blur transition-colors hover:border-primary"
            >
              <Gamepad2 className="size-4" /> Kelola unit
            </Link>
          </>
        }
        aside={
          <div className="w-full sm:w-72">
            <div className="flex items-end justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Okupansi</p>
              <p className="font-display text-5xl leading-none tabular-nums text-primary">
                {occupancy}
                <span className="text-2xl">%</span>
              </p>
            </div>
            <div
              role="img"
              aria-label={`Okupansi ${occupancy} persen`}
              className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-muted"
            >
              {SEGMENTS.map((s) => {
                const n = byStatus.get(s.key) ?? 0;
                if (!n) return null;
                return (
                  <div
                    key={s.key}
                    className={cn("h-full transition-all", s.bar)}
                    style={{ width: `${(n / Math.max(1, allUnits.length)) * 100}%` }}
                    title={`${UNIT_LABEL[s.key] ?? s.key}: ${n}`}
                  />
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {SEGMENTS.filter((s) => byStatus.get(s.key)).map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span className={cn("size-2 rounded-full", s.bar)} />
                  {UNIT_LABEL[s.key] ?? s.key} {byStatus.get(s.key)}
                </span>
              ))}
            </div>
          </div>
        }
      />

      {/* ================= KPI ================= */}
      <StatCards
        className="mt-0!"
        cards={[
          { label: "Sesi aktif", value: sessions ?? 0, href: "/admin/bookings?status=IN_USE", tone: "primary", icon: Zap, hint: "lagi main sekarang" },
          { label: "Menunggu bayar", value: waiting ?? 0, href: "/admin/bookings?status=WAITING_PAYMENT", tone: waiting ? "warning" : "muted", icon: AlertTriangle, hint: waiting ? "perlu di-follow up" : "aman, tidak ada antrean" },
          { label: "Booking aktif", value: activeBookings ?? 0, href: "/admin/bookings", icon: CalendarCheck, hint: "confirmed + berjalan" },
          { label: "Omzet hari ini", value: rp(todayRevenue), tone: "primary", icon: Wallet, hint: rows.length ? `${rows.length} booking · rata-rata ${rp(avgTicket)}` : "belum ada transaksi" },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ================= UNIT BOARD ================= */}
        <section className="space-y-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl uppercase">Unit Sekarang</h2>
            <span className="text-xs text-muted-foreground">{allUnits.length} unit · klik untuk detail</span>
          </div>

          {[...byBranch.entries()].map(([branch, list]) => (
            <div key={branch}>
              <div className="mb-2 flex items-center gap-3">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{branch}</span>
                <span className="h-px flex-1 bg-border" />
                <span className="text-[11px] text-muted-foreground">
                  {list.filter((u) => u.status === "IN_USE").length}/{list.length} dipakai
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((u) => {
                  const tone = UNIT_TONE[u.status] ?? "neutral";
                  const live = u.status === "IN_USE";
                  return (
                    <Link
                      key={u.unit_id}
                      href={`/admin/units?unit=${u.unit_id}`}
                      className="group relative flex items-center justify-between gap-2 overflow-hidden rounded-xl border border-border bg-card p-3 pl-4 transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
                    >
                      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", STRIPE[tone], live && "animate-pulse")} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{u.name}</span>
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          {live && <Flame className="size-3 text-primary" aria-hidden />}
                          #{u.unit_id}
                        </span>
                      </span>
                      <UnitStatusPill status={u.status} />
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {allUnits.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Belum ada unit terdaftar.
            </p>
          )}
        </section>

        {/* ================= SIDEBAR PANELS ================= */}
        <aside className="space-y-6">
          {/* Jam sibuk */}
          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display flex items-center gap-2 text-lg uppercase">
                <Activity className="size-4 text-primary" aria-hidden /> Jam Sibuk
              </h2>
              {hasTrend && (
                <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-bold text-primary">
                  Puncak {String(peak).padStart(2, "0")}:00
                </span>
              )}
            </div>

            {hasTrend ? (
              <>
                <div className="mt-4 grid h-28 grid-cols-24 items-end gap-0.5" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
                  {perHour.map((h, i) => (
                    <div
                      key={i}
                      title={`${String(i).padStart(2, "0")}:00 · ${h.count} booking · ${rp(h.amount)}`}
                      className={cn(
                        "w-full rounded-t-sm transition-all hover:opacity-80",
                        i === peak ? "bg-primary" : h.amount ? "bg-primary/45" : "bg-muted",
                        i === nowHour && "ring-1 ring-foreground/60",
                      )}
                      style={{ height: `${Math.max(6, (h.amount / maxHour) * 100)}%` }}
                    />
                  ))}
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>00</span>
                  <span>06</span>
                  <span>12</span>
                  <span>18</span>
                  <span>23</span>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Garis putih = jam sekarang. Tinggi bar = omzet booking per jam mulai.
                </p>
              </>
            ) : (
              <p className="mt-4 rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                Belum ada booking hari ini. Grafik muncul begitu transaksi pertama masuk.
              </p>
            )}
          </section>

          {/* Perlu perhatian */}
          <section
            className={cn(
              "rounded-2xl border p-4",
              needsAttention ? "border-amber/40 bg-amber/5" : "border-primary/30 bg-primary/5",
            )}
          >
            <h2 className="font-display flex items-center gap-2 text-lg uppercase">
              <AlertTriangle className={cn("size-4", needsAttention ? "text-amber" : "text-primary")} aria-hidden />
              {needsAttention ? "Perlu Perhatian" : "Semua Aman"}
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {(waiting ?? 0) > 0 && (
                <li>
                  <Link
                    href="/admin/bookings?status=WAITING_PAYMENT"
                    className="flex items-center justify-between rounded-lg bg-background/60 px-3 py-2 transition-colors hover:text-primary"
                  >
                    <span>{waiting} booking belum bayar</span>
                    <span aria-hidden>→</span>
                  </Link>
                </li>
              )}
              {(byStatus.get("MAINTENANCE") ?? 0) > 0 && (
                <li>
                  <Link
                    href="/admin/units"
                    className="flex items-center justify-between rounded-lg bg-background/60 px-3 py-2 transition-colors hover:text-primary"
                  >
                    <span>{byStatus.get("MAINTENANCE")} unit maintenance</span>
                    <span aria-hidden>→</span>
                  </Link>
                </li>
              )}
              {!needsAttention && (
                <li className="text-muted-foreground">
                  Nggak ada pembayaran tertunda & semua unit sehat. Santai dulu. ☕
                </li>
              )}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}