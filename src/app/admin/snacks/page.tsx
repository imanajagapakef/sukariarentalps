import { getSnacks } from "@/lib/catalog";
import { TableEditor } from "@/components/admin/table-editor";
import type { Column } from "@/components/admin/table-editor";

export const dynamic = "force-dynamic";

const COLUMNS: Column[] = [
  { key: "name", label: "Nama" },
  { key: "category", label: "Kategori" },
  { key: "price", label: "Harga", type: "number" },
  { key: "stock", label: "Stok", type: "number" },
  { key: "min_stock", label: "Min. Stok", type: "number" },
];

export default async function AdminSnacksPage() {
  const snacks = await getSnacks();
  return (
    <div>
      <h1 className="font-display text-2xl uppercase">Snacks</h1>
      <p className="mt-1 text-sm text-muted-foreground">Stok manual di sini; penjualan walk-in/online mengurangi otomatis lewat ledger.</p>
      <div className="mt-4">
        <TableEditor endpoint="/api/admin/snacks" idKey="snack_id" columns={COLUMNS} rows={snacks} />
      </div>
    </div>
  );
}
