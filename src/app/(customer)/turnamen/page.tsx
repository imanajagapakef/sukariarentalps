import { PageHero } from "@/components/page-hero";
import { Trophy, Sparkles } from "lucide-react";
import { Suspense } from "react";
import Link from "next/link";
import { getTournamentOverviews } from "@/lib/tournaments";
import { EmptyState } from "@/components/empty-state";
import { FeeTag, SeatMeter } from "@/components/tournament-fee";
import { TOURNAMENT_STATUS_LABEL, canRegister, isPublic } from "@/lib/tournament-rules";
import { fmtDateTime } from "@/lib/format";

export const revalidate = 60;

/**
 * The tournament list.
 *
 * Cards carry everything needed to decide whether to enter: who plays, where, when, what
 * it costs, and how many seats are left. The "Daftar" button only appears when the same
 * gate the database enforces would allow it — a card offering a button that answers
 * "kuota penuh" is worse than one that says so.
 */
export default function TournamentsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-8">
      <PageHero
        eyebrow={{ icon: Sparkles, label: "Kompetisi" }}
        title="Turnamen"
        titleIcon={Trophy}
        description="Adu serabutan di lokasi. Daftar dulu, bayar HTM kalau ada, tiketnya langsung jadi."
      />

      <div className="mt-8">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Memuat turnamen…</p>}>
          <TournamentList />
        </Suspense>
      </div>
    </div>
  );
}

async function TournamentList() {
  const tournaments = await getTournamentOverviews();
  const now = new Date();
  const visible = tournaments.filter((t) => isPublic(t.status));

  if (visible.length === 0) {
    return (
      <EmptyState
        title="Belum ada turnamen"
        description="Kalau ada turnamen sultan, akan muncul di sini. Cek lagi nanti."
      />
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {visible.map((t) => {
        const gate = canRegister(
          {
            ...t,
            held: t.held,
          },
          now,
        );
        return (
          <article
            key={t.tournament_id}
            className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
          >
            {/* The poster is optional, so the card keeps its shape without one rather
                than reserving an empty grey box where art should be. */}
            {t.poster_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={t.poster_url}
                alt={`Poster ${t.title}`}
                className="aspect-video w-full object-cover"
                loading="lazy"
              />
            )}

            <div className="flex flex-1 flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-lg uppercase">{t.title}</h2>
                <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold uppercase text-primary">
                  {TOURNAMENT_STATUS_LABEL[t.status]}
                </span>
              </div>

              {t.game_name && <p className="text-sm text-foreground">{t.game_name}</p>}

              <dl className="space-y-1 text-sm text-muted-foreground">
                <div className="flex justify-between gap-2">
                  <dt>Mulai</dt>
                  <dd className="text-right text-foreground">{fmtDateTime(t.starts_at)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Tempat</dt>
                  <dd className="text-right text-foreground">
                    {t.branch_short_name ?? t.branch_name}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>HTM</dt>
                  <dd>
                    <FeeTag tournament={t} />
                  </dd>
                </div>
              </dl>

              {t.prize && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Hadiah: </span>
                  <span className="font-medium text-foreground">{t.prize}</span>
                </p>
              )}

              <SeatMeter tournament={t} className="mt-1" />

              <div className="mt-auto flex items-center gap-2 pt-2">
                <Link
                  href={`/turnamen/${t.slug}`}
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-center text-sm font-bold transition-colors hover:border-primary hover:text-primary"
                >
                  Detail
                </Link>
                {gate.ok ? (
                  <Link
                    href={`/turnamen/${t.slug}#daftar`}
                    className="flex-1 rounded-lg bg-primary px-3 py-2 text-center text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    Daftar
                  </Link>
                ) : (
                  <span className="flex-1 rounded-lg border border-border px-3 py-2 text-center text-sm text-muted-foreground">
                    {gate.reason}
                  </span>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}