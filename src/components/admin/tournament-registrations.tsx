"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { REGISTRATION_STATUS_LABEL, canCheckIn, type RegistrationStatus } from "@/lib/tournament-rules";
import { fmtDateTime, rp } from "@/lib/format";
import type { AdminRegistration } from "@/lib/tournaments-admin";

/**
 * The counter's list: take the fee, mark the player present, release a seat, resend a
 * message.
 *
 * Every button's enabled state mirrors the rule the database enforces — check-in is
 * dead for an unpaid seat, settle is dead for one already paid — so staff are not
 * discovering a rule by hitting a 400.
 */
export function TournamentRegistrationTable({
  tournamentId,
  registrations,
}: {
  tournamentId: string;
  registrations: AdminRegistration[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [method, setMethod] = useState<"CASH" | "QRIS_MANUAL" | "TRANSFER_MANUAL">("CASH");

  async function act(reg: AdminRegistration, action: string, extra?: Record<string, string>) {
    setBusyId(reg.registration_id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          registration_id: reg.registration_id,
          ...(action === "settle" ? { method } : {}),
          ...extra,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? `Gagal (${res.status})`);
      setNotice(body.detail ?? "Selesai");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal");
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(reg: AdminRegistration) {
    const reason = prompt(`Alasan batalkan ${reg.name}?`, "no-show");
    if (reason === null) return;
    await act(reg, "cancel", reason ? { reason } : {});
  }

  if (registrations.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        Belum ada yang daftar.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label htmlFor="tr-method" className="text-xs text-muted-foreground">
            Bayar di kasir pakai
          </label>
          <SelectField
            id="tr-method"
            size="sm"
            value={method}
            onChange={(e) => setMethod(e.target.value as typeof method)}
          >
            <option value="CASH">Tunai</option>
            <option value="QRIS_MANUAL">QRIS (manual)</option>
            <option value="TRANSFER_MANUAL">Transfer (manual)</option>
          </SelectField>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 p-2 text-sm text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg bg-primary/10 p-2 text-sm text-primary">{notice}</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="px-3 py-2">Seed</th>
              <th className="px-3 py-2">Nama</th>
              <th className="px-3 py-2">Kode tiket</th>
              <th className="px-3 py-2">HTM</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {registrations.map((reg) => {
              const status = reg.status as RegistrationStatus;
              const busy = busyId === reg.registration_id;
              const alive = status !== "CANCELLED" && status !== "EXPIRED";
              return (
                <tr key={reg.registration_id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 tabular-nums">{reg.seed_number ? `#${reg.seed_number}` : "—"}</td>
                  <td className="px-3 py-2">
                    <div>{reg.name}</div>
                    <div className="text-xs text-muted-foreground">{reg.phone}</div>
                  </td>
                  <td className="px-3 py-2 font-display text-xs">{reg.registration_code}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {reg.fee_amount === 0 ? "Gratis" : rp(reg.fee_amount)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {REGISTRATION_STATUS_LABEL[status]}
                    {status === "WAITING_PAYMENT" && reg.payment_deadline_at && (
                      <div className="text-muted-foreground">
                        bayar s/d {fmtDateTime(reg.payment_deadline_at)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {status === "WAITING_PAYMENT" && (
                        <Button size="sm" onClick={() => act(reg, "settle")} disabled={busy}>
                          Terima {rp(reg.fee_amount)}
                        </Button>
                      )}
                      {canCheckIn(status) && status !== "CHECKED_IN" && (
                        <Button size="sm" variant="secondary" onClick={() => act(reg, "check_in")} disabled={busy}>
                          Check-in
                        </Button>
                      )}
                      {alive && (
                        <Button size="sm" variant="ghost" onClick={() => cancel(reg)} disabled={busy}>
                          Batalkan
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => act(reg, "resend_notification")}
                        disabled={busy}
                      >
                        Kirim ulang WA
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}