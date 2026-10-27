import Link from "next/link";
import { PageHero } from "@/components/page-hero";
import { Sparkles, BadgePercent, ExternalLink } from "lucide-react";
import { NoPermission } from "@/components/admin/no-permission";
import { getBranches, getSnacks } from "@/lib/catalog";
import { getStaffUser } from "@/lib/authz";
import { getFacilityTypeOptions, getPromosForAdmin } from "@/lib/promos";
import { bonusCount, isPublic, promoReadiness, sortPromos } from "@/lib/promo-rules";
import { StatCards } from "@/components/stat-cards";
import { PromoEditor } from "@/components/admin/promo-editor";

export const dynamic = "force-dynamic";

/**
 * Promotion management.
 *
 * This page did not exist, and the effect was a promo nobody could reach: the seeded
 * PROMO-MANTAI-GANET sat at status DRAFT, getPromotions() only reads ACTIVE, so
 * /promo rendered "Belum ada promo aktif" and there was no admin surface anywhere to
 * move it to ACTIVE. Six price rows were already in the database, invisible.
 *
 * Reads every status, not just ACTIVE — a panel that hid the draft would make it look
 * as though the promo did not exist, which is the confusion this page removes.
 *
 * Cards are ordered live → draft → ended, so what customers see right now is always
 * at the top, and the dashboard calls out drafts that are one click from going live.
 */
export default async function AdminPromosPage() {
  // Promo membentang lintas cabang — bukan cakupan STAFF yang hanya
  // bertugas di satu cabang, jadi halaman ini milik OWNER/ADMIN.
  const me = await getStaffUser(["OWNER", "ADMIN"]).catch(() => null);
  if (!me) return <NoPermission />;

  const [promos, branches, facilities, snacks] = await Promise.all([
    getPromosForAdmin(),
    getBranches(),
    getFacilityTypeOptions(),
    // Only active snacks — offering a discontinued one as a perk would produce a promo
    // whose bonus can never be given (create_booking skips it and notes the shortfall).
    getSnacks(),
  ]);

  const branchOptions = branches.map((b) => ({ id: b.branch_id, label: b.short_name ?? b.name }));
  const facilityOptions = facilities;
  const snackOptions = snacks.map((s) => ({ id: s.snack_id, label: s.name }));

  const ordered = sortPromos(promos);
  const live = promos.filter((p) => isPublic(p.status)).length;
  const ready = promos.filter((p) => promoReadiness(p.status, p.promotion_items.length) === "ready").length;
  const priceRows = promos.reduce((sum, p) => sum + p.promotion_items.length, 0);
  const bonusRows = promos.reduce((sum, p) => sum + bonusCount(p.promotion_items), 0);

  return (
    <div>
      <PageHero
        size="admin"
        title="Promo"
        titleIcon={BadgePercent}
        eyebrow={{ icon: Sparkles, label: `${promos.length} promo · ${live} tayang` }}
        description={
          <>
            Racik paket, pasang bonus snack, lalu tayangkan. Pelanggan hanya melihat promo berstatus{" "}
            <strong className="text-foreground">ACTIVE</strong> — status lain aman tersimpan di sini sebagai draf.
            {live === 0 && ready > 0 && (
              <p className="mt-3 flex w-fit items-center gap-2 rounded-full bg-warning/15 px-3 py-1 text-xs font-medium text-warning">
                <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-warning" />
                Halaman /promo masih kosong — {ready} promo sudah siap, tinggal ubah statusnya ke ACTIVE.
              </p>
            )}
            {live === 0 && ready === 0 && promos.length > 0 && (
              <p className="mt-3 flex w-fit items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                Belum ada promo yang tayang. Lengkapi daftar harga salah satu draf dulu.
              </p>
            )}
          </>
        }
        actions={
          <Link
            href="/promo"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background/60 px-4 text-sm font-medium backdrop-blur transition-colors hover:border-primary"
          >
            <ExternalLink aria-hidden className="size-4" /> Halaman publik
          </Link>
        }
      />

      <StatCards
        cards={[
          { label: "Total promo", value: promos.length },
          {
            label: "Tayang di situs",
            value: live,
            tone: live > 0 ? "primary" : "warning",
          },
          { label: "Siap tayang", value: ready, tone: ready > 0 ? "warning" : "muted" },
          { label: `Baris harga · ${bonusRows} bonus`, value: priceRows },
        ]}
      />

      <div className="mt-4 flex flex-col gap-4">
        {ordered.map((p) => (
          <PromoEditor
            key={p.promotion_id}
            promoId={p.promotion_id}
            initial={{
              name: p.name,
              branch_id: p.branch_id,
              description: p.description,
              source_date: p.source_date ? p.source_date.slice(0, 10) : null,
              status: p.status,
              items: p.promotion_items.map((i) => ({
                facility_type_id: i.facility_type_id,
                duration_minutes: i.duration_minutes,
                price: i.price,
                bonus_snack_id: i.bonus_snack_id ?? null,
                bonus_quantity: i.bonus_quantity ?? 0,
              })),
            }}
            branchOptions={branchOptions}
            facilityOptions={facilityOptions}
            snackOptions={snackOptions}
          />
        ))}

        <PromoEditor
          promoId=""
          initial={{
            name: "",
            branch_id: branchOptions[0]?.id ?? "",
            description: null,
            source_date: null,
            status: "DRAFT",
            items: [],
          }}
          branchOptions={branchOptions}
          facilityOptions={facilityOptions}
          snackOptions={snackOptions}
          canDelete={false}
        />
      </div>
    </div>
  );
}