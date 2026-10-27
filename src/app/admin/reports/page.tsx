import { PageHero } from "@/components/page-hero";
import { CalendarDays, BarChart3 } from "lucide-react";
import Link from "next/link";
import { BookingStatusPill } from "@/components/status-pill";
import { NoPermission } from "@/components/admin/no-permission";
import { StatCards } from "@/components/stat-cards";
import { SelectField } from "@/components/ui/select-field";
import { EmptyState } from "@/components/empty-state";
import { getStaffUser } from "@/lib/authz";
import { fmtDateTime, rp } from "@/lib/format";
import { getBranchOptions } from "@/lib/units-query";
import {
  CHANNEL_LABEL,
  PAYMENT_STATUS_LABEL,
  PRESETS,
  REQUEST_LABEL,
  bookingReport,
  financialJournal,
  gameRequestReport,
  guestReport,
  occupancyReport,
  resolveRange,
  revenueReport,
  windowedRows,
  type BookingReport,
  type ReportBooking,
  type ReportFilters,
} from "@/lib/reports-query";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  ONLINE: "Online Web",
  WALK_IN: "Walk-in POS",
};

/**
 * The design's ring, plus `WAITING_PAYMENT`. It is a mockup with no bookings behind it,
 * and with its six slices the ring accounted for 5 of 6 bookings — so every percentage
 * was a share of a total the reader could not see. DRAFT is the only exclusion: it is a
 * pre-submission row, not a session.
 */
