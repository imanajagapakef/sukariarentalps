import Link from "next/link";
import type { Database } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import { BookingStatusPill } from "@/components/status-pill";
import { ActionButtons } from "@/components/admin/action-buttons";
import { fmtDateTime, rp } from "@/lib/format";

export const dynamic = "force-dynamic";

type BookingStatus = Database["public"]["Enums"]["booking_status"];

const STATUSES = [
  "WAITING_PAYMENT",
  "CONFIRMED",
  "IN_USE",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "NO_SHOW",
] as const satisfies readonly BookingStatus[];

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; date?: string }>;
}) {
  const { status, q, date } = await searchParams;
  const db = createAdminClient();

  let query = db
    .from("bookings")
    .select(
      "booking_id, booking_code, status, scheduled_start_at, scheduled_end_at, duration_minutes, total_amount, source, units(name), customers(name, phone)",
    )
    .order("scheduled_start_at", { ascending: false })
    .limit(60);

  if (status && (STATUSES as readonly string[]).includes(status)) query = query.eq("status", status as BookingStatus);
  if (date) query = query.gte("scheduled_start_at", `${date}T00:00:00+07:00`).lt("scheduled_start_at", `${date}T23:59:59+07:00`);
  if (q) {
    const term = `%${q.replace(/[%_]/g, "")}%`;
    query = query.or(`booking_code.ilike.${term},customers.name.ilike.${term},customers.phone.ilike.${term}`);
  }

  const { data: bookings, error } = await query;
  if (error) throw new Error(error.message);

  return (
    <div>
      <h1 className="font-display text-2xl uppercase">Booking</h1>

      <form className="mt-4 flex flex-wrap gap-2" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder="Kode / nama / no. HP"
          aria-label="Cari booking"
          className="h-9 w-52 rounded-lg border border-input bg-card px-3 text-sm"
        />
        <input type="date" name="date" defaultValue={date} aria-label="Tanggal" className="h-9 rounded-lg border border-input bg-card px-3 text-sm" />
        <select name="status" defaultValue={status ?? ""} aria-label="Status" className="h-9 rounded-lg border border-input bg-card px-2 text-sm">
          <option value="">Semua status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
          Filter
        </button>
      </form>

      <div className="mt-4 space-y-2">
        {(bookings ?? []).length === 0 && <p className="text-sm text-muted-foreground">Tidak ada booking cocok.</p>}
        {(bookings ?? []).map((b) => (
          <div key={b.booking_id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/tiket/${b.booking_code}`} className="font-display uppercase tracking-wide hover:underline">
                  {b.booking_code}
                </Link>
                <BookingStatusPill status={b.status} />
                <span className="text-xs text-muted-foreground">{b.source}</span>
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {b.units?.name} · {b.customers?.name} ({b.customers?.phone}) · {fmtDateTime(b.scheduled_start_at)} ·{" "}
                {b.duration_minutes} mnt · {rp(b.total_amount)}
              </p>
            </div>
            <ActionButtons code={b.booking_code} status={b.status} source={b.source} />
          </div>
        ))}
      </div>
    </div>
  );
}
