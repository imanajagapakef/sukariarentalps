import { NoPermission } from "@/components/admin/no-permission";
import { getStaffUser } from "@/lib/authz";
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
  // Master data is OWNER/ADMIN-only at the API layer; this gate is the visible
  // half of that rule, so STAFF hitting the URL gets a refusal instead of rows
  // whose only edit path already 403s.
  const me = await getStaffUser(["OWNER", "ADMIN"]).catch(() => null);
  if (!me) return <NoPermission />;

  const games = await getGames();

  // Data-quality readouts. These are the two things the table itself cannot tell you
  // at a glance: 58 rows all looking equally "filled" while the cover and the
  // developer/publisher/date columns are silently empty.
  //
  // "Perlu dilengkapi" counts a row for *either* gap, because a missing cover and a
  // missing developer are the same kind of job for whoever fills it in. Counting only
  // the metadata columns left this at 0 while a cover had plainly been removed, which
  // read as "nothing changed". A cover whose URL points at a deleted object still
  // counts as present here — that needs a bucket check, not a column read.
  const withCover = games.filter((g) => g.image_url).length;
  const withMeta = games.filter((g) => g.developer && g.publisher && g.release_date).length;
  const needsWork = games.filter(
    (g) => !g.image_url || !g.developer || !g.publisher || !g.release_date,
  ).length;

  return (
    <div>
      <h1 className="font-display text-2xl uppercase">Games</h1>
      <p className="mt-1 text-sm text-muted-foreground">Katalog + info dasar. Ketersediaan per cabang menyusul.</p>
      <StatCards
        cards={[
          { label: "Total game", value: games.length },
          { label: "Cover ada", value: withCover, tone: withCover === games.length ? "primary" : "warning" },
          { label: "Metadata lengkap", value: withMeta, tone: withMeta === games.length ? "primary" : "warning" },
          { label: "Perlu dilengkapi", value: needsWork, tone: needsWork > 0 ? "warning" : "muted" },
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
