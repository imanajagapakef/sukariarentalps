"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();

  async function logout() {
    const db = createClient();
    await db.auth.signOut();
    router.replace("/login");
  }

  return (
    <button
      type="button"
      onClick={logout}
      className={
        compact
          ? "shrink-0 rounded-full border border-border px-3 py-1 text-xs"
          : "mt-2 w-full rounded-md bg-muted px-3 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
      }
    >
      Keluar
    </button>
  );
}
