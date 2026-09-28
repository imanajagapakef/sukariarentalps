import Link from "next/link";
import { getStaffUser } from "@/lib/authz";
import { LogoutButton } from "@/components/logout-button";

export const metadata = { title: "Admin — Klub Sukaria" };

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/bookings", label: "Booking" },
  { href: "/admin/units", label: "Unit" },
  { href: "/admin/walk-in", label: "Walk-in" },
  { href: "/admin/snacks", label: "Snacks" },
  { href: "/admin/games", label: "Games" },
  { href: "/admin/pricing", label: "Harga" },
  { href: "/admin/feedback", label: "Feedback" },
  { href: "/admin/users", label: "Staff" },
];

const ROLE_LABEL: Record<string, string> = { OWNER: "Owner", ADMIN: "Admin", STAFF: "Staff" };

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const me = await getStaffUser().catch(() => null);

  if (!me) {
    // logged in via Supabase but no active staff profile — show a clean wall
    // instead of throwing (a redirect to /login would loop back here).
    return (
      <div className="mx-auto grid min-h-dvh max-w-md place-items-center px-4 text-center">
        <div>
          <h1 className="font-display text-2xl uppercase">Akses ditolak</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Akun ini belum terdaftar sebagai staff aktif. Hubungi owner untuk dibuatkan akses, atau login ulang.
          </p>
          <div className="mt-6">
            <LogoutButton />
          </div>
        </div>
      </div>
    );
  }

  const hidden = me.role === "STAFF" ? ["/admin/games", "/admin/pricing", "/admin/users"] : me.role === "ADMIN" ? ["/admin/users"] : [];
  const nav = NAV.filter((n) => !hidden.includes(n.href));

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-52 shrink-0 flex-col border-r border-border bg-surface-lowest p-4 md:flex">
        <Link href="/" className="font-display px-2 text-lg uppercase text-primary">
          Klub Sukaria
        </Link>
        <nav aria-label="Admin" className="mt-4 flex flex-col gap-1">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-md px-3 py-2 text-sm text-on-surface-variant hover:bg-muted hover:text-foreground"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-border pt-4 text-sm">
          <p className="font-medium">{me.full_name ?? me.user_id.slice(0, 8)}</p>
          <p className="text-muted-foreground">{ROLE_LABEL[me.role]}</p>
          <LogoutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 overflow-x-auto border-b border-border bg-surface p-2 md:hidden">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="shrink-0 rounded-full border border-border px-3 py-1 text-xs">
              {n.label}
            </Link>
          ))}
          <LogoutButton compact />
        </div>
        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
