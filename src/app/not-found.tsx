import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto grid min-h-[60dvh] place-items-center px-4 text-center">
      <div>
        <p className="font-display text-7xl uppercase text-primary">404</p>
        <p className="font-display mt-2 text-xl uppercase">Kamu nyasar nih</p>
        <p className="mt-2 text-sm text-muted-foreground">Halaman ini tidak ada, mungkin kodenya salah ketik.</p>
        <Button asChild className="mt-6">
          <Link href="/">Kembali ke Home</Link>
        </Button>
      </div>
    </div>
  );
}
