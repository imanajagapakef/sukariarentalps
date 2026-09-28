import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { UnitStatusPill } from "@/components/status-pill";
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

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Sesi aktif", value: sessions ?? 0, href: "/admin/bookings?status=IN_USE", tone: "text-primary" },
          { label: "Menunggu bayar", value: waiting ?? 0, href: "/admin/bookings?status=WAITING_PAYMENT", tone: "text-warning" },
          { label: "Booking aktif", value: activeBookings ?? 0, href: "/admin/bookings", tone: "" },
          { label: "Omzet hari ini", value: rp(todayRevenue), href: null, tone: "text-primary" },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs uppercase text-muted-foreground">{c.label}</p>
            <p className={`font-display mt-1 text-2xl ${c.tone}`}>{c.value}</p>
            {c.href && (
              <Link href={c.href} className="text-xs text-primary hover:underline">
                Lihat →
              </Link>
            )}
          </div>
        ))}
      </div>

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
