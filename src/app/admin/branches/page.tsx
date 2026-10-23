import { NoPermission } from "@/components/admin/no-permission";
import { Store } from "lucide-react";
import { getBranches, getUnitsWithFacility } from "@/lib/catalog";
import { getStaffUser } from "@/lib/authz";
import { getBranchPhotos } from "@/lib/branch-photos";
import { BRANCH_PHOTO_LIMIT } from "@/lib/branch-photo-gallery";
import { StatCards } from "@/components/admin/stat-cards";
import { Badge } from "@/components/ui/badge";
import { BranchPhotoGallery } from "@/components/admin/branch-photo-gallery";
import { EmptyState } from "@/components/empty-state";
import { groupByBranch } from "@/lib/branch-availability";

export const dynamic = "force-dynamic";

/**
 * Branch master data and photo galleries.
 *
 * This page did not exist: branches.image_url had been selected by getBranches()
 * since migration 0016 and rendered nowhere, and there was no admin surface to
 * fill it in, so staff had no way to fix a branch photo at all. The gallery is
 * per branch and its first photo is the hero the public branch page renders.
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
  const withPhotos = branches.filter((b) => (photosByBranch.get(b.branch_id)?.length ?? 0) > 0).length;
  const totalPhotos = branches.reduce((sum, b) => sum + (photosByBranch.get(b.branch_id)?.length ?? 0), 0);

  return (
    <div>
      <h1 className="font-display text-2xl uppercase">Cabang</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Data lokasi dan foto cabang. Foto pertama di galeri dipakai sebagai gambar besar halaman cabang.
      </p>

      <StatCards
        cards={[
          { label: "Cabang aktif", value: branches.length },
          { label: "Punya foto", value: withPhotos, tone: withPhotos === branches.length ? "primary" : "warning" },
          { label: "Total foto", value: totalPhotos },
          {
            label: "Galeri belum penuh",
            value: `${BRANCH_PHOTO_LIMIT - Math.round(totalPhotos / Math.max(1, branches.length))} rata-rata`,
            tone: "muted",
          },
        ]}
      />

      {branches.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Belum ada cabang" description="Cabang Appearance-kan lewat seed database." />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {branches.map((b) => {
            const photos = photosByBranch.get(b.branch_id) ?? [];
            const stats = availability.get(b.branch_id);
            const cover = photos[0];
            return (
              <section key={b.branch_id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element -- admin preview; the bucket is public
                      <img src={cover.image_url} alt={b.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="grid h-full place-items-center text-muted-foreground">
                        <Store aria-hidden className="size-6" />
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-lg uppercase">{b.name}</h2>
                      <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{b.branch_id}</span>
                      <Badge variant={b.status === "ACTIVE" ? "default" : "secondary"}>{b.status}</Badge>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{b.address}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {b.operating_hours}
                      {b.phone ? ` · ${b.phone}` : ""} · {stats?.available ?? 0} dari {stats?.total ?? 0} unit
                      tersedia
                    </p>
                  </div>
                </div>

                <BranchPhotoGallery branchId={b.branch_id} photos={photos} />
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}