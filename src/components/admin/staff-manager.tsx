"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Staff = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  active: boolean;
  email: string | null;
};

export function StaffManager({ staff, meId }: { staff: Staff[]; meId: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "STAFF" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectCls = "h-9 rounded-lg border border-input bg-card px-2 text-sm";

  async function post(method: string, url: string, body: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error?.message ?? "Gagal");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setForm({ email: "", password: "", full_name: "", role: "STAFF" });
          void post("POST", "/api/admin/users", form);
        }}
        className="mb-6 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3"
      >
        <label className="text-xs text-muted-foreground">
          Email
          <Input className="mt-1 w-44" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </label>
        <label className="text-xs text-muted-foreground">
          Password (min 12)
          <Input className="mt-1 w-40" type="password" minLength={12} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        </label>
        <label className="text-xs text-muted-foreground">
          Nama
          <Input className="mt-1 w-36" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
        </label>
        <label className="text-xs text-muted-foreground">
          Role
          <select className={selectCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="STAFF">STAFF</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </label>
        <Button type="submit" size="sm" disabled={busy}>
          Buat Akun
        </Button>
      </form>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      <div className="space-y-2">
        {staff.map((s) => (
          <div key={s.user_id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {s.full_name ?? "—"} {s.user_id === meId && <span className="text-xs text-muted-foreground">(kamu)</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">{s.email ?? s.user_id}</p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs ${s.active ? "bg-primary/15 text-primary" : "bg-danger/15 text-danger"}`}>
              {s.active ? s.role : "NONAKTIF"}
            </span>
            {s.role !== "OWNER" && s.user_id !== meId && (
              <>
                <select
                  aria-label={`Role ${s.full_name ?? ""}`}
                  className={selectCls}
                  defaultValue={s.role}
                  disabled={busy}
                  onChange={(e) => void post("PATCH", `/api/admin/users/${s.user_id}`, { role: e.target.value })}
                >
                  <option value="STAFF">STAFF</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
                <Button size="xs" variant="destructive" disabled={busy} onClick={() => void post("PATCH", `/api/admin/users/${s.user_id}`, { active: false })}>
                  Nonaktif
                </Button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
