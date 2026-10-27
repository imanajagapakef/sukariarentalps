import Link from "next/link";
import { PageHero } from "@/components/page-hero";
import { NoPermission } from "@/components/admin/no-permission";
import { Camera, CheckCircle2, Clock, MapPin, Phone, Store, ExternalLink } from "lucide-react";
import { getBranches, getUnitsWithFacility } from "@/lib/catalog";
import { getStaffUser } from "@/lib/authz";
import { getBranchPhotos } from "@/lib/branch-photos";
import { BRANCH_PHOTO_LIMIT } from "@/lib/branch-photo-gallery";
import { StatCards } from "@/components/stat-cards";
import { Badge } from "@/components/ui/badge";
import { BranchPhotoGallery } from "@/components/admin/branch-photo-gallery";
import { EmptyState } from "@/components/empty-state";
import { groupByBranch } from "@/lib/branch-availability";

export const dynamic = "force-dynamic";

const filled = (v: string | null | undefined) => Boolean(v && v.trim());
const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

/**
 * Branch master data and photo galleries.
 *
 * This page did not exist: branches.image_url had been selected by getBranches()
 * since migration 0016 and rendered nowhere, and there was no admin surface to
 * fill it in, so staff had no way to fix a branch photo at all. The gallery is
 * per branch and its first photo is the hero the public branch page renders.
 *
 * Each card carries a completeness meter (photo, full gallery, address, hours,
 * phone) and the list is ordered least-complete first. All of it is derived here
 * from the data the page already reads — no extra queries, no extra modules.
 */
