import { getGames } from "@/lib/catalog";
import { TableEditor } from "@/components/admin/table-editor";
import type { Column } from "@/components/admin/table-editor";
import { StatCards } from "@/components/admin/stat-cards";

export const dynamic = "force-dynamic";

const COLUMNS: Column[] = [
  { key: "image_url", label: "Cover", type: "image" },
  { key: "name", label: "Nama" },
  { key: "developer", label: "Developer" },
  // These two were backfilled in migration 0017 but had no column here, so the data
  // existed in the database and was invisible and uneditable in the only screen that
  // manages it.
  { key: "publisher", label: "Publisher" },
  { key: "release_date", label: "Rilis", type: "date" },
  { key: "age_rating", label: "Age Rating" },
  { key: "short_description", label: "Deskripsi" },
];

export default async function AdminGamesPage() {
  const games = await getGames();

  // Data-quality readouts. These are the two things the table itself cannot tell you
  // at a glance: 58 rows all looking equally "filled" while the cover and the
  // developer/publisher/date columns are silently empty.
  const withCover = games.filter((g) => g.image_url).length;
  const withMeta = games.filter((g) => g.developer && g.publisher && g.release_date).length;
  const missing = games.length - withMeta;

  return (
    <div>
      <h1 className="font-display text-2xl uppercase">Games</h1>
      <p className="mt-1 text-sm text-muted-foreground">Katalog + info dasar. Ketersediaan per cabang menyusul.</p>
      <StatCards
        cards={[
          { label: "Total game", value: games.length },
          { label: "Cover ada", value: withCover, tone: withCover === games.length ? "primary" : "warning" },
          { label: "Metadata lengkap", value: withMeta, tone: withMeta === games.length ? "primary" : "warning" },
          { label: "Metadata kurang", value: missing, tone: missing > 0 ? "warning" : "muted" },
        ]}
      />
      <div className="mt-4">
        <TableEditor
          endpoint="/api/admin/games"
          idKey="game_id"
          columns={COLUMNS}
          rows={games}
          mediaPrefix="games"
        />
      </div>
    </div>
  );
}
