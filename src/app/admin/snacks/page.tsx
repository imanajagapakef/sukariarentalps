import { getSnacks } from "@/lib/catalog";
import { TableEditor } from "@/components/admin/table-editor";
import type { Column } from "@/components/admin/table-editor";
import { StatCards } from "@/components/admin/stat-cards";
import { fmtDateTime, rp } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const COLUMNS: Column[] = [
  { key: "image_url", label: "Foto", type: "image" },
  { key: "name", label: "Nama" },
  { key: "category", label: "Kategori" },
  { key: "price", label: "Harga", type: "number" },
  { key: "stock", label: "Stok", type: "number" },
  { key: "min_stock", label: "Min. Stok", type: "number" },
];

const MOVEMENT_LABEL: Record<string, string> = {
  IN: "Masuk",
  OUT: "Keluar",
  SALE: "Terjual",
  ADJUSTMENT: "Koreksi",
};

const MOVEMENT_TONE: Record<string, string> = {
  IN: "text-primary",
  SALE: "text-warning",
  OUT: "text-danger",
  ADJUSTMENT: "text-on-surface-variant",
};

export default async function AdminSnacksPage() {
  const snacks = await getSnacks();

  // Stock health, computed off the rows already loaded. MENIPIS / HABIS is the signal
  // the design leads this page with and it was previously absent entirely — with no
  // stock-health state, "stok" was a number nobody could act on.
  const out = snacks.filter((s) => s.stock <= 0).length;
  const low = snacks.filter((s) => s.stock > 0 && s.min_stock > 0 && s.stock <= s.min_stock).length;
  const stockValue = snacks.reduce((sum, s) => sum + s.price * s.stock, 0);

  // The ledger is the only record of who moved stock and why, so it is read here
  // rather than inferred. inventory_movements is RLS-restricted to staff, so this
  // needs the service client.
  const db = createAdminClient();
  const { data: movements } = await db
    .from("inventory_movements")
    .select("id, snack_id, movement_type, qty_delta, stock_after, reason, created_at, snacks(name)")
    .order("created_at", { ascending: false })
    .limit(25);

  return (
    <div>
      <h1 className="font-display text-2xl uppercase">Snacks</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Stok di sini tercatat sebagai movement, jadi setiap perubahan punya jejak.
      </p>
      <StatCards
        cards={[
          { label: "Menu aktif", value: snacks.length },
          { label: "Stok habis", value: out, tone: out > 0 ? "danger" : "muted" },
          { label: "Stok menipis", value: low, tone: low > 0 ? "warning" : "muted" },
          { label: "Nilai stok", value: rp(stockValue), tone: "primary" },
        ]}
      />
      <div className="mt-4">
        <TableEditor
          endpoint="/api/admin/snacks"
          idKey="snack_id"
          columns={COLUMNS}
          rows={snacks}
          mediaPrefix="snacks"
        />
      </div>

      <h2 className="font-display mt-8 text-xl uppercase">Riwayat Stok</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        25 movement terakhir. Otomatis dari penjualan dan pembatalan booking, plus setiap
        koreksi manual di tabel di atas.
      </p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-container text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-semibold">Waktu</th>
              <th className="px-3 py-2 font-semibold">Item</th>
              <th className="px-3 py-2 font-semibold">Jenis</th>
              <th className="px-3 py-2 text-right font-semibold">Delta</th>
              <th className="px-3 py-2 text-right font-semibold">Sisa</th>
              <th className="px-3 py-2 font-semibold">Alasan</th>
            </tr>
          </thead>
          <tbody>
            {(movements ?? []).map((m) => (
              <tr key={m.id} className="border-b border-border/60 last:border-0">
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                  {fmtDateTime(m.created_at)}
                </td>
                <td className="px-3 py-2">{m.snacks?.name ?? m.snack_id}</td>
                <td className={MOVEMENT_TONE[m.movement_type] ?? ""}>
                  {MOVEMENT_LABEL[m.movement_type] ?? m.movement_type}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {m.qty_delta > 0 ? `+${m.qty_delta}` : m.qty_delta}
                </td>
                <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                  {m.stock_after}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{m.reason ?? "—"}</td>
              </tr>
            ))}
            {(movements ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  Belum ada movement stok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
