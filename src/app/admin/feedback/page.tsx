import { PageHero } from "@/components/page-hero";
import { MessageSquare, Star } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/authz";
import { fmtDateTime } from "@/lib/format";
import { StatCards } from "@/components/stat-cards";

export const dynamic = "force-dynamic";

export default async function AdminFeedbackPage() {
  await getStaffUser();
  const db = createAdminClient();
  const { data: items } = await db
    .from("feedback")
    .select("feedback_id, rating, service_rating, unit_rating, cleanliness_rating, comment, created_at, bookings(booking_code), customers(name)")
    .order("created_at", { ascending: false })
    .limit(100);

  const avg = (list: (number | null)[]) => {
    const v = list.filter((x): x is number => x != null);
    return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : "—";
  };
  const rows = items ?? [];

    return (
      <div>
        <PageHero
          size="admin"
          title="Feedback"
          titleIcon={MessageSquare}
          eyebrow={{ icon: Star, label: `${rows.length} masukan` }}
          description={`Skor rata-rata ${avg(rows.map((r) => r.rating))}/5 dari masukan terbaru.`}
        />
        <StatCards
          cards={[
            { label: "Jumlah feedback", value: rows.length },
            { label: "Keseluruhan", value: `${avg(rows.map((r) => r.rating))}/5`, tone: "primary" },
            { label: "Pelayanan", value: `${avg(rows.map((r) => r.service_rating))}/5` },
            { label: "Unit", value: `${avg(rows.map((r) => r.unit_rating))}/5` },
            { label: "Kebersihan", value: `${avg(rows.map((r) => r.cleanliness_rating))}/5` },
          ]}
        />

      <div className="mt-4 space-y-2">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Belum ada feedback.</p>}
        {rows.map((f) => (
          <div key={f.feedback_id} className="rounded-lg border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-primary">{"★".repeat(f.rating)}</span>
              <span className="text-xs text-muted-foreground">{fmtDateTime(f.created_at)}</span>
              {f.bookings?.booking_code && <span className="text-xs text-muted-foreground">· {f.bookings.booking_code}</span>}
              <span className="ml-auto text-xs text-muted-foreground">{f.customers?.name ?? "anonim"}</span>
            </div>
            {f.comment && <p className="mt-1 text-muted-foreground">“{f.comment}”</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
