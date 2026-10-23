/** Step 1 — place. Branch picker, optional type filter chip, and the unit grid. */
import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import type { FormBranch, FormUnit } from "./booking-form-types";

export function StepPlace({
  stepHeadingRef,
  branches,
  branchId,
  typeId,
  typeFilterName,
  hiddenByType,
  branchUnits,
  unitId,
  blockReason,
  onBranchChange,
  onUnitSelect,
  onTypeClear,
  onContinue,
}: {
  stepHeadingRef: RefObject<HTMLHeadingElement | null>;
  branches: FormBranch[];
  branchId: string;
  typeId: string;
  typeFilterName: string;
  hiddenByType: number;
  branchUnits: FormUnit[];
  unitId: string;
  blockReason: string | null;
  onBranchChange: (nextBranch: string) => void;
  onUnitSelect: (unitId: string) => void;
  onTypeClear: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-5">
      <h2 ref={stepHeadingRef} tabIndex={-1} className="font-display text-lg uppercase scroll-mt-28">
        Tempat
      </h2>
      <div className="space-y-2">
        <Label htmlFor="branch">Cabang</Label>
        <SelectField
          id="branch"
          value={branchId}
          onChange={(e) => onBranchChange(e.target.value)}
        >
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
            <strong className="font-medium">{typeFilterName}</strong>
            {hiddenByType > 0 && ` · ${hiddenByType} unit disembunyikan`}
          </span>
          <Button type="button" size="sm" variant="ghost" onClick={onTypeClear}>
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
              onClick={() => onUnitSelect(u.unit_id)}
              className={`flex items-center justify-between gap-2 rounded-lg border p-3 text-left text-sm transition-colors ${
                unitId === u.unit_id ? "border-primary bg-primary/10" : "border-border hover:border-primary/60"
              }`}
            >
              <span>
                <span className="font-display block">{u.name}</span>
                <span className="text-muted-foreground">{u.facility_types?.name}</span>
              </span>
              {u.status !== "AVAILABLE" && (
                <span className="text-xs text-warning">
                  {u.status === "IN_USE" ? "sedang dipakai" : u.status === "BOOKED" ? "dipesan" : u.status.toLowerCase()}
                </span>
              )}
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
          onClick={onContinue}
        >
          Pilih Waktu →
        </Button>
        {blockReason && (
          <p id="unit-hint" className="text-center text-xs text-warning">
            {blockReason}
          </p>
        )}
      </div>
    </div>
  );
}