const RING = [
  { key: "WAITING_PAYMENT", label: "Menunggu Bayar" },
  { key: "COMPLETED", label: "Completed" },
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "IN_USE", label: "Check-in / In Use" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "EXPIRED", label: "Expired Timer" },
  { key: "NO_SHOW", label: "No Show" },
] as const;

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<ReportFilters & { preset?: string }>;
}) {
  const params = await searchParams;
  const filters: ReportFilters = { branch: params.branch, from: params.from, to: params.to };
  const range = resolveRange(params.preset, filters);

  // The admin layout only asks "is this an active staff profile". Revenue and unit
  // performance are OWNER/ADMIN information, so the gate lives here. The design's fifth
  // QA state is exactly this: a plain refusal rather than a redirect that looks broken.
  const me = await getStaffUser(["OWNER", "ADMIN"]).catch(() => null);
  if (!me)
    return <NoPermission description="Laporan pendapatan dan performa unit hanya untuk Owner dan Admin. Hubungi owner bila butuh akses." />;

  const [branches, rows] = await Promise.all([getBranchOptions(), windowedRows(filters)]);

  // One windowed query feeds every section. Loading each section's own data is how a
  // revenue total drifts away from the booking count printed beside it.
  const report = bookingReport(rows);
  // Recent-transactions preview = the 25 newest windowed rows, so the section's
  // numbers always agree with the StatCards/Revenue rendered from the same rows.
  const transactions = rows
    .slice()
    .sort((a, b) => b.scheduled_start_at.localeCompare(a.scheduled_start_at))
    .slice(0, 25);

  const branchName = branches.find((b) => b.branch_id === params.branch)?.short_name;

  // The export reads the same params off the request, so the file always matches the
  // screen. The **resolved** range is sent, not the raw filters: a preset like "7 Hari
  // Terakhir" resolves on the server, and passing the preset through would let the export
  // fall back to its own 30-day default while the table showed 7 days.
  const exportQuery = new URLSearchParams({
    ...(filters.branch ? { branch: filters.branch } : {}),
    from: range.from,
    to: range.to,
  }).toString();

  return (
    <div>
      <PageHero
        size="admin"
        title="Reports"
        titleIcon={BarChart3}
        eyebrow={{ icon: CalendarDays, label: `${range.from} → ${range.to}` }}
        description={`Laporan operasional ${range.from} s/d ${range.to}${branchName ? ` · ${branchName}` : " · semua cabang"}`}
      />

      <form className="mt-4 flex flex-wrap items-end gap-2" method="get">
        <SelectField
          name="preset"
          defaultValue={params.preset ?? "d30"}
          aria-label="Periode"
          className="w-auto"
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </SelectField>
        <label className="text-xs text-muted-foreground">
          Dari
          <input
            type="date"
            name="from"
            defaultValue={range.from}
            className="mt-1 block h-12 rounded-lg border border-input bg-card px-3 text-sm"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Sampai
          <input
            type="date"
            name="to"
            defaultValue={range.to}
            className="mt-1 block h-12 rounded-lg border border-input bg-card px-3 text-sm"
          />
        </label>
        <SelectField
          name="branch"
          defaultValue={params.branch ?? ""}
          aria-label="Cabang"
          className="w-auto"
        >
          <option value="">Semua cabang</option>
          {branches.map((b) => (
            <option key={b.branch_id} value={b.branch_id}>
              {b.short_name ?? b.name}
            </option>
          ))}
        </SelectField>
        <button
          type="submit"
          className="h-12 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Terapkan
        </button>
        {/* Same params the table was built from, so the file always matches the screen.
            `prefetch={false}` — a prefetched report download is a wasted query. */}
        <Link
          href={`/api/admin/reports/export${exportQuery ? `?${exportQuery}` : ""}`}
          prefetch={false}
          className="inline-flex h-12 items-center rounded-lg border border-input px-4 text-sm font-medium transition-colors hover:bg-accent"
        >
          Export CSV
        </Link>
      </form>

      {report.total === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Tidak ada booking di periode ini"
            description="Coba perlebar rentang tanggal atau pilih cabang lain."
          />
        </div>
      ) : (
        <>
          <StatCards
            cards={[
              { label: "Total booking", value: report.total },
              { label: "Menunggu bayar", value: report.byStatus.WAITING_PAYMENT ?? 0, tone: "warning" },
              { label: "Confirmed", value: report.byStatus.CONFIRMED ?? 0, tone: "primary" },
              { label: "Completed", value: report.byStatus.COMPLETED ?? 0 },
              { label: "Cancelled", value: report.byStatus.CANCELLED ?? 0, tone: "danger" },
              { label: "Expired", value: report.byStatus.EXPIRED ?? 0, tone: "warning" },
              { label: "No show", value: report.byStatus.NO_SHOW ?? 0, tone: "warning" },
              { label: "Online web", value: report.bySource.online, tone: "primary" },
              { label: "Walk-in POS", value: report.bySource.walkIn },
            ]}
          />

          <BookingSection report={report} transactions={transactions} />
          <RevenueSection rows={rows} />
          <OccupancySection rows={rows} filters={filters} />
          <GameRequestSection />
          <GuestSection rows={rows} />
        </>
      )}
    </div>
  );
}

