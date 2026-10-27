import { PageHero } from "@/components/page-hero";
import {
  Building2,
  CircleCheck,
  Layers,
  Package,
  Sparkles,
  Tag,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { NoPermission } from "@/components/admin/no-permission";
import { createClient } from "@/lib/supabase/server";
import { getStaffUser } from "@/lib/authz";
import { getBranches } from "@/lib/catalog";
import { TableEditor } from "@/components/admin/table-editor";
import type { Column } from "@/components/admin/table-editor";
import { StatCards } from "@/components/stat-cards";
import { fmtDuration, rp } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Rule = {
  pricing_id: string;
  branch_id: string;
  facility_type_id: string;
  pricing_type: string;
  duration_minutes: number;
  price: number;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const pctTone = (pct: number) => (pct >= 100 ? "bg-primary" : pct >= 60 ? "bg-amber" : "bg-coral");

export default async function AdminPricingPage() {
  // Harga tiap cabang adalah data OWNER/ADMIN. Tanpa gerbang URL ini STAFF
  // tetap bisa membaca tarif semua cabang walau form tulisnya sudah 403.
  const me = await getStaffUser(["OWNER", "ADMIN"]).catch(() => null);
  if (!me) return <NoPermission />;

  const db = await createClient();
  const [branches, { data: rules, error: rulesError }, { data: facilities, error: facError }] = await Promise.all([
    getBranches(),
    db.from("pricing_rules").select("*").eq("active", true).order("branch_id").order("facility_type_id"),
    db.from("facility_types").select("facility_type_id, name"),
  ]);

  // A failed read used to render as "0 aturan aktif" with warning-coloured cards, i.e.
  // as a statement about the data instead of about the request. Say so, and hold the
  // analysis back: every "belum ada tarif" below would be an artefact of the failure.
  const loadFailed = Boolean(rulesError || facError);

  const branchOptions = branches.map((b) => ({ value: b.branch_id, label: b.name }));
  const facOptions = (facilities ?? []).map((f) => ({ value: f.facility_type_id, label: f.name }));

  const COLUMNS: Column[] = [
    { key: "branch_id", label: "Cabang", type: "select", options: branchOptions },
    { key: "facility_type_id", label: "Fasilitas", type: "select", options: facOptions },
    { key: "pricing_type", label: "Jenis", type: "select", options: [{ value: "HOURLY", label: "Per Jam" }, { value: "PACKAGE", label: "Paket" }] },
    { key: "duration_minutes", label: "Durasi (mnt)", type: "number" },
    { key: "price", label: "Harga", type: "number" },
  ];

  /* ------------------------------------------------------------------ */
  /*  Analisis (semua dari data yang sudah ada)                          */
  /* ------------------------------------------------------------------ */
  const rows = rules ?? [];
  const facs = facilities ?? [];
  const list: Rule[] = rows.map((r) => ({
    pricing_id: String(r.pricing_id),
    branch_id: String(r.branch_id),
    facility_type_id: String(r.facility_type_id),
    pricing_type: String(r.pricing_type),
    duration_minutes: num(r.duration_minutes),
    price: num(r.price),
  }));

  const branchName = new Map(branches.map((b) => [b.branch_id, b.short_name ?? b.name]));
  const facName = new Map(facs.map((f) => [f.facility_type_id, f.name]));
  const bn = (id: string) => branchName.get(id) ?? "Cabang ?";
  const fn = (id: string) => facName.get(id) ?? "Fasilitas ?";
  const cellKey = (b: string, f: string) => `${b}|${f}`;

  const coveredBranches = new Set(list.map((r) => r.branch_id));
  const coveredFacs = new Set(list.map((r) => r.facility_type_id));
  const facCovered = facs.filter((f) => coveredFacs.has(f.facility_type_id)).length;
  const branchCovered = branches.filter((b) => coveredBranches.has(b.branch_id)).length;
  const packageCount = list.filter((r) => r.pricing_type === "PACKAGE").length;
  const coverage = facs.length ? Math.round((facCovered / facs.length) * 100) : 0;

  // Tarif per jam terendah per (cabang, fasilitas): jadi pembanding bagi paket.
  const hourlyBase = new Map<string, number>();
  for (const r of list) {
    if (r.pricing_type !== "HOURLY" || !(r.price > 0)) continue;
    const k = cellKey(r.branch_id, r.facility_type_id);
    const cur = hourlyBase.get(k);
    if (cur === undefined || r.price < cur) hourlyBase.set(k, r.price);
  }
  const allHourly = [...hourlyBase.values()];
  const minHourly = allHourly.length ? Math.min(...allHourly) : null;
  const maxHourly = allHourly.length ? Math.max(...allHourly) : null;

  const packages = list
    .filter((r) => r.pricing_type === "PACKAGE")
    .map((p) => {
      const hours = p.duration_minutes > 0 ? p.duration_minutes / 60 : 0;
      const base = hourlyBase.get(cellKey(p.branch_id, p.facility_type_id));
      const normal = base && hours > 0 ? base * hours : null;
      return {
        ...p,
        hours,
        perHour: hours > 0 ? p.price / hours : null,
        // positif = hemat, negatif = paket lebih mahal dari bayar per jam
        pct: normal ? Math.round(((normal - p.price) / normal) * 100) : null,
      };
    })
    .sort((a, b) => (b.pct ?? -1_000) - (a.pct ?? -1_000));

  /* ---- kualitas data ---- */
  const groups = new Map<string, Rule[]>();
  for (const r of list) {
    // Tarif per jam tidak punya durasi yang berarti: dua aturan HOURLY di satu
    // cabang+fasilitas sudah bentrok. Paket dibedakan lewat durasinya.
    const k = `${r.branch_id}|${r.facility_type_id}|${r.pricing_type}|${r.pricing_type === "PACKAGE" ? r.duration_minutes : "h"}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const dups = [...groups.values()].filter((g) => g.length > 1);
  const dupCells = new Set(dups.map((g) => cellKey(g[0].branch_id, g[0].facility_type_id)));
  const badPrice = list.filter((r) => !(r.price > 0));
  const badDuration = list.filter((r) => r.pricing_type === "PACKAGE" && !(r.duration_minutes > 0));
  const pricier = packages.filter((p) => p.pct !== null && p.pct < 0);
  const missingFacs = facs.filter((f) => !coveredFacs.has(f.facility_type_id));
  const missingBranches = branches.filter((b) => !coveredBranches.has(b.branch_id));

  const issues: { key: string; tone: "danger" | "warning"; title: string; hint: string; items: string[] }[] = [];
  if (!loadFailed) {
    if (dups.length)
      issues.push({
        key: "dup",
        tone: "danger",
        title: `${dups.length} aturan ganda`,
        hint: "Cabang, fasilitas, dan jenis yang sama punya lebih dari satu harga. Sistem bisa memakai yang mana saja.",
        items: dups.map((g) => `${fn(g[0].facility_type_id)} · ${bn(g[0].branch_id)} · ${g[0].pricing_type === "PACKAGE" ? fmtDuration(g[0].duration_minutes) : "per jam"} (${g.length}×)`),
      });
    if (badPrice.length)
      issues.push({
        key: "price",
        tone: "danger",
        title: `${badPrice.length} aturan berharga 0 / tidak valid`,
        hint: "Harga nol atau minus hampir pasti salah input.",
        items: badPrice.map((r) => `${fn(r.facility_type_id)} · ${bn(r.branch_id)} · ${rp(r.price)}`),
      });
    if (badDuration.length)
      issues.push({
        key: "dur",
        tone: "danger",
        title: `${badDuration.length} paket tanpa durasi`,
        hint: "Paket itu harga flat untuk durasi tertentu, jadi durasinya wajib terisi.",
        items: badDuration.map((r) => `${fn(r.facility_type_id)} · ${bn(r.branch_id)} · ${rp(r.price)}`),
      });
    if (pricier.length)
      issues.push({
        key: "pricier",
        tone: "warning",
        title: `${pricier.length} paket lebih mahal dari tarif per jam`,
        hint: "Bayar per jam untuk durasi yang sama justru lebih murah. Perlu dicek, bisa jadi memang disengaja (mis. ada bonus).",
        items: pricier.map((p) => `${fn(p.facility_type_id)} · ${bn(p.branch_id)} · ${fmtDuration(p.duration_minutes)} ${rp(p.price)}`),
      });
    if (missingFacs.length)
      issues.push({
        key: "fac",
        tone: "warning",
        title: `${missingFacs.length} fasilitas belum punya tarif`,
        hint: "Tanpa aturan harga, fasilitas ini bisa jadi tidak muncul sebagai pilihan di form booking.",
        items: missingFacs.map((f) => f.name),
      });
    if (missingBranches.length)
      issues.push({
        key: "branch",
        tone: "warning",
        title: `${missingBranches.length} cabang belum punya tarif`,
        hint: "Belum ada satu pun aturan harga aktif di cabang ini.",
        items: missingBranches.map((b) => b.short_name ?? b.name),
      });
  }

  /* ---- matriks cabang × fasilitas ---- */
  const byCell = new Map<string, Rule[]>();
  for (const r of list) {
    const k = cellKey(r.branch_id, r.facility_type_id);
    byCell.set(k, [...(byCell.get(k) ?? []), r]);
  }

  /* ---- perbandingan tarif per jam antar cabang ---- */
  const perFac = facs
    .map((f) => {
      const entries = branches
        .map((b) => ({ id: b.branch_id, name: bn(b.branch_id), price: hourlyBase.get(cellKey(b.branch_id, f.facility_type_id)) }))
        .filter((e): e is { id: string; name: string; price: number } => e.price !== undefined);
      const prices = entries.map((e) => e.price);
      const lo = prices.length ? Math.min(...prices) : 0;
      const hi = prices.length ? Math.max(...prices) : 0;
      return { id: f.facility_type_id, name: f.name, entries, lo, hi, spread: hi > 0 ? Math.round(((hi - lo) / hi) * 100) : 0 };
    })
    .filter((x) => x.entries.length > 0)
    .sort((a, b) => b.entries.length - a.entries.length || a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      {loadFailed && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-coral/40 bg-coral/10 px-4 py-3 text-sm text-coral">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            Sebagian data tarif gagal dimuat, jadi angka di bawah bisa tidak lengkap dan analisis dimatikan sementara.
            Muat ulang halaman. Jangan menyimpulkan tarif kosong dari tampilan ini.
          </span>
        </p>
      )}

      {/* ============================ HERO ============================ */}
      <PageHero
        size="admin"
        eyebrow={{ icon: Sparkles, label: `Tarif · ${list.length} aturan aktif` }}
        title="Harga"
        titleIcon={Wallet}
        description={
          <>
            HOURLY = per jam; PACKAGE = harga flat untuk durasi tertentu. (ADMIN/OWNER)
            {minHourly !== null && maxHourly !== null && (
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-bold text-primary">
                  <TrendingDown aria-hidden className="size-3.5" /> Per jam mulai {rp(minHourly)}
                </span>
                {maxHourly !== minHourly && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1 font-medium">
                    <TrendingUp aria-hidden className="size-3.5 text-amber" /> hingga {rp(maxHourly)}
                  </span>
                )}
              </div>
            )}
          </>
        }
        actions={
          <>
            <a
              href="#editor"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground transition-transform hover:scale-105"
            >
              Buka editor
            </a>
            {issues.length > 0 && (
              <a
                href="#perlu-dicek"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-amber/40 bg-amber/10 px-4 text-sm font-medium text-amber transition-colors hover:bg-amber/20"
              >
                <TriangleAlert aria-hidden className="size-4" /> {issues.length} hal perlu dicek
              </a>
            )}
          </>
        }
        aside={
          <div className="w-full sm:w-72">
            <div className="flex items-end justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cakupan tarif</p>
              <p className={cn("font-display text-5xl leading-none tabular-nums", coverage === 100 ? "text-primary" : "text-foreground")}>
                {coverage}
                <span className="text-2xl">%</span>
              </p>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={coverage}
              aria-label={`Cakupan tarif ${coverage} persen`}
              className="mt-3 h-3 w-full overflow-hidden rounded-full bg-muted"
            >
              <div className={cn("h-full rounded-full transition-all", pctTone(coverage))} style={{ width: `${coverage}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {facCovered} dari {facs.length} fasilitas punya tarif · {branchCovered} dari {branches.length} cabang
            </p>
          </div>
        }
      />

      {/* ============================= KPI ============================ */}
      <StatCards
        className="mt-0!"
        cards={[
          { label: "Aturan aktif", value: list.length, icon: Tag, hint: `${list.length - packageCount} per jam · ${packageCount} paket` },
          {
            label: "Cabang tercakup",
            value: branchCovered,
            tone: loadFailed ? "muted" : branchCovered < branches.length ? "warning" : "primary",
            icon: Building2,
            hint: `dari ${branches.length} cabang`,
          },
          {
            label: "Fasilitas tercakup",
            value: `${facCovered} dari ${facs.length}`,
            // Gaps here are why a booking form can be missing an option.
            tone: loadFailed ? "muted" : facCovered < facs.length ? "warning" : "primary",
            icon: Layers,
            hint: facCovered < facs.length ? `${facs.length - facCovered} belum punya tarif` : "semua punya tarif",
          },
          { label: "Jenis paket", value: packageCount, icon: Package, hint: "harga flat per durasi" },
          {
            label: "Perlu dicek",
            value: issues.length,
            tone: loadFailed ? "muted" : issues.length > 0 ? "warning" : "primary",
            icon: issues.length > 0 ? TriangleAlert : CircleCheck,
            hint: issues.length > 0 ? "lihat panel di bawah" : "data tarif bersih",
          },
        ]}
      />

      {/* ========================= PERLU DICEK ======================== */}
      {!loadFailed && (
        <section
          id="perlu-dicek"
          className={cn(
            "scroll-mt-24 rounded-2xl border p-4",
            issues.some((i) => i.tone === "danger")
              ? "border-coral/40 bg-coral/5"
              : issues.length > 0
                ? "border-amber/40 bg-amber/5"
                : "border-primary/30 bg-primary/5",
          )}
        >
          <h2 className="font-display flex items-center gap-2 text-lg uppercase">
            {issues.length > 0 ? (
              <TriangleAlert aria-hidden className={cn("size-4", issues.some((i) => i.tone === "danger") ? "text-coral" : "text-amber")} />
            ) : (
              <CircleCheck aria-hidden className="size-4 text-primary" />
            )}
            {issues.length > 0 ? "Perlu Dicek" : "Tarif Bersih"}
          </h2>

          {issues.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Tidak ada aturan ganda, harga nol, paket tanpa durasi, atau fasilitas tanpa tarif. Mantap. ✨
            </p>
          ) : (
            <ul className="mt-3 grid gap-3 lg:grid-cols-2">
              {issues.map((i) => (
                <li key={i.key} className="rounded-xl bg-background/60 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold">{i.title}</p>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        i.tone === "danger" ? "bg-coral/15 text-coral" : "bg-amber/15 text-amber",
                      )}
                    >
                      {i.tone === "danger" ? "Perbaiki" : "Periksa"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{i.hint}</p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {i.items.slice(0, 5).map((t) => (
                      <li key={t} className="rounded-full border border-border px-2 py-0.5 text-[11px]">
                        {t}
                      </li>
                    ))}
                    {i.items.length > 5 && (
                      <li className="px-1 py-0.5 text-[11px] text-muted-foreground">+{i.items.length - 5} lainnya</li>
                    )}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ============================ PETA TARIF ====================== */}
      {branches.length > 0 && facs.length > 0 && (
        <section id="peta" className="scroll-mt-24 rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display flex items-center gap-2 text-lg uppercase">
              <Layers aria-hidden className="size-4 text-primary" /> Peta Tarif
            </h2>
            <span className="text-xs text-muted-foreground">
              angka = tarif per jam terendah · “+N paket” = jumlah paket · “—” = belum ada aturan
            </span>
          </div>
          <div className="mt-3 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-160 text-sm">
              <thead className="bg-surface-container text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="sticky left-0 bg-surface-container px-3 py-2.5 font-semibold">Cabang</th>
                  {facs.map((f) => (
                    <th key={f.facility_type_id} scope="col" title={f.name} className="px-3 py-2.5 font-semibold">
                      <span className="block max-w-32 truncate">{f.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {branches.map((b) => (
                  <tr key={b.branch_id} className="border-t border-border">
                    <th scope="row" className="sticky left-0 bg-card px-3 py-2 text-left text-xs font-bold uppercase tracking-wide">
                      {b.short_name ?? b.name}
                    </th>
                    {facs.map((f) => {
                      const k = cellKey(b.branch_id, f.facility_type_id);
                      const rs = byCell.get(k) ?? [];
                      const hourly = hourlyBase.get(k);
                      const pkgs = rs.filter((r) => r.pricing_type === "PACKAGE").length;
                      if (rs.length === 0) {
                        return (
                          <td key={f.facility_type_id} className="px-2 py-2">
                            <span className="block rounded-lg border border-dashed border-border px-2 py-2 text-center text-xs text-muted-foreground/60">
                              —
                            </span>
                          </td>
                        );
                      }
                      return (
                        <td key={f.facility_type_id} className="px-2 py-2">
                          <span
                            className={cn(
                              "block rounded-lg border px-2 py-1.5 text-center",
                              dupCells.has(k) ? "border-coral/50 bg-coral/10" : "border-primary/30 bg-primary/10",
                            )}
                          >
                            <span className="block text-xs font-bold tabular-nums">{hourly !== undefined ? rp(hourly) : "—"}</span>
                            <span className="block text-[10px] text-muted-foreground">
                              {hourly !== undefined ? "/jam" : "tanpa tarif jam"}
                              {pkgs > 0 && ` · +${pkgs} paket`}
                            </span>
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Kotak “—” belum tentu salah: bisa jadi fasilitas itu memang tidak ada di cabang tersebut. Kotak merah = ada aturan ganda.
          </p>
        </section>
      )}

      {/* ===================== PER JAM + PAKET ======================== */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display flex items-center gap-2 text-lg uppercase">
            <TrendingUp aria-hidden className="size-4 text-primary" /> Tarif per Jam antar Cabang
          </h2>
          {perFac.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">Belum ada tarif per jam yang bisa dibandingkan.</p>
          ) : (
            <ul className="mt-4 space-y-5">
              {perFac.slice(0, 6).map((f) => (
                <li key={f.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{f.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {f.entries.length > 1 ? (
                        <>
                          {rp(f.lo)} – {rp(f.hi)}
                          {f.spread > 0 && <span className="ml-1.5 rounded-full bg-amber/15 px-1.5 py-0.5 font-bold text-amber">selisih {f.spread}%</span>}
                        </>
                      ) : (
                        "hanya di 1 cabang"
                      )}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {f.entries.map((e) => (
                      <li key={e.id} className="flex items-center gap-2 text-xs">
                        <span className="w-20 shrink-0 truncate text-muted-foreground">{e.name}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <span
                            className={cn("block h-full rounded-full", e.price === f.hi && f.entries.length > 1 ? "bg-amber" : "bg-primary")}
                            style={{ width: `${(e.price / f.hi) * 100}%` }}
                          />
                        </span>
                        <span className="w-24 shrink-0 text-right font-mono tabular-nums">{rp(e.price)}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
              {perFac.length > 6 && (
                <li className="text-xs text-muted-foreground">+{perFac.length - 6} fasilitas lainnya. Lihat semuanya di Peta Tarif.</li>
              )}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display flex items-center gap-2 text-lg uppercase">
            <Package aria-hidden className="size-4 text-primary" /> Paket &amp; Hemat
          </h2>
          {packages.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">Belum ada paket aktif.</p>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted-foreground">
                Dibandingkan dengan tarif per jam terendah di cabang dan fasilitas yang sama.
              </p>
              <ul className="mt-3 space-y-2">
                {packages.slice(0, 8).map((p) => (
                  <li key={p.pricing_id} className="rounded-lg bg-background/60 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-medium">
                        {fn(p.facility_type_id)} <span className="text-muted-foreground">· {bn(p.branch_id)}</span>
                      </span>
                      {p.pct === null ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                          tanpa pembanding
                        </span>
                      ) : p.pct > 0 ? (
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">hemat {p.pct}%</span>
                      ) : p.pct === 0 ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">sama dgn per jam</span>
                      ) : (
                        <span className="rounded-full bg-coral/15 px-2 py-0.5 text-[10px] font-bold uppercase text-coral">lebih mahal {-p.pct}%</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {p.duration_minutes > 0 ? fmtDuration(p.duration_minutes) : "durasi ?"} ·{" "}
                      <b className="tabular-nums text-foreground">{rp(p.price)}</b>
                      {p.perHour !== null && <span> · ≈ {rp(Math.round(p.perHour))}/jam</span>}
                    </p>
                  </li>
                ))}
              </ul>
              {packages.length > 8 && (
                <p className="mt-2 text-xs text-muted-foreground">+{packages.length - 8} paket lainnya di editor.</p>
              )}
            </>
          )}
        </section>
      </div>

      {/* ============================ EDITOR ========================== */}
      <section id="editor" className="scroll-mt-24">
        <div className="flex items-center gap-3">
          <h2 className="font-display flex items-center gap-2 text-lg uppercase">
            <span className="grid size-7 place-items-center rounded-full bg-primary/15 text-primary">
              <Tag aria-hidden className="size-4" />
            </span>
            Editor Tarif
          </h2>
          <span className="h-px flex-1 bg-border" />
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-muted-foreground">
            {list.length} aturan
          </span>
        </div>
        <div className="mt-3">
          <TableEditor endpoint="/api/admin/pricing" idKey="pricing_id" columns={COLUMNS} rows={rules ?? []} />
        </div>
      </section>
    </div>
  );
}