/**
 * Admin segment fallback. Because it sits under `admin/layout.tsx`, the shell stays
 * mounted and only the content area pulses — see `page-skeleton.tsx`.
 *
 * This one covers every admin route that does not provide a more specific skeleton
 * (`bookings`, `units` and `reports` each have their own).
 */
import { AdminPageSkeleton } from "@/components/admin/page-skeleton";

export default function AdminLoading() {
  return <AdminPageSkeleton kpi={6} wideKpi />;
}
