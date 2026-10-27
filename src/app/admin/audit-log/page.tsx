import { PageHero } from "@/components/page-hero";
import Link from "next/link";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Wallet,
  ScrollText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NoPermission } from "@/components/admin/no-permission";
import { EmptyState } from "@/components/empty-state";
import { SelectField } from "@/components/ui/select-field";
import { AuthError, getStaffUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/format";

/* ================================================================== *
 * Helper tampilan audit log (murni, tanpa React/Supabase).
 * Sesuaikan TONE_RULES, SENSITIVE_KEYWORDS, dan ACTION_LABELS dengan
 * nama aksi yang benar-benar dicatat route-mu.
 * ================================================================== */

const WIB_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  // h23, not hour12:false: the latter prints midnight as "24" on some engines.
  hourCycle: "h23",
});

function parts(date: Date): Record<string, string> {
  return Object.fromEntries(WIB_PARTS.formatToParts(date).map((p) => [p.type, p.value]));
}

/** "2026-10-27 00:30", which spreadsheets parse as a sortable date and time. Empty if unparseable. */
function wibDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** "2026-10-27": today in WIB unless a date is given. */
function wibDay(date: Date = new Date()): string {
  const p = parts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

/* ------------------------------------------------------------------ *
 * Action classification
 * ------------------------------------------------------------------ */

type AuditTone = "create" | "update" | "remove" | "money" | "access" | "info";

/** Exact action -> display text. Anything missing falls back to humanize(). */
const ACTION_LABELS: Record<string, string> = {
  // booking_confirm: "Konfirmasi pembayaran booking",
  // booking_cancel: "Pembatalan booking",
  // refund: "Refund pembayaran",
};

/** First match wins, so the order is part of the meaning. */
const TONE_RULES: ReadonlyArray<readonly [RegExp, AuditTone]> = [
  [/refund|payment|paid|settle|confirm/, "money"],
  [/delete|remove|destroy|cancel|no_show|reset|deactivat|ban/, "remove"],
  [/role|password|invite|staff|user|login|permission/, "access"],
  [/create|add|insert|build|register|walk_in|upload/, "create"],
  [/update|patch|edit|set|status|move|adjust|price|mark|ready|complete|publish|activat/, "update"],
];

function toneOf(action: string): AuditTone {
  const a = action.toLowerCase();
  for (const [re, tone] of TONE_RULES) if (re.test(a)) return tone;
  return "info";
}

/** Actions worth a second look: money going back, things disappearing, access changing. */
const SENSITIVE_KEYWORDS = [
  "refund",
  "delete",
  "remove",
  "reset",
  "cancel",
  "no_show",
  "deactivat",
  "role",
  "price",
  "adjust",
  "override",
  "password",
] as const;

function isSensitive(action: string): boolean {
  const a = action.toLowerCase();
  return SENSITIVE_KEYWORDS.some((k) => a.includes(k));
}

/** PostgREST `or` filter matching the same keywords server-side. Keywords are plain [a-z_]. */
function sensitiveOrFilter(): string {
  return SENSITIVE_KEYWORDS.map((k) => `action.ilike.%${k}%`).join(",");
}

function humanize(raw: string): string {
  const s = raw.replace(/[_.-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? humanize(action);
}

function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/* ------------------------------------------------------------------ *
 * Values: masking and formatting
 * ------------------------------------------------------------------ */

const SECRET_KEY = /password|token|secret|otp|(^|_)pin($|_)/i;
const PHONE_KEY = /phone|telepon|whatsapp|(^|_)(hp|wa)($|_)/i;
const EMAIL_KEY = /email/i;
const MONEY_KEY = /amount|price|total|fee|harga|nominal|saving|discount|paid|tagihan|biaya/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** The log is read by admins, but a phone number does not need to be readable at a glance. */
function maskValue(key: string, value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (SECRET_KEY.test(key)) return "••••••";
  if (EMAIL_KEY.test(key)) {
    const [local = "", domain = ""] = value.split("@");
    return domain ? `${local.slice(0, 1)}•••@${domain}` : "•••";
  }
  if (PHONE_KEY.test(key)) {
    return value.length >= 7 ? `${value.slice(0, 2)}${"•".repeat(value.length - 5)}${value.slice(-3)}` : "•••";
  }
  return value;
}

function maskDeep(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map((v) => maskDeep(v, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, maskDeep(v, k)]));
  }
  return maskValue(key, value);
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function idr(n: number): string {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

/** Rupiah only for keys that are money; a duration of 1440 minutes is not Rp 1.440. */
function fmtAuditValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "kosong";
  const v = maskValue(key, value);
  if (typeof v === "boolean") return v ? "ya" : "tidak";
  if (typeof v === "number") return MONEY_KEY.test(key) ? idr(v) : String(v);
  if (typeof v === "string") {
    if (ISO_DATE.test(v)) return wibDateTime(v) || v;
    return clip(v, 40);
  }
  return clip(JSON.stringify(v), 40);
}

/* ------------------------------------------------------------------ *
 * Diff
 * ------------------------------------------------------------------ */

type Change = { key: string; from: unknown; to: unknown; kind: "added" | "removed" | "changed" };

/** updated_at changes on every write, so it would show up as a change in every row. */
const NOISE_KEYS = new Set(["updated_at"]);

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function changedEntries(before: unknown, after: unknown): Change[] {
  const b = asRecord(before);
  const a = asRecord(after);
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => !NOISE_KEYS.has(k));
  const out: Change[] = [];
  for (const key of keys) {
    const inB = key in b;
    const inA = key in a;
    if (inB && inA) {
      if (JSON.stringify(b[key]) !== JSON.stringify(a[key])) out.push({ key, from: b[key], to: a[key], kind: "changed" });
    } else if (inA) {
      out.push({ key, from: undefined, to: a[key], kind: "added" });
    } else {
      out.push({ key, from: b[key], to: undefined, kind: "removed" });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Time
 * ------------------------------------------------------------------ */

function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const minutes = Math.floor(Math.max(0, now - t) / 60_000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}

const LONG_DAY = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function dayKey(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : wibDay(d);
}

function dayLabel(iso: string, now: number = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = wibDay(d);
  if (day === wibDay(new Date(now))) return "Hari ini";
  if (day === wibDay(new Date(now - DAY))) return "Kemarin";
  return LONG_DAY.format(d);
}

/** "HH:mm" in WIB. */
function timeOfDay(iso: string): string {
  return wibDateTime(iso).slice(11);
}

const RANGES = [
  { key: "24j", label: "24 jam" },
  { key: "7h", label: "7 hari" },
  { key: "30h", label: "30 hari" },
  { key: "semua", label: "Semua" },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

function parseRange(value: string | undefined): RangeKey {
  return RANGES.find((r) => r.key === value)?.key ?? "7h";
}

/** Start of the window as an ISO instant. Day ranges begin at 00:00 WIB, not 00:00 UTC. */
function rangeSince(range: RangeKey, now: number): string | undefined {
  if (range === "semua") return undefined;
  if (range === "24j") return new Date(now - 24 * HOUR).toISOString();
  const days = range === "7h" ? 7 : 30;
  const start = wibDay(new Date(now - (days - 1) * DAY));
  return new Date(`${start}T00:00:00+07:00`).toISOString();
}

/* ------------------------------------------------------------------ *
 * Pulse: last 24 clock hours
 * ------------------------------------------------------------------ */

type HourBucket = { label: string; total: number; sensitive: number };

/** First instant of the oldest bucket. Use it as the lower bound of the query. */
function hoursSince(now: number, hours = 24): string {
  return new Date((Math.floor(now / HOUR) - (hours - 1)) * HOUR).toISOString();
}

/** Oldest first, the last bucket is the current (partial) hour. Labels are the WIB hour. */
function hourBuckets(
  rows: ReadonlyArray<{ created_at: string; action: string }>,
  now: number,
  hours = 24,
): HourBucket[] {
  const current = Math.floor(now / HOUR);
  const out: HourBucket[] = Array.from({ length: hours }, (_, i) => {
    const h = current - (hours - 1 - i);
    return { label: wibDateTime(new Date(h * HOUR).toISOString()).slice(11, 13), total: 0, sensitive: 0 };
  });
  for (const r of rows) {
    const t = Date.parse(r.created_at);
    if (Number.isNaN(t)) continue;
    const idx = current - Math.floor(t / HOUR);
    const bucket = idx >= 0 && idx < hours ? out[hours - 1 - idx] : undefined;
    if (!bucket) continue;
    bucket.total += 1;
    if (isSensitive(r.action)) bucket.sensitive += 1;
  }
  return out;
}

type ToneCounts = { total: number; sensitive: number; money: number; remove: number; access: number };

function toneCounts(rows: ReadonlyArray<{ action: string }>): ToneCounts {
  const c: ToneCounts = { total: rows.length, sensitive: 0, money: 0, remove: 0, access: 0 };
  for (const r of rows) {
    if (isSensitive(r.action)) c.sensitive += 1;
    const tone = toneOf(r.action);
    if (tone === "money" || tone === "remove" || tone === "access") c[tone] += 1;
  }
  return c;
}

/* ------------------------------------------------------------------ *
 * Query string
 * ------------------------------------------------------------------ */

/** Free text goes into a PostgREST `or(...)`, where , ( ) " \ and wildcards change the meaning. */
function sanitizeSearch(q: string | undefined): string {
  return (q ?? "").replace(/[%,()"\\*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

/**
 * Next query string from the current one plus a patch. null/""/undefined in the patch
 * removes a key. Changing any filter returns to page 1 unless the patch sets `page`.
 */
function withParams(
  current: Record<string, string | undefined>,
  patch: Record<string, string | null | undefined>,
): string {
  const merged: Record<string, string | null | undefined> = { ...current, ...patch };
  if (!("page" in patch)) delete merged.page;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/* ---------------- halaman ---------------- */

export const metadata = { title: "Audit log" };

/**
 * Append-only activity trail. Read through the cookie-scoped client so the
 * audit_logs RLS policy (OWNER/ADMIN) is what actually authorises this page;
 * the sidebar link is only a convenience, not the gate.
 */
export const dynamic = "force-dynamic";

const BASE = "/admin/audit-log";
const PAGE_SIZE = 40;
const COLUMNS =
  "id, actor_id, actor_role, action, entity_type, entity_id, reason, before_data, after_data, created_at";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENTITY = /^[\w.-]{1,40}$/;

const TONE_UI: Record<AuditTone, { Icon: LucideIcon; chip: string }> = {
  create: { Icon: Plus, chip: "bg-primary/15 text-primary" },
  update: { Icon: Pencil, chip: "bg-muted text-foreground" },
  remove: { Icon: Trash2, chip: "bg-danger/15 text-error" },
  money: { Icon: Wallet, chip: "bg-warning/15 text-warning" },
  access: { Icon: ShieldCheck, chip: "bg-foreground/10 text-foreground" },
  info: { Icon: CircleDot, chip: "bg-muted text-muted-foreground" },
};

const ROLE_CHIP: Record<string, string> = {
  OWNER: "bg-primary/15 text-primary",
  ADMIN: "bg-warning/15 text-warning",
  STAFF: "bg-muted text-muted-foreground",
};

type SearchParams = {
  q?: string;
  entity?: string;
  actor?: string;
  range?: string;
  only?: string;
  page?: string;
};

/**
 * Staff names for the actors on screen. The profiles table is small, so it is read whole
 * and matched here: that avoids guessing its key column in a typed query. Any failure
 * (RLS, schema) just leaves the short id as the label.
 */
async function loadActorNames(db: Awaited<ReturnType<typeof createClient>>, ids: string[]) {
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  const { data, error } = await db.from("profiles").select("*").limit(500);
  if (error || !data) return names;
  const wanted = new Set(ids);
  for (const row of data as unknown as Record<string, unknown>[]) {
    const id = String(row.id ?? row.user_id ?? "");
    if (!wanted.has(id)) continue;
    const name = [row.full_name, row.name, row.display_name, row.email].find(
      (v): v is string => typeof v === "string" && v.trim() !== "",
    );
    if (name) names.set(id, name);
  }
  return names;
}

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;

  // RLS already hides every audit row from STAFF; without this gate that just renders as
  // an empty-looking log. Only a refusal means "no permission": any other failure is a
  // real error and must not be dressed up as one.
  try {
    await getStaffUser(["OWNER", "ADMIN"]);
  } catch (e) {
    if (e instanceof AuthError) return <NoPermission />;
    throw e;
  }

  const now = Date.now();
  const range = parseRange(sp.range);
  const needle = sanitizeSearch(sp.q);
  const entity = sp.entity && ENTITY.test(sp.entity) ? sp.entity : undefined;
  const actor = sp.actor && UUID.test(sp.actor) ? sp.actor : undefined;
  const onlySensitive = sp.only === "1";
  const page = Math.max(1, Math.min(500, Number.parseInt(sp.page ?? "1", 10) || 1));
  const from = (page - 1) * PAGE_SIZE;
  const since = rangeSince(range, now);

  const db = await createClient();

  // Every filter runs in the database. Filtering the newest 200 rows in JS meant older
  // entries could never be found and the entity list only knew about recent types.
  let list = db.from("audit_logs").select(COLUMNS, { count: "exact" });
  if (entity) list = list.eq("entity_type", entity);
  if (actor) list = list.eq("actor_id", actor);
  if (since) list = list.gte("created_at", since);
  if (needle) {
    list = list.or(
      `action.ilike.%${needle}%,entity_type.ilike.%${needle}%,entity_id.ilike.%${needle}%,reason.ilike.%${needle}%`,
    );
  }
  if (onlySensitive) list = list.or(sensitiveOrFilter());

  const [main, facets, pulse] = await Promise.all([
    list.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1),
    // Cheap lookup for the dropdowns. A view or RPC returning distinct values would make
    // this exact; until then the last 1000 entries cover every type in recent use.
    db.from("audit_logs").select("entity_type, actor_id").order("created_at", { ascending: false }).limit(1000),
    db
      .from("audit_logs")
      .select("created_at, action")
      .gte("created_at", hoursSince(now))
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  // PGRST103 = page past the end: show the empty state, not an error.
  if (main.error && main.error.code !== "PGRST103") throw new Error(main.error.message);

  const rows = main.data ?? [];
  const total = main.count ?? rows.length;
  const pulseRows = pulse.data ?? [];
  const buckets = hourBuckets(pulseRows, now);
  const peak = Math.max(1, ...buckets.map((b) => b.total));
  const counts = toneCounts(pulseRows);
  const lastAt = pulseRows[0]?.created_at ?? null;

  const entityList = [
    ...new Set([...(facets.data ?? []).map((r) => r.entity_type).filter((v): v is string => !!v), ...(entity ? [entity] : [])]),
  ].sort();
  const actorTally = new Map<string, number>();
  for (const r of facets.data ?? []) if (r.actor_id) actorTally.set(r.actor_id, (actorTally.get(r.actor_id) ?? 0) + 1);
  const actorIds = [...new Set([...actorTally.keys(), ...rows.map((r) => r.actor_id).filter((v): v is string => !!v), ...(actor ? [actor] : [])])];
  const names = await loadActorNames(db, actorIds);
  const nameOf = (id: string | null) => (id ? (names.get(id) ?? id.slice(0, 8)) : "Sistem");
  const actorOptions = [...actorTally.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  if (actor && !actorOptions.includes(actor)) actorOptions.unshift(actor);

  const current = { q: needle || undefined, entity, actor, range, only: onlySensitive ? "1" : undefined };
  const href = (patch: Record<string, string | null | undefined>) => `${BASE}${withParams(current, patch)}`;

  const groups: { key: string; label: string; items: typeof rows }[] = [];
  for (const r of rows) {
    const key = dayKey(r.created_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(r);
    else groups.push({ key, label: dayLabel(r.created_at, now), items: [r] });
  }

  const activeFilters = [
    needle && { label: `“${needle}”`, clear: href({ q: null }) },
    entity && { label: humanize(entity), clear: href({ entity: null }) },
    actor && { label: nameOf(actor), clear: href({ actor: null }) },
    onlySensitive && { label: "Hanya sensitif", clear: href({ only: null }) },
  ].filter((f): f is { label: string; clear: string } => !!f);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <PageHero
        size="admin"
        title="Audit Log"
        titleIcon={ScrollText}
        eyebrow={{ icon: ShieldCheck, label: "Akses & Keamanan" }}
        description="Siapa mengubah apa, kapan, dan dari nilai berapa ke berapa. Log hanya bisa bertambah: tidak bisa diedit atau dihapus dari aplikasi."
      />

      {/* ---------- denyut 24 jam + sorotan ---------- */}
      <section aria-label="Ringkasan 24 jam terakhir" className="mt-6 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-sm uppercase tracking-[0.06em] text-primary">
              <Activity aria-hidden className="size-4" />
              Denyut 24 jam
            </h2>
            <p className="text-xs text-muted-foreground">
              {lastAt ? `Aktivitas terakhir ${relativeTime(lastAt, now)}` : "Tidak ada aktivitas dalam 24 jam terakhir"}
            </p>
          </div>

          <div
            role="img"
            aria-label={`${counts.total} aksi dalam 24 jam terakhir, ${counts.sensitive} di antaranya sensitif`}
            className="mt-4 flex h-24 items-end gap-1"
          >
            {buckets.map((b, i) => {
              const isNow = i === buckets.length - 1;
              const height = b.total === 0 ? 4 : Math.max(10, (b.total / peak) * 100);
              return (
                <div
                  key={i}
                  title={`${b.label}:00 · ${b.total} aksi${b.sensitive ? `, ${b.sensitive} sensitif` : ""}`}
                  className="flex h-full flex-1 flex-col justify-end"
                >
                  <div
                    className={`relative w-full overflow-hidden rounded-sm ${
                      b.total === 0 ? "bg-border" : isNow ? "bg-primary motion-safe:animate-pulse" : "bg-primary/40"
                    }`}
                    style={{ height: `${height}%` }}
                  >
                    {b.sensitive > 0 && (
                      <div
                        className="absolute inset-x-0 bottom-0 bg-warning"
                        style={{ height: `${(b.sensitive / b.total) * 100}%` }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div aria-hidden className="mt-1.5 flex justify-between text-xs tabular-nums text-muted-foreground">
            {[0, 6, 12, 18, 23].map((i) => (
              <span key={i}>{buckets[i]?.label}:00</span>
            ))}
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-sm bg-primary/40" />
              Semua aksi
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-sm bg-warning" />
              Sensitif
            </span>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Counter Icon={Activity} label="Aksi, 24 jam" value={counts.total} />
          <Counter Icon={Wallet} label="Transaksi uang" value={counts.money} />
          <Counter Icon={Trash2} label="Hapus dan batal" value={counts.remove} alert />
          <Counter Icon={ShieldCheck} label="Akses dan peran" value={counts.access} />
        </div>
      </section>

      {/* ---------- filter ---------- */}
      <section aria-label="Filter" className="mt-6 space-y-3">
        <nav aria-label="Rentang waktu" className="flex flex-wrap gap-2">
          {RANGES.map((r) => {
            const active = r.key === range;
            return (
              <Link
                key={r.key}
                href={href({ range: r.key })}
                aria-current={active ? "true" : undefined}
                className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors ${
                  active ? "border-primary bg-primary/15 text-primary" : "border-border hover:border-primary/50"
                }`}
              >
                {r.label}
              </Link>
            );
          })}
          <Link
            href={href({ only: onlySensitive ? null : "1" })}
            aria-current={onlySensitive ? "true" : undefined}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors ${
              onlySensitive ? "border-warning bg-warning/15 text-warning" : "border-border hover:border-warning/60"
            }`}
          >
            <ShieldAlert aria-hidden className="size-4" />
            Hanya sensitif
          </Link>
        </nav>

        <form method="get" action={BASE} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_12rem_12rem_auto]">
          <input type="hidden" name="range" value={range} />
          {onlySensitive && <input type="hidden" name="only" value="1" />}
          <label className="relative block">
            <span className="sr-only">Cari audit log</span>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              name="q"
              defaultValue={needle}
              placeholder="Cari aksi, entitas, kode, atau alasan"
              className="h-11 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm"
            />
          </label>
          <SelectField name="entity" defaultValue={entity ?? ""} aria-label="Filter entitas">
            <option value="">Semua entitas</option>
            {entityList.map((e) => (
              <option key={e} value={e}>
                {humanize(e)}
              </option>
            ))}
          </SelectField>
          <SelectField name="actor" defaultValue={actor ?? ""} aria-label="Filter pelaku">
            <option value="">Semua pelaku</option>
            {actorOptions.map((id) => (
              <option key={id} value={id}>
                {nameOf(id)}
              </option>
            ))}
          </SelectField>
          <div className="flex gap-2">
            <button
              type="submit"
              className="h-11 flex-1 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground sm:flex-none"
            >
              Terapkan
            </button>
            {activeFilters.length > 0 && (
              <Link
                href={`${BASE}?range=${range}`}
                aria-label="Hapus semua filter"
                className="inline-flex size-11 items-center justify-center rounded-lg border border-border hover:border-primary/50"
              >
                <RotateCcw aria-hidden className="size-4" />
              </Link>
            )}
          </div>
        </form>

        {activeFilters.length > 0 && (
          <ul className="flex flex-wrap items-center gap-2 text-sm" aria-label="Filter aktif">
            {activeFilters.map((f) => (
              <li key={f.label}>
                <Link
                  href={f.clear}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-primary/10 px-3 text-primary hover:bg-primary/20"
                >
                  {f.label}
                  <span aria-hidden>×</span>
                  <span className="sr-only">hapus filter</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- timeline ---------- */}
      <p className="mt-6 text-sm text-muted-foreground" role="status">
        {total === 0
          ? "Tidak ada entri."
          : `Menampilkan ${from + 1}–${from + rows.length} dari ${total.toLocaleString("id-ID")} entri.`}
      </p>

      {rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Tidak ada entri yang cocok"
            description="Perlebar rentang waktu, ganti kata kunci, atau hapus filter."
            actionHref={{ label: "Hapus semua filter", href: `${BASE}?range=semua` }}
          />
        </div>
      ) : (
        <div className="mt-4 space-y-8">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.label}>
              <h2 className="flex items-center gap-3 font-display text-sm uppercase tracking-[0.06em] text-muted-foreground">
                {g.label}
                <span aria-hidden className="h-px flex-1 bg-border" />
                <span className="text-xs normal-case tracking-normal">{g.items.length} entri</span>
              </h2>

              <ol className="mt-4">
                {g.items.map((r) => {
                  const tone = toneOf(r.action);
                  const { Icon, chip } = TONE_UI[tone];
                  const sensitive = isSensitive(r.action);
                  const who = nameOf(r.actor_id);
                  const changes = changedEntries(r.before_data, r.after_data);
                  const shown = changes.slice(0, 4);
                  const hasBlobs = r.before_data != null || r.after_data != null;

                  return (
                    <li
                      key={r.id}
                      className="relative pb-4 pl-12 before:absolute before:bottom-0 before:left-4.25 before:top-10 before:w-px before:bg-border last:before:hidden"
                    >
                      <span
                        aria-hidden
                        className={`absolute left-0 top-0 grid size-9 place-items-center rounded-full ${chip}`}
                      >
                        <Icon className="size-4" />
                      </span>

                      <article
                        className={`rounded-xl border bg-card p-4 ${
                          sensitive ? "border-warning/40" : "border-border"
                        }`}
                      >
                        <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                          <span
                            aria-hidden
                            className="grid size-7 place-items-center rounded-full bg-muted text-xs font-semibold"
                          >
                            {initials(who)}
                          </span>
                          {r.actor_id ? (
                            <Link href={href({ actor: r.actor_id })} className="font-medium hover:underline">
                              {who}
                            </Link>
                          ) : (
                            <span className="font-medium">{who}</span>
                          )}
                          {r.actor_role && (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_CHIP[r.actor_role] ?? "bg-muted text-muted-foreground"}`}>
                              {r.actor_role}
                            </span>
                          )}
                          <time
                            dateTime={r.created_at}
                            title={fmtDateTime(r.created_at)}
                            className="ml-auto whitespace-nowrap text-xs tabular-nums text-muted-foreground"
                          >
                            {timeOfDay(r.created_at)} · {relativeTime(r.created_at, now)}
                          </time>
                        </header>

                        <p className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="font-medium">{actionLabel(r.action)}</span>
                          {r.entity_type && (
                            <Link
                              href={r.entity_id ? href({ q: r.entity_id }) : href({ entity: r.entity_type })}
                              className="rounded-md bg-surface-low px-2 py-0.5 text-sm text-muted-foreground hover:text-foreground"
                            >
                              {humanize(r.entity_type)}
                              {r.entity_id ? ` · ${r.entity_id}` : ""}
                            </Link>
                          )}
                          {sensitive && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                              <ShieldAlert aria-hidden className="size-3.5" />
                              Sensitif
                            </span>
                          )}
                        </p>

                        {r.reason && (
                          <p className="mt-2 border-l-2 border-border pl-3 text-sm italic text-muted-foreground">
                            {r.reason}
                          </p>
                        )}

                        {shown.length > 0 && (
                          <ul className="mt-3 flex flex-wrap gap-1.5">
                            {shown.map((c) => (
                              <li
                                key={c.key}
                                className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-md bg-surface-low px-2 py-1 text-xs"
                              >
                                <span className="text-muted-foreground">{c.key}</span>
                                {c.kind !== "added" && <s className="text-error">{fmtAuditValue(c.key, c.from)}</s>}
                                {c.kind === "changed" && (
                                  <>
                                    <span aria-hidden className="text-muted-foreground">→</span>
                                    <span className="sr-only">menjadi</span>
                                  </>
                                )}
                                {c.kind === "added" && <span className="text-muted-foreground">baru</span>}
                                {c.kind !== "removed" && <span className="font-medium text-primary">{fmtAuditValue(c.key, c.to)}</span>}
                                {c.kind === "removed" && <span className="text-muted-foreground">dihapus</span>}
                              </li>
                            ))}
                            {changes.length > shown.length && (
                              <li className="inline-flex items-center px-1 text-xs text-muted-foreground">
                                +{changes.length - shown.length} field lain
                              </li>
                            )}
                          </ul>
                        )}

                        {hasBlobs && (
                          <details className="mt-2">
                            <summary className="inline-flex min-h-9 cursor-pointer items-center rounded text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                              Lihat detail lengkap
                            </summary>
                            <div className="mt-2 grid gap-2 md:grid-cols-2">
                              <JsonBlock title="Sebelum" value={r.before_data} />
                              <JsonBlock title="Sesudah" value={r.after_data} />
                            </div>
                          </details>
                        )}
                      </article>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <nav aria-label="Halaman" className="mt-8 flex items-center justify-between gap-3">
          {page > 1 ? (
            <Link
              href={href({ page: String(page - 1) })}
              rel="prev"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-4 text-sm hover:border-primary/50"
            >
              <ChevronLeft aria-hidden className="size-4" />
              Lebih baru
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm tabular-nums text-muted-foreground">
            Halaman {page} dari {pageCount}
          </span>
          {page < pageCount ? (
            <Link
              href={href({ page: String(page + 1) })}
              rel="next"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-4 text-sm hover:border-primary/50"
            >
              Lebih lama
              <ChevronRight aria-hidden className="size-4" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}

function Counter({
  Icon,
  label,
  value,
  alert = false,
}: {
  Icon: LucideIcon;
  label: string;
  value: number;
  alert?: boolean;
}) {
  const hot = alert && value > 0;
  return (
    <div className={`rounded-xl border bg-card p-4 ${hot ? "border-danger/40" : "border-border"}`}>
      <Icon aria-hidden className={`size-4 ${hot ? "text-error" : "text-muted-foreground"}`} />
      <p className={`mt-2 font-display text-3xl tabular-nums ${value === 0 ? "text-muted-foreground" : ""}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p>
      <pre className="max-h-64 overflow-auto rounded-lg bg-surface-low p-3 text-xs leading-relaxed">
        {value == null ? "—" : JSON.stringify(maskDeep(value), null, 2)}
      </pre>
    </div>
  );
}