import Link from "next/link";
import { notFound } from "next/navigation";
import { getTournamentAdminDetail } from "@/lib/tournaments-admin";
import { getStaffUser } from "@/lib/authz";
import { TournamentRegistrationTable } from "@/components/admin/tournament-registrations";
import { TournamentBracketAdmin } from "@/components/admin/tournament-bracket-admin";
import { StatCards } from "@/components/admin/stat-cards";
import { EmptyState } from "@/components/empty-state";
import { TOURNAMENT_STATUS_LABEL, feeDisplay } from "@/lib/tournament-rules";
import { fmtDateTime, rp } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * One tournament, from the counter's side: who registered, who paid, who is here, and
 * the bracket with a box to type each score into.
 *
 * Uncached on purpose — this is the page open on the counter while people queue up.
 *
 * GET is open to every active role, but a cross-branch id must not ride the URL in:
 * a STAFF profile reads its own branch only, and any other id resolves to a 404 —
 * the same fence the registrations/matches routes enforce with a 403, without
 * revealing that the tournament exists.
 */
export default async function AdminTournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const me = await getStaffUser().catch(() => null);
  if (!me) {
    // The admin layout already refuses signed-out traffic, so this is a safety
    // net rather than a state the design expects to show; refuse clearly anyway.
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl uppercase">Turnamen</h1>
        <div>
          <EmptyState title="Sesi tidak aktif" description="Muat ulang halaman untuk melanjutkan." />
        </div>
      </div>
    );
  }

  // null = OWNER/ADMIN, every outlet. "" = a STAFF profile without a placement:
  // no branch to match a tournament against, so the detail cannot be opened at all.
  const lockedBranchId = me.role === "STAFF" ? me.branch_id ?? "" : null;
  if (lockedBranchId === "") {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl uppercase">Turnamen</h1>
        <div>
          <EmptyState
            title="Belum ada cabang"
            description="Profilmu belum dipasangkan ke satu cabang pun, jadi detail turnamen tidak bisa dibuka. Hubungi owner untuk penempatan cabang."
          />
        </div>
      </div>
    );
  }

  const { tournament, registrations, matches } = await getTournamentAdminDetail(
    id,
    lockedBranchId ? { branchId: lockedBranchId } : undefined,
  );
  if (!tournament) notFound();

  const paid = registrations.filter((r) => r.status === "PAID" || r.status === "CHECKED_IN");
  const unpaid = registrations.filter((r) => r.status === "WAITING_PAYMENT");
  const checkedIn = registrations.filter((r) => r.status === "CHECKED_IN");
  const revenue = paid.reduce((sum, r) => sum + r.fee_amount, 0);
  const fee = feeDisplay(tournament);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/turnamen" className="text-sm text-muted-foreground hover:text-primary">
          ← Semua turnamen
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl uppercase">{tournament.title}</h1>
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold uppercase text-primary">
            {TOURNAMENT_STATUS_LABEL[tournament.status]}
          </span>
          <Link
            href={`/turnamen/${tournament.slug}`}
            className="text-sm text-primary hover:underline"
          >
            Lihat halaman publik →
          </Link>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {fmtDateTime(tournament.starts_at)} ·{" "}
          {fee.kind === "free" ? "HTM gratis" : `HTM ${rp(fee.amount)}`}
          {tournament.prize ? ` · hadiah ${tournament.prize}` : ""}
        </p>
      </div>

      <StatCards
        cards={[
          { label: "Kursi terisi", value: `${paid.length + unpaid.length}/${tournament.quota}` },
          { label: "Lunas", value: paid.length, tone: "primary" },
          { label: "Belum bayar", value: unpaid.length, tone: unpaid.length > 0 ? "warning" : "muted" },
          { label: "Hadir", value: checkedIn.length },
          { label: "HTM masuk", value: rp(revenue) },
        ]}
      />

      <section>
        <h2 className="font-display text-lg uppercase">Peserta</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Terima pembayaran di kasir, tandai hadir, atau batalkan kalau tidak datang.
        </p>
        <div className="mt-3">
          <TournamentRegistrationTable
            tournamentId={tournament.tournament_id}
            registrations={registrations}
          />
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg uppercase">Bracket</h2>
        <div className="mt-3">
          <TournamentBracketAdmin
            tournamentId={tournament.tournament_id}
            matches={matches}
            registrations={registrations}
          />
        </div>
      </section>
    </div>
  );
}