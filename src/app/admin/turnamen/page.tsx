import Link from "next/link";
import { getBranches, getGames } from "@/lib/catalog";
import { getAdminTournaments } from "@/lib/tournaments-admin";
import { getStaffUser } from "@/lib/authz";
import { TournamentEditor, type TournamentRow } from "@/components/admin/tournament-editor";
import { StatCards } from "@/components/admin/stat-cards";
import { EmptyState } from "@/components/empty-state";
import { TOURNAMENT_STATUS_LABEL, feeDisplay } from "@/lib/tournament-rules";
import { rp } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Tournament management.
 *
 * Every status is listed, not only the public ones — a panel that hid a draft would make
 * it look as though the tournament did not exist. The sweep of expired seats runs on the
 * read path (the route does it), so the counters here are the real ones.
 *
 * Open to every active role, the way the GET list route is: a STAFF profile reads only
 * its own branch's tournaments and works them from the detail page (registrations,
 * bracket). The create/edit forms belong to OWNER/ADMIN — mirroring the POST/PATCH
 * guard on the route — so they are not rendered for STAFF at all, and neither is the
 * branch/game master data that feeds their pickers.
 */
export default async function AdminTournamentsPage() {
  const me = await getStaffUser().catch(() => null);
  if (!me) {
    // The admin layout already refuses signed-out traffic, so this is a safety
    // net rather than a state the design expects to show; refuse clearly anyway.
    return (
      <div>
        <h1 className="font-display text-2xl uppercase">Turnamen</h1>
        <div className="mt-6">
          <EmptyState title="Sesi tidak aktif" description="Muat ulang halaman untuk melanjutkan." />
        </div>
      </div>
    );
  }

  // null = OWNER/ADMIN, every outlet. "" = a STAFF profile without a placement:
  // refuse up front instead of showing numbers the counter can never operate on.
  const lockedBranchId = me.role === "STAFF" ? me.branch_id ?? "" : null;
  if (lockedBranchId === "") {
    return (
      <div>
        <h1 className="font-display text-2xl uppercase">Turnamen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Atur Defines jadwal, kuota, HTM, dan poster. Pelanggan hanya melihat status OPEN,
          FULL, ONGOING, dan DONE.
        </p>
        <div className="mt-6">
          <EmptyState
            title="Belum ada cabang"
            description="Profilmu belum dipasangkan ke satu cabang pun, jadi daftar turnamen tidak bisa dibuka. Hubungi owner untuk penempatan cabang."
          />
        </div>
      </div>
    );
  }

  const canManage = me.role === "OWNER" || me.role === "ADMIN";
  const [admin, branches, games] = await Promise.all([
    getAdminTournaments(lockedBranchId ? { branchId: lockedBranchId } : undefined),
    canManage ? getBranches() : Promise.resolve([]),
    canManage ? getGames() : Promise.resolve([]),
  ]);
  const { tournaments, swept } = admin;

  const branchOptions = branches.map((b) => ({ id: b.branch_id, label: b.short_name ?? b.name }));
  const gameOptions = games.map((g) => ({ id: g.game_id, label: g.name }));

  const live = tournaments.filter((t) => t.status !== "DRAFT" && t.status !== "CANCELLED").length;
  const seats = tournaments.reduce((sum, t) => sum + t.stats.held, 0);
  const revenue = tournaments.reduce((sum, t) => sum + t.stats.revenue, 0);

  return (
    <div>
      <h1 className="font-display text-2xl uppercase">Turnamen</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Atur Defines jadwal, kuota, HTM, dan poster. Pelanggan hanya melihat status OPEN,
        FULL, ONGOING, dan DONE.
        {swept > 0 && (
          <span className="text-warning"> {swept} pendaftaran kedaluwarsa dilepas kali ini.</span>
        )}
      </p>

      <StatCards
        cards={[
          { label: "Total", value: tournaments.length },
          { label: "Tayang", value: live, tone: live > 0 ? "primary" : "warning" },
          { label: "Kursi terisi", value: seats },
          { label: "HTM terkumpul", value: rp(revenue) },
        ]}
      />

      <div className="mt-4 space-y-3">
        {tournaments.map((t) => (
          <div key={t.tournament_id}>
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Link
                href={`/admin/turnamen/${t.tournament_id}`}
                className="font-bold uppercase text-primary hover:underline"
              >
                Kelola peserta & bracket →
              </Link>
              <span>{TOURNAMENT_STATUS_LABEL[t.status]}</span>
              <span>
                {t.stats.held}/{t.quota} kursi · {t.stats.paid} lunas · {rp(t.stats.revenue)}
              </span>
              <span>
                {feeDisplay(t).kind === "free" ? "HTM gratis" : `HTM ${rp(t.registration_fee)}`}
              </span>
            </div>
            {canManage && (
              <TournamentEditor
                tournament={t as TournamentRow}
                branchOptions={branchOptions}
                gameOptions={gameOptions}
              />
            )}
          </div>
        ))}

        {canManage && <TournamentEditor branchOptions={branchOptions} gameOptions={gameOptions} />}
      </div>
    </div>
  );
}
