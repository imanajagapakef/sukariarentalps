"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";

type Option = { value: string; label: string };

/**
 * Instant booking dispatch: picks branch + room type + time slot, then jumps
 * into the booking wizard pre-filled. Actual unit allocation happens in the
 * wizard's availability step (server-side slot locking).
 */
export function InstantBookingWidget({
  branches,
  facilityTypes,
}: {
  branches: Option[];
  facilityTypes: Option[];
}) {
  const router = useRouter();
  const [branch, setBranch] = useState(branches[0]?.value ?? "");
  const [type, setType] = useState("");
  const [slot, setSlot] = useState("now");

  const slots: Option[] = [
    { value: "now", label: "Main Sekarang (Slot Live)" },
    { value: "evening", label: "Malam Ini (20:00 WIB)" },
    { value: "midnight", label: "Begadang Pass (23:00 WIB)" },
    { value: "tomorrow", label: "Besok Siang (14:00 WIB)" },
  ];

  const submit = () => {
    const q = new URLSearchParams();
    if (branch) q.set("branch", branch);
    if (type) q.set("type", type);
    if (slot && slot !== "now") q.set("slot", slot);
    router.push(`/booking?${q.toString()}`);
  };


  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">
          Pilih Cabang
        </span>
        <SelectField value={branch} onChange={(e) => setBranch(e.target.value)}>
          {branches.map((b) => (
            <option key={b.value} value={b.value} className="bg-surface-low">
              {b.label}
            </option>
          ))}
        </SelectField>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">
          Tipe Konsol / Room
        </span>
        <SelectField value={type} onChange={(e) => setType(e.target.value)}>
          <option value="" className="bg-surface-low">
            Tipe apa saja
          </option>
          {facilityTypes.map((t) => (
            <option key={t.value} value={t.value} className="bg-surface-low">
              {t.label}
            </option>
          ))}
        </SelectField>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">
          Waktu Mulai Main
        </span>
        <SelectField value={slot} onChange={(e) => setSlot(e.target.value)}>
          {slots.map((s) => (
            <option key={s.value} value={s.value} className="bg-surface-low">
              {s.label}
            </option>
          ))}
        </SelectField>
      </label>

      <div className="flex items-end">
        <Button size="lg" className="w-full" onClick={submit}>
          Lanjut Booking
        </Button>
      </div>
    </div>
  );
}
