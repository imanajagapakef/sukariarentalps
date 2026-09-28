import { getGames } from "@/lib/catalog";
import { TableEditor } from "@/components/admin/table-editor";
import type { Column } from "@/components/admin/table-editor";

export const dynamic = "force-dynamic";

const COLUMNS: Column[] = [
  { key: "name", label: "Nama" },
  { key: "developer", label: "Developer" },
  { key: "age_rating", label: "Age Rating" },
  { key: "short_description", label: "Deskripsi" },
];

export default async function AdminGamesPage() {
  const games = await getGames();
  return (
    <div>
      <h1 className="font-display text-2xl uppercase">Games</h1>
      <p className="mt-1 text-sm text-muted-foreground">Katalog + info dasar. Ketersediaan per cabang menyusul.</p>
      <div className="mt-4">
        <TableEditor endpoint="/api/admin/games" idKey="game_id" columns={COLUMNS} rows={games} />
      </div>
    </div>
  );
}
