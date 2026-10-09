import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, rp } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { StatCards } from "@/components/admin/stat-cards";

/**
 * Customer directory. RLS on customers is OWNER/ADMIN/STAFF, so the cookie-scoped
 * client is the gate; totals_booking / total_spending are maintained by
 * find_or_create_customer and the booking RPCs.
 */
export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const db = await createClient();

  const { data, error } = await db
    .from("customers")
    .select(
      "customer_id, name, phone, email, total_booking, total_spending, first_booking_at, last_booking_at, created_at",
    )
    .order("last_booking_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (error) throw new Error(error.message);

  const needle = (q ?? "").toLowerCase().trim();
  const rows = (data ?? []).filter((c) =>
    !needle
      ? true
      : [c.name, c.phone, c.email].filter(Boolean).some((v) => String(v).toLowerCase().includes(needle)),
  );

  const spend = rows.reduce((s, c) => s + c.total_spending, 0);
  const active = rows.filter((c) => c.total_booking > 0).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <p className="font-display text-sm uppercase tracking-[0.06em] text-primary">CRM</p>
      <h1 className="font-display mt-2 text-3xl uppercase md:text-4xl">Pelanggan</h1>

        <StatCards
          cards={[
            { label: "Total pelanggan", value: rows.length },
            { label: "Pernah booking", value: `${active} dari ${rows.length}`, tone: "primary" },
            { label: "Total transaksi", value: rp(spend), tone: "primary" },
          ]}
        />

      <form className="mt-5 flex flex-wrap items-center gap-2" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder="Cari nama, nomor, atau email…"
          aria-label="Cari pelanggan"
          className="h-10 w-full max-w-xs rounded-lg border border-input bg-card px-3 text-sm"
        />
        <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
          Cari
        </button>
      </form>

      {rows.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Pelanggan tidak ketemu" description="Coba kata kunci lain." />
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3">Nama</th>
                <th scope="col" className="px-4 py-3">Kontak</th>
                <th scope="col" className="px-4 py-3">Booking</th>
                <th scope="col" className="px-4 py-3">Nilai</th>
                <th scope="col" className="px-4 py-3">Terakhir main</th>
                <th scope="col" className="px-4 py-3">Riwayat</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.customer_id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <span className="font-medium">{c.name}</span>
                    <span className="block text-xs text-muted-foreground">{c.customer_id}</span>
                  </td>
                  <td className="px-4 py-3">
                    {c.phone ? (
                      <a
                        href={`https://wa.me/${c.phone.replace(/[^0-9]/g, "")}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-primary hover:underline"
                      >
                        {c.phone}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {c.email && <span className="block text-xs text-muted-foreground">{c.email}</span>}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{c.total_booking}</td>
                  <td className="px-4 py-3 tabular-nums">{rp(c.total_spending)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {c.last_booking_at ? fmtDate(c.last_booking_at) : "belum pernah"}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/bookings?q=${encodeURIComponent(c.phone ?? c.name)}`}
                      className="text-sm text-primary hover:underline"
                    >
                      Lihat booking →
                    </Link>
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

