import { z } from "zod";
import { phoneRegex } from "@/lib/validations/booking";

/**
 * Tournament input.
 *
 * Only what a human types is validated here. Status, seeds, slots, scores and quota
 * state are decided inside the database (migration 0031) — a second copy of those
 * rules in a schema could only drift out of step with the transaction that actually
 * enforces them.
 */

export const tournamentStatuses = [
  "DRAFT",
  "OPEN",
  "FULL",
  "ONGOING",
  "DONE",
  "CANCELLED",
] as const;

export const tournamentStatusSchema = z.enum(tournamentStatuses);

/** "2026-11-01T19:00" from a datetime-local input. */
const localDateTime = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/, "jam harus format YYYY-MM-DDTHH:MM");

export const tournamentSchema = z.object({
  title: z.string().trim().min(3, "judul minimal 3 huruf").max(120),
  game_id: z.string().trim().min(1).max(40).nullish(),
  branch_id: z.string().trim().min(1).max(20),
  poster_url: z.string().trim().url("URL poster tidak valid").max(500).nullish(),
  description: z.string().trim().max(2000).nullish(),
  rules: z.string().trim().max(2000).nullish(),
  prize: z.string().trim().max(300).nullish(),
  starts_at: localDateTime,
  registration_closes_at: localDateTime.optional().or(z.literal("")),
  registration_fee: z.coerce.number().int().min(0).max(10_000_000),
  /**
   * The price to cross out when the tournament is free. Optional on purpose: a free
   * tournament without one just shows the GRATIS sticker.
   */
  list_price: z.coerce.number().int().positive().max(10_000_000).nullish(),
  quota: z.coerce.number().int().min(2, "minimal 2 peserta").max(512),
  payment_window_minutes: z.coerce.number().int().min(5).max(1440).default(30),
  status: tournamentStatusSchema.default("DRAFT"),
});

export const tournamentPatchSchema = tournamentSchema.partial().extend({
  tournament_id: z.string().trim().min(1).max(20),
});

/** Public registration: the only two fields a player has to fill in. */
export const tournamentRegistrationSchema = z.object({
  tournament_id: z.string().trim().min(1).max(20),
  name: z.string().trim().min(2, "nama minimal 2 huruf").max(80),
  phone: z.string().trim().regex(phoneRegex, "nomor WhatsApp tidak valid"),
  notes: z.string().trim().max(500).optional(),
});

/** Counter actions on one registration. */
export const tournamentActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("settle"),
    registration_id: z.string().trim().min(1).max(20),
    method: z.enum(["CASH", "QRIS_MANUAL", "TRANSFER_MANUAL"]),
    notes: z.string().trim().max(200).optional(),
  }),
  z.object({
    action: z.literal("check_in"),
    registration_id: z.string().trim().min(1).max(20),
  }),
  z.object({
    action: z.literal("cancel"),
    registration_id: z.string().trim().min(1).max(20),
    reason: z.string().trim().max(200).optional(),
  }),
  z.object({
    action: z.literal("resend_notification"),
    registration_id: z.string().trim().min(1).max(20),
  }),
]);

/** Score entry for one match. */
export const tournamentMatchResultSchema = z.object({
  match_id: z.string().trim().min(1).max(20),
  score_a: z.coerce.number().int().min(0).max(99),
  score_b: z.coerce.number().int().min(0).max(99),
});

/** Building or resetting the bracket. */
export const tournamentBracketSchema = z.object({
  tournament_id: z.string().trim().min(1).max(20),
});

export type TournamentInput = z.infer<typeof tournamentSchema>;
export type TournamentRegistrationInput = z.infer<typeof tournamentRegistrationSchema>;

/** "2026-11-01T19:00" -> ISO. Sent as-is otherwise, so a full ISO string passes through. */
export function toIso(value: string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

/**
 * Slug from the title, matching how promoIdFrom() slugifies for promos: the same
 * "URL comes from the human-readable name" rule, so a staff member never types one.
 */
export function tournamentSlug(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "turnamen";
}