/** Section 4 — the request pipeline. `Most Played Games` has no data behind it. */
async function GameRequestSection() {
  const req = await gameRequestReport(8);

  return (
    <>
      <h2 className="font-display mt-8 text-xl uppercase">4. Game &amp; Request</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {req.total} judul diminta tamu.
      </p>

      {req.byStatus.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Belum ada permintaan game.</p>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {req.byStatus.map((s) => (
              <div key={s.status} className="rounded-xl border border-border p-4">
                <p className="text-xs uppercase text-muted-foreground">{s.label}</p>
                <p className="font-display mt-1 text-2xl">{s.count}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.votes} suara</p>
              </div>
            ))}
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-144 text-sm">
              <thead className="bg-surface-container text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Judul</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Suara</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Diajukan</th>
                </tr>
              </thead>
              <tbody>
                {req.top.map((r) => (
                  <tr key={r.request_id} className="border-t border-border transition-colors hover:bg-accent/40">
                    <td className="px-4 py-2 font-medium">{r.game_name}</td>
                    <td className="px-4 py-2 text-xs uppercase text-muted-foreground">
                      {REQUEST_LABEL[r.status] ?? r.status}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">{r.vote_count}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                      {fmtDateTime(r.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        &ldquo;Most Played Games&rdquo; tidak ditampilkan: aplikasi tidak pernah mencatat game mana
        yang dimainkan pada sebuah booking, jadi angka sesi dan jam main tidak bisa dihitung
        dari data yang ada.
      </p>
    </>
  );
}

/** Section 5 — guests and retention. */
async function GuestSection({ rows }: { rows: ReportBooking[] }) {
  const guests = await guestReport(rows, 10);

  return (
    <>
      <h2 className="font-display mt-8 text-xl uppercase">5. Tamu &amp; Retensi</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {guests.uniqueGuests} tamu unik. Tamu baru dihitung dari kunjungan pertama-ever, bukan
        hanya dari periode ini.
      </p>

      <StatCards
        cards={[
          { label: "Tamu unik", value: guests.uniqueGuests },
          { label: "Tamu baru", value: guests.newGuests, tone: "primary" },
          { label: "Tamu kembali", value: guests.returningGuests },
          {
            label: "Durasi rata-rata",
            value: `${guests.averageSessionHours.toFixed(1)} jam`,
          },
          { label: "ARPU", value: rp(guests.arpu), tone: "primary" },
        ]}
      />

      <h3 className="mt-6 text-sm font-medium">Tamu teratas</h3>
      {guests.topGuests.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Belum ada tamu di periode ini.</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-232 text-sm">
            <thead className="bg-surface-container text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Tamu</th>
                <th scope="col" className="px-4 py-3 font-semibold">Cabang favorit</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Booking</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Selesai</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Batal</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Rental</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Snack</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Nilai sesi</th>
                <th scope="col" className="px-4 py-3 font-semibold">Kunjungan terakhir</th>
              </tr>
            </thead>
            <tbody>
              {guests.topGuests.map((g) => (
                <tr key={g.customer_id} className="border-t border-border align-top transition-colors hover:bg-accent/40">
                  <td className="px-4 py-2">
                    <span className="block font-medium">
                      {g.name}
                      {g.isNew && (
                        <span className="ml-1.5 text-xs text-primary">baru</span>
                      )}
                    </span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {g.customer_id}
                      {g.phone ? ` · ${g.phone}` : ""}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                    {g.favouriteBranch}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{g.totalBookings}</td>
                  <td className="px-4 py-2 text-right font-mono text-primary">{g.completed}</td>
                  <td className="px-4 py-2 text-right font-mono text-muted-foreground">
                    {g.cancelled}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right font-mono">{rp(g.totalRental)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right font-mono">{rp(g.totalSnacks)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right font-mono font-medium">
                    {rp(g.netSpending)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                    {g.lastVisit ? fmtDateTime(g.lastVisit) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        &ldquo;Nilai sesi&rdquo; adalah nilai yang ditagihkan, bukan kas masuk — pembayaran yang
        belum selesai tidak dihitung sebagai pendapatan di section 2. Tipe member tidak
        ditampilkan karena belum ada tabel keanggotaan di sistem.
      </p>
    </>
  );
}

/** Section 3 — occupancy. Reads units and their status history. */
async function OccupancySection({
  rows,
  filters,
}: {
  rows: ReportBooking[];
  filters: ReportFilters;
}) {
  const occ = await occupancyReport(rows, filters);
  const hrs = (n: number) => `${Math.round(n).toLocaleString("id-ID")} jam`;
  const busiest = Math.max(...occ.hourly.map((h) => h.bookedHours), 0);

  const HEAT = (share: number) =>
    share <= 0
      ? "bg-surface-container text-muted-foreground"
      : share > 0.66
        ? "bg-primary text-primary-foreground"
        : share > 0.33
          ? "bg-primary/60"
          : "bg-primary/30";

  return (
    <>
      <h2 className="font-display mt-8 text-xl uppercase">3. Unit Occupancy</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {occ.unitCount} unit × {occ.days} hari. Jam tersedia = unit × 24 jam × hari.
      </p>

      <StatCards
        cards={[
          { label: "Total unit", value: occ.unitCount },
          { label: "Jam tersedia", value: hrs(occ.availableHours) },
          { label: "Dipakai", value: hrs(occ.usedHours), tone: "primary" },
          { label: "Dipesan", value: hrs(occ.bookedHours) },
          { label: "Sanitasi", value: hrs(occ.sanitationHours), tone: occ.sanitationHours > 0 ? "warning" : "muted" },
          { label: "Maintenance", value: hrs(occ.maintenanceHours), tone: occ.maintenanceHours > 0 ? "danger" : "muted" },
          {
            label: "Occupancy rate",
            value: `${(occ.occupancyRate * 100).toFixed(1)}%`,
            tone: occ.occupancyRate > 0.6 ? "primary" : "muted",
          },
        ]}
      />

      {occ.byBranch.length > 1 && (
        <p className="mt-2 text-sm text-muted-foreground">
          {occ.byBranch.map((b) => `${b.label}: ${b.count}`).join(" · ")}
        </p>
      )}

      <h3 className="mt-6 text-sm font-medium">Kepadatan per jam (WIB)</h3>
      <p className="text-xs text-muted-foreground">
        Jumlah sesi yang mulai di jam tersebut, relatif terhadap jam tersibuk.
      </p>
      <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-8 lg:grid-cols-12">
        {occ.hourly.map((h) => {
          const share = busiest === 0 ? 0 : h.bookedHours / busiest;
          return (
            <div
              key={h.hour}
              className={`rounded-lg p-2 text-center ${HEAT(share)}`}
              title={`${String(h.hour).padStart(2, "0")}:00 · ${h.sessions} sesi · ${hrs(h.bookedHours)}`}
            >
              <p className="font-mono text-[10px] opacity-80">
                {String(h.hour).padStart(2, "0")}
              </p>
              <p className="font-display text-sm leading-tight">{h.sessions}</p>
            </div>
          );
        })}
      </div>

      <h3 className="mt-6 text-sm font-medium">Utilisasi per bilik</h3>
      <div className="mt-2 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-216 text-sm">
          <thead className="bg-surface-container text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Unit</th>
              <th scope="col" className="px-4 py-3 font-semibold">Cabang</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Tersedia</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Dipakai</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Dipesan</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Sanitasi</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Maintenance</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Okupansi</th>
            </tr>
          </thead>
          <tbody>
            {occ.perUnit.map((u) => (
              <tr key={u.unit_id} className="border-t border-border transition-colors hover:bg-accent/40">
                <td className="px-4 py-2">
                  <span className="block font-medium">{u.name}</span>
                  <span className="block font-mono text-xs text-muted-foreground">{u.unit_id}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{u.branch}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-muted-foreground">
                  {Math.round(u.availableHours)}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-mono">{Math.round(u.usedHours)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-muted-foreground">
                  {Math.round(u.bookedHours)}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-muted-foreground">
                  {Math.round(u.sanitationHours)}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-muted-foreground">
                  {Math.round(u.maintenanceHours)}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-mono">
                  {(u.occupancyRate * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Section 1 — counting. Pure arithmetic over the rows the page already has. */
function BookingSection({
  report,
  transactions,
}: {
  report: BookingReport;
  transactions: ReportBooking[];
}) {
  const pct = (n: number) => (report.total === 0 ? "0%" : `${((n / report.total) * 100).toFixed(1)}%`);

  return (
    <>
      <h2 className="font-display mt-8 text-xl uppercase">1. Booking Report</h2>

      <div className="mt-3 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border p-4 lg:col-span-2">
          <h3 className="text-sm font-medium">Tren Booking Harian</h3>
          <p className="text-xs text-muted-foreground">
            Rata-rata {report.averagePerDay.toFixed(1)} sesi/hari
            {report.peakHour &&
              ` · puncak ${String(report.peakHour.hour).padStart(2, "0")}:00 WIB`}
          </p>
          {/* Bars rather than a chart library: a handful of points, and a dependency to
              draw them would be more code than the chart. Each column must be h-full —
              a percentage height resolves against an auto-height parent as 0, which
              renders an empty chart. */}
          <div className="mt-4 flex h-40 items-stretch gap-1">
            {report.daily.map((d) => {
              const max = Math.max(...report.daily.map((x) => x.total));
              const h = max === 0 ? 0 : Math.round((d.total / max) * 100);
              return (
                <div
                  key={d.day}
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                >
                  <span className="text-[10px] text-muted-foreground">{d.total}</span>
                  <div
                    className="min-h-px w-full max-w-14 rounded-t bg-primary/70"
                    style={{ height: `${h}%` }}
                    title={`${d.day}: ${d.total} sesi`}
                  />
                  <span className="w-full truncate text-center text-[10px] text-muted-foreground">
                    {d.day.slice(8)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-border p-4">
          <h3 className="text-sm font-medium">Distribusi Status</h3>
          <p className="text-xs text-muted-foreground">{report.total} pencatatan status</p>
          <ul className="mt-3 space-y-1.5">
            {RING.map((r) => {
              const n = report.byStatus[r.key] ?? 0;
              return (
                <li key={r.key} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-muted-foreground">{r.label}</span>
                  <span className="font-mono">
                    {n} <span className="text-xs text-muted-foreground">({pct(n)})</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <h3 className="mt-6 text-sm font-medium">
        Transaksi terbaru · {transactions.length} dari {report.total}
      </h3>
      <div className="mt-2 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-224 text-sm">
          <thead className="bg-surface-container text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Kode</th>
              <th scope="col" className="px-4 py-3 font-semibold">Sesi</th>
              <th scope="col" className="px-4 py-3 font-semibold">Tamu</th>
              <th scope="col" className="px-4 py-3 font-semibold">Unit</th>
              <th scope="col" className="px-4 py-3 font-semibold">Sumber</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Durasi</th>
              <th scope="col" className="px-4 py-3 font-semibold">Status</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((b) => (
              <tr key={b.booking_id} className="border-t border-border align-top transition-colors hover:bg-accent/40">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{b.booking_code}</td>
                <td className="whitespace-nowrap px-4 py-3">{fmtDateTime(b.scheduled_start_at)}</td>
                <td className="px-4 py-3">
                  <span className="block font-medium">{b.customers?.name ?? "—"}</span>
                  <span className="block text-xs text-muted-foreground">{b.customers?.phone}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="block">{b.units?.name ?? "—"}</span>
                  <span className="block text-xs text-muted-foreground">
                    {b.units?.branches?.short_name ?? b.units?.branches?.name}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs uppercase text-muted-foreground">
                  {SOURCE_LABEL[b.source] ?? b.source}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {b.duration_minutes >= 60
                    ? `${(b.duration_minutes / 60).toFixed(b.duration_minutes % 60 === 0 ? 0 : 1)} Jam`
                    : `${b.duration_minutes} mnt`}
                </td>
                <td className="px-4 py-3">
                  <BookingStatusPill status={b.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium">
                  {rp(b.total_amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Section 2 — money. Async because it reads payments and line items. */
async function RevenueSection({ rows }: { rows: ReportBooking[] }) {
  const [revenue, journal] = await Promise.all([revenueReport(rows), financialJournal(rows, 15)]);
  const share = (n: number) =>
    revenue.gross === 0 ? "—" : `${((n / revenue.gross) * 100).toFixed(1)}%`;

  return (
    <>
      <h2 className="font-display mt-8 text-xl uppercase">2. Revenue &amp; Finansial</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {revenue.collectedCount} transaksi sudah dibayar. Pembayaran yang masih menunggu atau
        gagal tidak dihitung sebagai pendapatan.
      </p>

      <div className="mt-3 grid gap-4 lg:grid-cols-3">
        <div className="space-y-2 lg:col-span-2">
          <Line label="Gross revenue (kotor)" value={rp(revenue.gross)} />
          <Line label="Rental konsol" value={rp(revenue.rental)} note={`${share(revenue.rental)} dari gross`} />
          <Line label="Snack & F&B" value={rp(revenue.snack)} note={`${share(revenue.snack)} dari gross`} />
          <Line
            label="Refund"
            value={revenue.refund === 0 ? rp(0) : `-${rp(revenue.refund)}`}
            note="nilai transaksi yang direfund"
          />
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
            <p className="text-xs uppercase text-muted-foreground">Net realized</p>
            <p className="font-display mt-1 text-2xl text-primary">{rp(revenue.net)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Gross dikurangi refund. Diskon sudah ikut terpotong dari gross karena yang
              masuk ke kas adalah total akhir.
            </p>
            {/* Only bookings whose money was collected: a promo on an unpaid or cancelled
                booking cost nothing, and listing it as a loss would overstate the give-away. */}
            <p className="mt-2 text-xs text-muted-foreground">
              Diskon promo: <strong className="text-foreground">{rp(revenue.discount)}</strong> dari{" "}
              {revenue.discountedCount} booking terbayar
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border p-4">
            <h3 className="text-sm font-medium">Kanal pembayaran</h3>
            {revenue.byChannel.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Belum ada pembayaran masuk.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {revenue.byChannel.map((c) => (
                  <li key={c.key} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate text-muted-foreground">
                      {c.label}
                      <span className="ml-1 text-xs">({c.count})</span>
                    </span>
                    <span className="whitespace-nowrap font-mono">{rp(c.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-border p-4">
            <h3 className="text-sm font-medium">Status pembayaran</h3>
            {revenue.byStatus.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Belum ada transaksi.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {revenue.byStatus.map((s) => (
                  <li key={s.status} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate text-muted-foreground">
                      {s.label}
                      <span className="ml-1 text-xs">({s.count})</span>
                    </span>
                    <span className="whitespace-nowrap font-mono">{rp(s.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <h3 className="mt-6 text-sm font-medium">Jurnal transaksi keuangan</h3>
      {journal.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Belum ada pembayaran di periode ini.</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-208 text-sm">
            <thead className="bg-surface-container text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Tanggal</th>
                <th scope="col" className="px-4 py-3 font-semibold">Kode</th>
                <th scope="col" className="px-4 py-3 font-semibold">Tamu</th>
                <th scope="col" className="px-4 py-3 font-semibold">Kanal</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Rental</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Snack</th>
                {/* "Tagihan", not the design's "Net diterima": this column is
                    gross_amount, which for a PENDING row is an invoice rather than
                    cash in the till. Uncollected rows are dimmed so the two are not
                    confused at a glance. */}
                <th scope="col" className="px-4 py-3 text-right font-semibold">Tagihan</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {journal.map((j) => (
                <tr
                  key={j.payment_id}
                  className={`border-t border-border align-top transition-colors hover:bg-accent/40 ${
                    j.collected ? "" : "text-muted-foreground"
                  }`}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {j.paid_at ? fmtDateTime(j.paid_at) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                    {j.booking?.booking_code ?? "—"}
                  </td>
                  <td className="px-4 py-3">{j.booking?.customers?.name ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs uppercase text-muted-foreground">
                    {j.method ? CHANNEL_LABEL[j.method] ?? j.method : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{rp(j.rental)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{rp(j.snack)}</td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 text-right font-medium ${
                      j.refunded ? "text-danger" : ""
                    }`}
                  >
                    {j.refunded ? `-${rp(j.gross)}` : rp(j.gross)}
                  </td>
                  <td className="px-4 py-3 text-xs uppercase text-muted-foreground">
                    {PAYMENT_STATUS_LABEL[j.status] ?? j.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Line({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2">
      <span className="text-sm text-muted-foreground">
        {label}
        {note && <span className="ml-2 text-xs">{note}</span>}
      </span>
      <span className="font-mono text-sm">{value}</span>
    </div>
  );
}