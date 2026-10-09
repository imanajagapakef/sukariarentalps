import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { UnitStatusPill } from "@/components/status-pill";
import { StatCards } from "@/components/admin/stat-cards";
import { fmtTime, rp } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const db = createAdminClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86_400_000);

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

  const todayRevenue = (revenue ?? []).reduce((sum, b) => sum + b.total_amount, 0);

  return (
    <div>
      <h1 className="font-display text-2xl uppercase">Dashboard</h1>

      <StatCards
        cards={[
          { label: "Sesi aktif", value: sessions ?? 0, href: "/admin/bookings?status=IN_USE", tone: "primary" },
          { label: "Menunggu bayar", value: waiting ?? 0, href: "/admin/bookings?status=WAITING_PAYMENT", tone: "warning" },
          { label: "Booking aktif", value: activeBookings ?? 0, href: "/admin/bookings" },
          { label: "Omzet hari ini", value: rp(todayRevenue), tone: "primary" },
        ]}
      />

      <h2 className="font-display mt-8 text-xl uppercase">Unit Sekarang</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {(units ?? []).map((u) => (
          <Link
            key={u.unit_id}
            href={`/admin/units?unit=${u.unit_id}`}
            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-3 hover:border-primary"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{u.name}</span>
              <span className="text-xs text-muted-foreground">{u.branches?.short_name}</span>
            </span>
            <UnitStatusPill status={u.status} />
          </Link>
        ))}
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        Jadwal hari ini ada di menu <Link className="text-primary hover:underline" href="/admin/bookings">Booking</Link>.{" "}
        {fmtTime(new Date().toISOString())}
      </p>
    </div>
  );
}
