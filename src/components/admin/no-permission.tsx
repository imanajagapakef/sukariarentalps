import { EmptyState } from "@/components/empty-state";

/**
 * The design's "No Permission" QA state: a plain refusal screen for any page
 * that is OWNER/ADMIN-only. Same shape everywhere, so a RESTRICTED page looks
 * refused rather than merely empty — an empty table invites "is the data gone?"
 */
export function NoPermission({ description }: { description?: string }) {
  return (
    <div className="mt-6">
      <EmptyState
        title="Akses ditolak"
        description={
          description ??
          "Halaman ini hanya untuk Owner dan Admin. Hubungi owner bila butuh akses."
        }
      />
    </div>
  );
}
