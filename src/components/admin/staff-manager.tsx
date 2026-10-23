"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";

type Branch = { branch_id: string; branch_code: string; branch_name: string };

type Staff = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  active: boolean;
  branch_id: string | null;
  branch_name: string | null;
  email: string | null;
};

export function StaffManager({
  staff,
  meId,
  meRole,
  branches,
}: {
  staff: Staff[];
  meId: string;
  meRole: "ADMIN" | "OWNER" | "STAFF";
  branches: Branch[];
}) {
  const router = useRouter();
  const isOwner = meRole === "OWNER";
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    role: "STAFF",
    branch_id: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(method: string, url: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error?.message ?? "Gagal menyimpan perubahan.");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      {/* Buat akun baru. ADMIN hanya boleh membuat STAFF — pilihan role ADMIN
          hanya tampil untuk OWNER, dan cabang diwajibkan untuk STAFF agar
          akun tidak lahir tanpa cakupan data. */}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          // Yang diketik bertahan saat simpan gagal; reset form hanya setelah sukses.
          const ok = await post("POST", "/api/admin/users", form).catch(() => false);
          if (ok) setForm({ email: "", password: "", full_name: "", role: "STAFF", branch_id: "" });
        }}
        className="mb-6 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3"
      >
        <label className="text-xs text-muted-foreground">
          Email
          <Input
            className="mt-1 w-44"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Password (min 12)
          <Input
            className="mt-1 w-40"
            type="password"
            minLength={12}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Nama
          <Input
            className="mt-1 w-36"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            required
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Role
          <SelectField value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="STAFF">STAFF</option>
            {isOwner && <option value="ADMIN">ADMIN</option>}
          </SelectField>
        </label>
        {form.role === "STAFF" && (
          <label className="text-xs text-muted-foreground">
            Cabang
            <SelectField
              aria-label="Cabang akun baru"
              className="mt-1 w-44"
              value={form.branch_id}
              required
              onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
            >
              <option value="">Pilih cabang…</option>
              {branches.map((b) => (
                <option key={b.branch_id} value={b.branch_id}>
                  {b.branch_name} ({b.branch_code})
                </option>
              ))}
            </SelectField>
          </label>
        )}
        <Button type="submit" size="sm" disabled={busy}>
          Buat Akun
        </Button>
      </form>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      <div className="space-y-2">
        {staff.map((s) => {
          const isSelf = s.user_id === meId;
          // ADMIN hanya menyentuh baris STAFF; OWNER mengelola semua kecuali
          // dirinya sendiri dan akun OWNER lain.
          const canToggle = !isSelf && s.role !== "OWNER" && (isOwner || s.role === "STAFF");
          return (
            <div
              key={s.user_id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {s.full_name ?? "—"}{" "}
                  {isSelf && <span className="text-xs text-muted-foreground">(kamu)</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{s.email ?? s.user_id}</p>
              </div>
              {/* Akun STAFF terikat pada satu cabang; menampilkan cabang
                  membuat kurangnya ikatan terlihat ("TANPA CABANG") alih-alih
                  jadi 403 misterius saat akun mencoba bekerja. */}
              {s.role === "STAFF" && (
                <span
                  title="Cabang tugas"
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    s.branch_name ? "bg-surface-high text-on-surface-variant" : "bg-warning/15 text-warning"
                  }`}
                >
                  {s.branch_name ?? "TANPA CABANG"}
                </span>
              )}
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  s.active ? "bg-primary/15 text-primary" : "bg-danger/15 text-danger"
                }`}
              >
                {s.active ? s.role : "NONAKTIF"}
              </span>
              {/* Perubahan role hanya untuk OWNER. */}
              {isOwner && !isSelf && s.role !== "OWNER" && (
                <SelectField
                  size="sm"
                  aria-label={`Role ${s.full_name ?? "akun"}`}
                  className="w-24"
                  value={s.role}
                  disabled={busy}
                  onChange={(e) => {
                    const role = e.target.value;
                    if (role !== s.role) void post("PATCH", `/api/admin/users/${s.user_id}`, { role });
                  }}
                >
                  <option value="STAFF">STAFF</option>
                  <option value="ADMIN">ADMIN</option>
                </SelectField>
              )}
              {/* Pindahan cabang juga OWNER-only, dan hanya baris STAFF yang
                  punya bind cabang. Opsi kosong hanya status saat ini; memilih
                  itu lagi tidak boleh mengirim PATCH (branch_id: ""). */}
              {isOwner && s.role === "STAFF" && (
                <SelectField
                  size="sm"
                  aria-label={`Cabang ${s.full_name ?? "akun"}`}
                  className="w-40"
                  value={s.branch_id ?? ""}
                  disabled={busy}
                  onChange={(e) => {
                    const branchId = e.target.value;
                    if (branchId && branchId !== s.branch_id) {
                      void post("PATCH", `/api/admin/users/${s.user_id}`, { branch_id: branchId });
                    }
                  }}
                >
                  {s.branch_id == null && <option value="">TANPA CABANG</option>}
                  {s.branch_id && !branches.some((b) => b.branch_id === s.branch_id) && (
                    <option value={s.branch_id}>{s.branch_name ?? s.branch_id}</option>
                  )}
                  {branches.map((b) => (
                    <option key={b.branch_id} value={b.branch_id}>
                      {b.branch_name}
                    </option>
                  ))}
                </SelectField>
              )}
              {canToggle && s.active && (
                <Button
                  size="xs"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => {
                    if (!confirm(`Nonaktifkan akun ${s.full_name ?? s.email ?? s.user_id}?`)) return;
                    void post("PATCH", `/api/admin/users/${s.user_id}`, { active: false });
                  }}
                >
                  Nonaktif
                </Button>
              )}
              {/* Nonaktifkan itu ban, bukan hapus, jadi bisa dibalikkan. */}
              {canToggle && !s.active && (
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void post("PATCH", `/api/admin/users/${s.user_id}`, { active: true })}
                >
                  Aktifkan
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
