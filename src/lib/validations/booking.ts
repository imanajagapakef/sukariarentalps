import { z } from "zod";

const phoneRegex = /^[0-9+\-\s()]{6,20}$/;

export const snackSelectionSchema = z.object({
  snack_id: z.string().min(1),
  quantity: z.number().int().positive().max(20),
});

export const createBookingSchema = z
  .object({
    branch_id: z.string().min(1),
    unit_id: z.string().min(1),
    customer_name: z.string().trim().min(2).max(80),
    customer_phone: z.string().trim().regex(phoneRegex, "Nomor WhatsApp tidak valid"),
    customer_email: z.string().email().optional().or(z.literal("")),
    start_at: z.string().datetime({ offset: true }).optional(),
    duration_minutes: z.number().int().min(60).max(360),
    game_id: z.string().min(1).optional(),
    snacks: z.array(snackSelectionSchema).max(20).default([]),
    notes: z.string().max(500).optional(),
  })
  .strict();

export const cancelBookingSchema = z
  .object({
    reason: z.string().trim().max(200).optional(),
  })
  .strict();

export const availabilityQuerySchema = z.object({
  branch_id: z.string().min(1),
  start_at: z.string().datetime({ offset: true }),
  end_at: z.string().datetime({ offset: true }),
});

export const slotQuerySchema = z.object({
  branch_id: z.string().min(1),
  unit_id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus format YYYY-MM-DD"),
  duration_minutes: z.coerce.number().int().min(30).max(360).default(60),
});

/** Slot states mirroring public.slot_availability(). */
export const SLOT_STATES = [  "AVAILABLE",
  "BOOKED",
  "IN_USE",
  "CLEANING",
  "PAST",
  "OUT_OF_SERVICE",
] as const;

export type SlotState = (typeof SLOT_STATES)[number];

export type Slot = {
  slot_start: string;
  slot_end: string;
  state: SlotState | string;
  ready_at: string | null;
};

/** Design wording per state: what it is, and what to do about it. */
export const SLOT_COPY: Record<SlotState, { label: string; hint: string }> = {
  AVAILABLE: { label: "Tersedia", hint: "Gas langsung" },
  BOOKED: { label: "Dipesan", hint: "Selesai" },
  IN_USE: { label: "Sedang main", hint: "Selesai" },
  CLEANING: { label: "Dibersihkan", hint: "Siap" },
  PAST: { label: "Lewat", hint: "Sudah lewat" },
  OUT_OF_SERVICE: { label: "Tidak dipakai", hint: "Unit nonaktif" },
};

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
export type SlotQuery = z.infer<typeof slotQuerySchema>;

/**
 * The five channels the Stitch payment screen offers.
 *
 * `midtrans` is the value sent to Midtrans as `enabled_payments` and the value
 * that comes back on the webhook as `payment_type`; `method` is what we persist
 * on payments.method. Keeping all three on one object means the picker, the API
 * and the webhook cannot disagree about a channel name.
 */
export const PAYMENT_CHANNELS = [
  {
    id: "QRIS_MANUAL",
    midtrans: "qris",
    label: "QRIS",
    sub: "Manual confirm oleh kasir",
    blurb: "Scan QRIS dinamis, lalu kasir verifikasi pembayaran secara manual.",
    fee: "Rp0",
    badge: "QRIS",
  },
] as const;

export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];
export type PaymentMethodId = PaymentChannel["id"];

export const paymentChannelSchema = z.enum(
  PAYMENT_CHANNELS.map((c) => c.id) as [PaymentMethodId, ...PaymentMethodId[]],
);

export const channelById = (id: string) => PAYMENT_CHANNELS.find((c) => c.id === id);

export const createPaymentSchema = z.object({
  booking_code: z.string().trim().min(1),
  method: paymentChannelSchema.optional(),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;