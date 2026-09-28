import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getExtensionInfo } from "@/services/extension.service";
import { BookingStatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ExtensionPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  if (!code) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center md:px-8">
        <h1 className="font-display text-3xl uppercase">Extension</h1>
        <p className="mt-2 text-muted-foreground">Buka halaman ini dari tiket kamu.</p>
        <Button asChild className="mt-6">
          <Link href="/cek-booking">Cek Booking</Link>
        </Button>
      </div>
    );
  }

  const db = await createClient();
  const info = await getExtensionInfo(db, code);
  if (!info) notFound();

  const extendable = info.status === "IN_USE" || info.status === "CONFIRMED";

  return (
    <div className="mx-auto max-w-md px-4 py-12 md:px-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl uppercase">Extension</h1>
        <BookingStatusPill status={info.status} />
      </div>
      <p className="mt-1 text-muted-foreground">{info.booking_code} · {info.units?.name}</p>

      <div className="mt-6 rounded-xl border border-border bg-card p-5">
        <p className="text-xs uppercase text-muted-foreground">Sesi berakhir</p>
        <p className="font-display mt-1 text-lg uppercase">{fmtDateTime(info.scheduled_end_at)}</p>
        {info.latest_extendable_at && (
          <p className="mt-2 text-sm text-muted-foreground">
            Bisa sampai maks. <span className="text-foreground">{fmtDateTime(info.latest_extendable_at)}</span>
          </p>
        )}
      </div>

      {extendable ? (
        <div className="mt-6 rounded-xl border border-primary-container bg-primary/10 p-5 text-sm">
          <p className="font-display uppercase text-primary">Perpanjang main</p>
          <p className="mt-2 text-muted-foreground">
            Bilang ke kasir kode <span className="font-medium text-foreground">{info.booking_code}</span> dan
            durasi tambahan yang kamu mau. Kami cek slot &amp; totalnya di tempat.
          </p>
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          Extension hanya bisa saat sesi berlangsung (status Sedang Main / Terkonfirmasi).
        </p>
      )}

      <div className="mt-6 flex gap-3">
        <Button asChild variant="outline">
          <Link href={`/tiket/${info.booking_code}`}>Kembali ke Tiket</Link>
        </Button>
      </div>
    </div>
  );
}
