"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { EmptyState } from "@/components/empty-state";
import { UnitStatusChip, isUnitBlocked } from "@/components/booking/availability-ui";
import type { FormBranch, FormUnit } from "@/components/booking/form-types";

/**
 * Langkah 1 — Tempat: pilih cabang, lalu unit.
 *
 * Dipisah dari BookingForm supaya file itu tidak lagi menuat seluruh markup
 * form. Semua state tetap di induk; komponen ini murni presentasi.
 */
export function StepPlace({
  branches,
  branchId,
  onBranchChange,
  branchUnits,
  rentalUnits,
  typeId,
  onClearType,
  hiddenByType,
  unitId,
  onUnitChange,
  onNext,
  blockReason,
  headingRef,
}: {
  branches: FormBranch[];
  branchId: string;
  onBranchChange: (branchId: string) => void;
  branchUnits: FormUnit[];
  rentalUnits: FormUnit[];
  typeId: string;
  onClearType: () => void;
  hiddenByType: number;
  unitId: string;
  onUnitChange: (unitId: string) => void;
  onNext: () => void;
  blockReason: string | null;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <div className="space-y-5">
      <h2 ref={headingRef} tabIndex={-1} className="font-display text-lg uppercase scroll-mt-28">
        Tempat
      </h2>
      <div className="space-y-2">
        <Label htmlFor="branch">Cabang</Label>
        <SelectField id="branch" value={branchId} onChange={(e) => onBranchChange(e.target.value)}>
          {branches.map((b) => (
            <option key={b.branch_id} value={b.branch_id}>
              {b.name}
            </option>
          ))}
        </SelectField>
      </div>

      {typeId && (
        <p className="flex items-center justify-between gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm">
          <span>
            Disaring ke{" "}
            <strong className="font-medium">
              {rentalUnits.find((u) => u.facility_type_id === typeId)?.facility_types?.name ??
                "tipe konsol"}
            </strong>
            {hiddenByType > 0 && ` · ${hiddenByType} unit disembunyikan`}
          </span>
          <Button type="button" size="sm" variant="ghost" onClick={onClearType}>
            Semua tipe
          </Button>
        </p>
      )}

      {branchUnits.length === 0 ? (
        <EmptyState
          title={typeId ? "Tidak ada unit tipe ini di cabang ini" : "Belum ada unit di cabang ini"}
        />
      ) : (
        <div role="radiogroup" aria-label="Pilih unit" className="grid gap-2 md:grid-cols-2">
          {branchUnits.map((u) => (
            <button
              key={u.unit_id}
              type="button"
              role="radio"
              aria-checked={unitId === u.unit_id}
              aria-disabled={isUnitBlocked(u.status)}
              disabled={isUnitBlocked(u.status)}
              onClick={() => onUnitChange(u.unit_id)}
              className={`flex items-center justify-between gap-2 rounded-lg border p-3 text-left text-sm transition-colors ${
                unitId === u.unit_id
                  ? "border-primary bg-primary/10"
                  : isUnitBlocked(u.status)
                    ? "cursor-not-allowed border-border/50 bg-muted/40 text-muted-foreground"
                    : "border-border hover:border-primary/60"
              }`}
            >
              <span>
                <span className="font-display block">{u.name}</span>
                <span className="text-muted-foreground">{u.facility_types?.name}</span>
              </span>
              <UnitStatusChip status={u.status} />
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Button
          type="button"
          className="w-full"
          disabled={!!blockReason}
          aria-describedby={blockReason ? "unit-hint" : undefined}
          onClick={onNext}
        >
          Pilih Waktu →
        </Button>
        {blockReason && (
          <p id="unit-hint" role="status" className="text-center text-xs text-warning">
            {blockReason}
          </p>
        )}
      </div>
    </div>
  );
}