export default async function AdminBranchesPage() {
  // Daftar cabang, unit, dan foto galeri adalah master data OWNER/ADMIN.
  const me = await getStaffUser(["OWNER", "ADMIN"]).catch(() => null);
  if (!me) return <NoPermission />;

  const [branches, units, photosByBranch] = await Promise.all([
    getBranches(),
    getUnitsWithFacility(),
    getBranchPhotos(),
  ]);

  const availability = groupByBranch(units);
  const photoCount = (id: string) => photosByBranch.get(id)?.length ?? 0;

  const rows = branches
    .map((b) => {
      const count = photoCount(b.branch_id);
      const checklist = [
        { key: "photo", label: "Foto utama", done: count > 0, hint: "Unggah foto pertama — itu jadi gambar besar halaman cabang." },
        {
          key: "gallery",
          label: "Galeri penuh",
          done: count >= BRANCH_PHOTO_LIMIT,
          hint: `Tambah ${Math.max(0, BRANCH_PHOTO_LIMIT - count)} foto lagi biar galeri penuh.`,
        },
        { key: "address", label: "Alamat", done: filled(b.address), hint: "Alamat belum diisi." },
        { key: "hours", label: "Jam operasional", done: filled(b.operating_hours), hint: "Jam operasional belum diisi." },
        { key: "phone", label: "Telepon", done: filled(b.phone), hint: "Nomor telepon belum diisi." },
      ];
      const score = clamp((checklist.filter((c) => c.done).length / checklist.length) * 100);
      return { branch: b, count, checklist, score };
    })
    .sort((a, b) => a.score - b.score || a.branch.name.localeCompare(b.branch.name));

  const withPhotos = rows.filter((r) => r.count > 0).length;
  const totalPhotos = rows.reduce((sum, r) => sum + r.count, 0);
  const freeSlots = rows.reduce((sum, r) => sum + Math.max(0, BRANCH_PHOTO_LIMIT - r.count), 0);
  const needWork = rows.filter((r) => r.score < 100).length;

  return (
    <div>
      <PageHero
        size="admin"
        title="Cabang"
        titleIcon={Store}
        eyebrow={{ icon: MapPin, label: `${rows.length} cabang` }}
        description={
          <>
            Data lokasi dan foto cabang. Foto pertama di galeri jadi{" "}
            <strong className="text-foreground">gambar besar</strong> halaman cabang — pajang yang paling menggoda.
            {rows.length > 0 && (
              <p
                className={`mt-3 flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                  needWork === 0 ? "bg-primary/15 text-primary" : "bg-warning/15 text-warning"
                }`}
              >
                {needWork === 0 ? (
                  <>
                    <CheckCircle2 aria-hidden className="size-3.5" /> Semua cabang sudah lengkap. Mantap!
                  </>
                ) : (
                  <>
                    <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-warning" />
                    {needWork} dari {rows.length} cabang masih perlu dilengkapi — yang paling butuh ada di atas.
                  </>
                )}
              </p>
            )}
          </>
        }
        actions={
          <Link
            href="/cabang"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background/60 px-4 text-sm font-medium backdrop-blur transition-colors hover:border-primary"
          >
            <ExternalLink aria-hidden className="size-4" /> Halaman publik
          </Link>
        }
      />

      <StatCards
        cards={[
          { label: "Cabang aktif", value: branches.length },
          {
            label: "Punya foto",
            value: `${withPhotos}/${branches.length}`,
            tone: withPhotos === branches.length ? "primary" : "warning",
          },
          { label: "Total foto", value: totalPhotos },
          { label: "Slot foto kosong", value: freeSlots, tone: freeSlots === 0 ? "primary" : "muted" },
        ]}
      />

      {branches.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Belum ada cabang" description="Cabang diisi lewat seed database." />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {rows.map(({ branch: b, count, checklist, score }) => {
            const photos = photosByBranch.get(b.branch_id) ?? [];
            const stats = availability.get(b.branch_id);
            const cover = photos[0];
            const total = stats?.total ?? 0;
            const available = stats?.available ?? 0;
            const freePct = total > 0 ? clamp((Math.min(available, total) / total) * 100) : 0;
            const tight = total > 0 && (available <= 0 || freePct < 30);
            const fill = clamp((count / Math.max(1, BRANCH_PHOTO_LIMIT)) * 100);
            const missing = checklist.filter((c) => !c.done);
            const accent = score === 100 ? "bg-primary" : score >= 60 ? "bg-warning" : "bg-danger";

            return (
              <section
                key={b.branch_id}
                className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
              >
                <div aria-hidden className={`h-1.5 w-full ${accent}`} />

                <div className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="group relative size-28 shrink-0 overflow-hidden rounded-xl border border-border bg-muted sm:size-32">
                      {cover ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element -- admin preview; the bucket is public */}
                          <img
                            src={cover.image_url}
                            alt={b.name}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                          <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent px-2 pb-1 pt-4 text-[10px] font-medium uppercase tracking-wide text-white">
                            Foto utama
                          </span>
                        </>
                      ) : (
                        <span className="grid h-full place-items-center text-muted-foreground">
                          <span className="flex flex-col items-center gap-1 text-[11px]">
                            <Store aria-hidden className="size-6" />
                            Belum ada foto
                          </span>
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-display text-xl uppercase leading-tight">{b.name}</h2>
                        <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{b.branch_id}</span>
                        <Badge variant={b.status === "ACTIVE" ? "default" : "secondary"}>
                          {b.status === "ACTIVE" && (
                            <span
                              aria-hidden
                              className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-current"
                            />
                          )}
                          {b.status}
                        </Badge>
                      </div>

                      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                        <li className="flex items-start gap-1.5">
                          <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                          <span className="min-w-0 truncate">{b.address || "Alamat belum diisi"}</span>
                        </li>
                        <li className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                          <span className="flex items-center gap-1.5">
                            <Clock aria-hidden className="size-3.5" />
                            {b.operating_hours || "Jam operasional belum diisi"}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Phone aria-hidden className="size-3.5" />
                            {b.phone || "Telepon belum diisi"}
                          </span>
                        </li>
                      </ul>

                      <div className="mt-3 max-w-md">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Unit tersedia sekarang</span>
                          <span className="font-semibold tabular-nums">
                            {available} / {total}
                            {tight ? " · hampir penuh" : ""}
                          </span>
                        </div>
                        <div
                          role="progressbar"
                          aria-label="Unit tersedia"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={freePct}
                          className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
                        >
                          <div
                            className={`h-full rounded-full transition-all ${
                              total === 0 ? "bg-muted-foreground/30" : tight ? "bg-warning" : "bg-primary"
                            }`}
                            style={{ width: `${freePct}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="w-full shrink-0 rounded-xl bg-muted/50 p-3 sm:w-52">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-muted-foreground">Kelengkapan</span>
                        <span className="font-display text-2xl leading-none tabular-nums">{score}%</span>
                      </div>
                      <div
                        role="progressbar"
                        aria-label="Kelengkapan data cabang"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={score}
                        className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
                      >
                        <div className={`h-full rounded-full transition-all ${accent}`} style={{ width: `${score}%` }} />
                      </div>
                      <ul className="mt-2 space-y-0.5 text-[11px]">
                        {checklist.map((c) => (
                          <li
                            key={c.key}
                            title={c.done ? undefined : c.hint}
                            className={`flex items-center gap-1.5 ${c.done ? "text-muted-foreground" : "font-medium text-foreground"}`}
                          >
                            <span
                              aria-hidden
                              className={`grid size-3.5 place-items-center rounded-full text-[9px] ${
                                c.done ? "bg-primary/15 text-primary" : "bg-warning/20 text-warning"
                              }`}
                            >
                              {c.done ? "✓" : "!"}
                            </span>
                            {c.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {missing.length > 0 && (
                    <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                      Berikutnya: {missing[0].hint}
                    </p>
                  )}

                  <div className="mt-4 border-t border-border pt-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="flex items-center gap-1.5 font-display text-sm uppercase tracking-wide">
                        <Camera aria-hidden className="size-3.5 text-primary" /> Galeri
                      </h3>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {count}/{BRANCH_PHOTO_LIMIT} foto · {fill}% terisi
                      </span>
                    </div>
                    <BranchPhotoGallery branchId={b.branch_id} photos={photos} />
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}