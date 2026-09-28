"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export type Column = {
  key: string;
  label: string;
  type?: "text" | "number" | "select" | "bool";
  options?: { value: string; label: string }[];
  required?: boolean;
};

type Row = Record<string, unknown>;

/**
 * Thin client over the adminCrud API (POST/PATCH/DELETE {id}).
 * One component covers snacks/games/pricing — no per-table boilerplate.
 */
export function TableEditor({
  endpoint,
  idKey,
  columns,
  rows,
  readOnly = false,
}: {
  endpoint: string;
  idKey: string;
  columns: Column[];
  rows: Row[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Row>({});
  const [edits, setEdits] = useState<Record<string, Row>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function call(method: string, body?: unknown, query = "") {
    setError(null);
    setBusy(true);
    return fetch(endpoint + query, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(data?.error?.message ?? `Gagal (${r.status})`);
        router.refresh();
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }

  const field = (col: Column, value: unknown, onChange: (v: unknown) => void) => {
    if (col.type === "select") {
      return (
        <select
          aria-label={col.label}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm"
        >
          {col.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    if (col.type === "bool") {
      return (
        <input
          type="checkbox"
          aria-label={col.label}
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="size-4 accent-primary"
        />
      );
    }
    return (
      <input
        type={col.type === "number" ? "number" : "text"}
        aria-label={col.label}
        value={value === null || value === undefined ? "" : String(value)}
        onChange={(e) => onChange(col.type === "number" ? Number(e.target.value) : e.target.value)}
        className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm"
      />
    );
  };

  return (
    <div>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!readOnly && (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
          {columns.map((c) => (
            <label key={c.key} className="text-xs text-muted-foreground">
              {c.label}
              <div className="mt-1 w-36">{field(c, draft[c.key], (v) => setDraft({ ...draft, [c.key]: v }))}</div>
            </label>
          ))}
          <Button
            size="sm"
            disabled={busy}
            onClick={() => call("POST", Object.fromEntries(Object.entries(draft).filter(([, v]) => v !== "" && v !== undefined)))}
          >
            Tambah
          </Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="p-2">{idKey}</th>
              {columns.map((c) => (
                <th key={c.key} className="p-2">
                  {c.label}
                </th>
              ))}
              {!readOnly && <th className="p-2" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const id = String(r[idKey]);
              const cellValue = (c: Column) => (edits[id]?.[c.key] !== undefined ? edits[id][c.key] : r[c.key]);
              const dirty = columns.some((c) => edits[id]?.[c.key] !== undefined && edits[id][c.key] !== r[c.key]);
              return (
                <tr key={id} className="border-b border-border/50">
                  <td className="p-2 font-medium">{id}</td>
                  {columns.map((c) => (
                    <td key={c.key} className="p-2">
                      {readOnly ? (
                        String(r[c.key] ?? "—")
                      ) : (
                        <div className="w-32">
                          {field(c, cellValue(c), (v) => setEdits({ ...edits, [id]: { ...edits[id], [c.key]: v } }))}
                        </div>
                      )}
                    </td>
                  ))}
                  {!readOnly && (
                    <td className="flex gap-1 p-2">
                      <Button size="xs" disabled={busy || !dirty} onClick={() => call("PATCH", { id, ...edits[id] })}>
                        Simpan
                      </Button>
                      <Button size="xs" variant="destructive" disabled={busy} onClick={() => call("DELETE", undefined, `?id=${encodeURIComponent(id)}`)}>
                        Nonaktif
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Belum ada data.</p>}
      </div>
    </div>
  );
}
