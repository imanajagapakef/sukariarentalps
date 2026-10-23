import Link from "next/link";
import { notFound } from "next/navigation";
import { getTournamentBySlug, getTournamentMatches } from "@/lib/tournaments";
import { TournamentRegisterForm } from "@/components/tournament-register-form";
import { TournamentBracket } from "@/components/tournament-bracket";
import { FeeTag, SeatMeter } from "@/components/tournament-fee";
import { canRegister, isPublic } from "@/lib/tournament-rules";
import { fmtDateTime } from "@/lib/format";

export const revalidate = 60;

/**
 * One tournament: the poster, the details, the form, and the bracket once it exists.
 *
 * The bracket lives on the detail page rather than its own route because it is part of
 * the pitch — "lihat siapa yang akan kamu tandingi" is the reason to look at a
 * tournament at all — and it is the same read either way.
 */
export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tournament = await getTournamentBySlug(slug);
  if (!tournament || !isPublic(tournament.status)) notFound();

  const matches = await getTournamentMatches(tournament.tournament_id);
  const gate = canRegister({ ...tournament, held: tournament.held }, new Date());

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <Link href="/turnamen" className="text-sm text-muted-foreground hover:text-primary">
        ← Semua turnamen
      </Link>

      <div className="mt-4 grid gap-6 md:grid-cols-[1.4fr_1fr]">
        <div>
          <h1 className="font-display text-3xl uppercase md:text-4xl">{tournament.title}</h1>

          {tournament.poster_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tournament.poster_url}
              alt={`Poster ${tournament.title}`}
              className="mt-4 w-full rounded-xl border border-border object-cover"
            />
          )}

          <dl className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between gap-4 border-b border-border pb-2">
              <dt className="text-muted-foreground">Mulai</dt>
              <dd className="text-right font-medium">{fmtDateTime(tournament.starts_at)}</dd>
            </div>
            {tournament.game_name && (
              <div className="flex justify-between gap-4 border-b border-border pb-2">
                <dt className="text-muted-foreground">Game</dt>
                <dd className="text-right font-medium">{tournament.game_name}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4 border-b border-border pb-2">
              <dt className="text-muted-foreground">Tempat</dt>
              <dd className="text-right font-medium">
                {tournament.branch_short_name ?? tournament.branch_name}
              </dd>
            </div>
            {tournament.prize && (
              <div className="flex justify-between gap-4 border-b border-border pb-2">
                <dt className="text-muted-foreground">Hadiah</dt>
                <dd className="text-right font-medium text-primary">{tournament.prize}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4 border-b border-border pb-2">
              <dt className="text-muted-foreground">HTM</dt>
              <dd className="text-right">
                <FeeTag tournament={tournament} size="lg" />
              </dd>
            </div>
          </dl>

          <SeatMeter tournament={tournament} className="mt-4" />

          {tournament.description && (
            <section className="mt-6">
              <h2 className="font-display uppercase">Tentang</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                {tournament.description}
              </p>
            </section>
          )}

          {tournament.rules && (
            <section className="mt-6">
              <h2 className="font-display uppercase">Aturan main</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                {tournament.rules}
              </p>
            </section>
          )}

          </div>

        <aside className="md:sticky md:top-24 md:self-start">
          <div id="daftar" className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-display text-lg uppercase">Pendaftaran</h2>
            {gate.ok ? (
              <div className="mt-4">
                <TournamentRegisterForm
                  tournamentId={tournament.tournament_id}
                  registrationFee={tournament.registration_fee}
                />
              </div>
            ) : (
              <p className="mt-4 rounded-lg bg-surface-low p-3 text-sm text-muted-foreground">
                {gate.reason}
              </p>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              Sudah daftar?{" "}
              <Link href="/cek-turnamen" className="text-primary hover:underline">
                Cek tiket kamu
              </Link>
            </p>
          </div>
        </aside>
      </div>

      {/* The bracket lives below the grid, not in it: a sixteen-player tree needs the
          whole width to be legible, and squeezing it into a content column is what makes
          a bracket look like a list. It scrolls sideways on narrow screens instead. */}
      {matches.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-xl uppercase">Bracket</h2>
          <TournamentBracket matches={matches} className="mt-3" />
        </section>
      )}
    </div>
  );
}