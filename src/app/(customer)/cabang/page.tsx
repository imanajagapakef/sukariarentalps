import Link from "next/link";
import { getBranches } from "@/lib/catalog";
import { Button } from "@/components/ui/button";

export default async function CabangPage() {
  const branches = await getBranches();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 md:px-8">
      <h1 className="font-display text-3xl uppercase md:text-5xl">Cabang</h1>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {branches.map((b) => (
          <div key={b.branch_id} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-6">
            <h2 className="font-display text-xl uppercase">{b.name}</h2>
            <p className="text-sm text-muted-foreground">{b.address}</p>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Jam</dt>
                <dd>{b.operating_hours}</dd>
              </div>
              {b.phone && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Telp</dt>
                  <dd>{b.phone}</dd>
                </div>
              )}
              {b.google_rating != null && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Google</dt>
                  <dd>
                    {b.google_rating} ★ <span className="text-muted-foreground">({b.google_review_count})</span>
                  </dd>
                </div>
              )}
            </dl>
            <div className="mt-auto flex gap-2 pt-3">
              <Button asChild size="sm" variant="outline">
                <Link href={`/tempat-main?branch=${b.branch_id}`}>Lihat Unit</Link>
              </Button>
              <Button asChild size="sm">
                <Link href={`/booking?branch=${b.branch_id}`}>Booking</Link>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
