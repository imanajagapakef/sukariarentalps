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

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;