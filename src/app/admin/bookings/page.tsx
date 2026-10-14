import Link from "next/link";
import { BookingStatusPill } from "@/components/status-pill";
import { ActionButtons } from "@/components/admin/action-buttons";
import { hasBookingActions } from "@/lib/booking-actions";
import { fmtDateTime, fmtDuration, fmtTime, rp } from "@/lib/format";
import { SelectField } from "@/components/ui/select-field";
import { StatCards } from "@/components/admin/stat-cards";
import { EmptyState } from "@/components/empty-state";
import { STATUSES, countWaitingPayment, listBookings } from "@/lib/bookings-query";

export const dynamic = "force-dynamic";

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; date?: string }>;
}) {
  const filters = await searchParams;
  const { status, q, date } = filters;
  const rows = await listBookings(filters);
  const pendingCount = status ? 0 : await countWaitingPayment().catch(() => 0);

  // The page already holds up to 60 bookings (whatever the filters selected), so the
  // strip reads off those rows. When a filter is active these describe the filtered
  // set, not the whole book — which is the more useful thing to show anyway.
  const byStatus = (s: string) => rows.filter((b) => b.status === s).length;
  const revenue = rows
    .filter((b) => !["DRAFT", "CANCELLED", "EXPIRED"].includes(b.status))
    .reduce((sum, b) => sum + b.total_amount, 0);

  // Export reads the same params straight off the request, so the file always
  // matches the table it was clicked from.
  const exportParams = new URLSearchParams(
    Object.entries(filters).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  ).toString();
  const exportHref = `/api/admin/bookings/export${exportParams ? `?${exportParams}` : ""}`;

  // Only worth a column while something is actually waiting. Rendered on the server,
  // no per-row timer: LiveRefresh already re-renders the page every 60s, so these stay
  // close to current without N setInterval loops competing on the main thread.
  const showDeadlineColumn = rows.some((b) => b.status === "WAITING_PAYMENT");
  const now = Date.now();

/**
 * Relative time left on the payment window. The absolute time is rendered beside it
 * because this text is server-rendered and can be up to a refresh cycle stale - the
 * absolute one never lies, and "kurang dari 1 menit" would be the worst thing to
 * show a cashier who is about to release a paid slot.
 */
function deadlineHint(deadlineIso: string, nowMs: number) {
  const minutes = Math.round((Date.parse(deadlineIso) - nowMs) / 60_000);
  if (minutes <= 0) return "lewat — akan dilepas";
  if (minutes < 60) return `sisa ${minutes} menit`;
  const hours = Math.floor(minutes / 60);
  return `sisa ${hours} jam ${minutes % 60} menit`;
}

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl uppercase">Bookings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length} booking terbaru{Math.min(rows.length, 60) === 60 ? ", dibatasi 60 baris" : ""}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={exportHref}
            prefetch={false}
            className="inline-flex h-10 items-center rounded-lg border border-input px-3 text-sm font-medium hover:bg-accent"
          >
            Export CSV
          </Link>
          <Link
            href="/admin/walk-in"
            className="inline-flex h-10 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            + Walk-in
          </Link>
        </div>
      </div>

      <StatCards
        cards={[
          { label: "Ditampilkan", value: rows.length },
          { label: "Aktif", value: byStatus("CONFIRMED"), tone: "primary" },
          { label: "Dipakai", value: byStatus("IN_USE") },
          { label: "Menunggu bayar", value: byStatus("WAITING_PAYMENT"), tone: "warning" },
          { label: "Dibatalkan", value: byStatus("CANCELLED"), tone: "danger" },
          { label: "Nilai terfilter", value: rp(revenue), tone: "primary" },
        ]}
      />

      <form className="mt-4 flex flex-wrap gap-2" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder="Kode / nama / no. HP"
          aria-label="Cari booking"
          className="h-12 w-52 rounded-lg border border-input bg-card px-3 text-sm"
        />
        <input
          type="date"
          name="date"
          defaultValue={date}
          aria-label="Tanggal"
          className="h-12 rounded-lg border border-input bg-card px-3 text-sm"
        />
        <SelectField name="status" defaultValue={status ?? ""} aria-label="Status" className="w-auto">
          <option value="">Semua status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </SelectField>
        <button type="submit" className="h-12 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
          Filter
        </button>
      </form>

      {/* Nothing settles on its own any more, so the cashier has to come looking for
          the queue. This puts it one click away instead of behind the status dropdown. */}
      {!status && pendingCount > 0 && (
        <Link
          href="/admin/bookings?status=WAITING_PAYMENT"
          className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-warning/50 bg-warning/10 px-4 py-3 text-sm transition-colors hover:bg-warning/20"
        >
          <span>
            <span className="font-bold text-foreground">
              {pendingCount} booking menunggu konfirmasi pembayaran
            </span>
            <span className="block text-xs text-muted-foreground">
              Urutan paling mendesak lebih dulu. Cek mutasi, lalu tekan Konfirmasi.
            </span>
          </span>
          <span className="shrink-0 font-bold uppercase text-warning">Buka antrean</span>
        </Link>
      )}

      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Tidak ada booking" description="Coba longgarkan filter pencarian." />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[60rem] text-sm">
            <thead className="bg-surface-container text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Kode</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="px-4 py-3 font-semibold">Customer</th>
                <th scope="col" className="px-4 py-3 font-semibold">Unit</th>
                <th scope="col" className="px-4 py-3 font-semibold">Jadwal</th>
                {showDeadlineColumn && (
                  <th scope="col" className="px-4 py-3 font-semibold">Batas Bayar</th>
                )}
                <th scope="col" className="px-4 py-3 text-right font-semibold">Durasi</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Total</th>
                <th scope="col" className="px-4 py-3 font-semibold">Sumber</th>
                <th scope="col" className="px-4 py-3 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.booking_id} className="border-t border-border align-top hover:bg-accent/40">
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link
                      href={`/tiket/${b.booking_code}`}
                      className="font-display uppercase tracking-wide hover:underline"
                    >
                      {b.booking_code}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <BookingStatusPill status={b.status} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="block font-medium">{b.customers?.name ?? "—"}</span>
                    <span className="block text-xs text-muted-foreground">{b.customers?.phone}</span>
                  </td>
                  <td className="px-4 py-3">{b.units?.name ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="block">{fmtDateTime(b.scheduled_start_at)}</span>
                    <span className="block text-xs text-muted-foreground">
                      s/d {fmtTime(b.scheduled_end_at)}
                    </span>
                  </td>
                  {showDeadlineColumn && (
                    <td className="whitespace-nowrap px-4 py-3">
                      {b.payment_deadline_at ? (
                        <>
                          <span className="block text-xs">
                            {fmtDateTime(b.payment_deadline_at)}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {deadlineHint(b.payment_deadline_at, now)}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  )}
                  <td className="whitespace-nowrap px-4 py-3 text-right">{fmtDuration(b.duration_minutes)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium">{rp(b.total_amount)}</td>
                  <td className="px-4 py-3 text-xs uppercase text-muted-foreground">{b.source ?? "—"}</td>
                  <td className="px-4 py-3">
                    {hasBookingActions(b.status) ? (
                      <ActionButtons code={b.booking_code} status={b.status} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
