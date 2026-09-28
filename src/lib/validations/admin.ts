import { z } from "zod";

export const snackSchema = z.object({
  snack_id: z.string().min(1).max(20).optional(),
  name: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(50),
  price: z.number().int().min(0),
  stock: z.number().int().min(0),
  min_stock: z.number().int().min(0),
  active: z.boolean().optional(),
});

export const gameSchema = z.object({
  game_id: z.string().min(1).max(20).optional(),
  name: z.string().trim().min(1).max(150),
  short_description: z.string().trim().max(300).optional().nullable(),
  developer: z.string().trim().max(100).optional().nullable(),
  age_rating: z.string().trim().max(10).optional().nullable(),
  active: z.boolean().optional(),
});

export const pricingSchema = z.object({
  pricing_id: z.string().min(1).max(20).optional(),
  branch_id: z.string().min(1),
  facility_type_id: z.string().min(1),
  pricing_type: z.enum(["HOURLY", "PACKAGE"]),
  duration_minutes: z.number().int().positive(),
  price: z.number().int().min(0),
  active: z.boolean().optional(),
});

export const bookingConfigSchema = z.object({
  minimum_duration_minutes: z.number().int().min(15).max(180),
  maximum_duration_minutes: z.number().int().min(30).max(1440),
  booking_interval_minutes: z.number().int().min(5).max(120),
  cleaning_duration_minutes: z.number().int().min(0).max(60),
  payment_deadline_minutes: z.number().int().min(5).max(120),
  advance_booking_days: z.number().int().min(1).max(365),
  late_tolerance_minutes: z.number().int().min(0).max(120),
});

export const unitStatusSchema = z.object({
  unit_id: z.string().min(1),
  status: z.enum(["MAINTENANCE", "OFFLINE", "AVAILABLE"]),
  reason: z.string().trim().max(200).optional(),
});

const walkInBase = z.object({
  branch_id: z.string().min(1),
  unit_id: z.string().min(1),
  customer_name: z.string().trim().min(2).max(80),
  customer_phone: z.string().trim().regex(/^[0-9+\-\s()]{6,20}$/, "Nomor WhatsApp tidak valid"),
  start_at: z.string().datetime({ offset: true }).optional(),
  duration_minutes: z.number().int().min(15).max(1440),
  pay_method: z.enum(["CASH", "QRIS_MANUAL", "TRANSFER_MANUAL"]),
  game_id: z.string().min(1).optional(),
  snacks: z.array(z.object({ snack_id: z.string().min(1), quantity: z.number().int().positive().max(20) })).max(20).default([]),
  notes: z.string().max(500).optional(),
});

export const walkInSchema = walkInBase;

export const refundSchema = z.object({
  booking_code: z.string().trim().min(1),
  reason: z.string().trim().min(3).max(200),
});

export const staffCreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12).max(100),
  full_name: z.string().trim().min(2).max(80),
  role: z.enum(["STAFF", "ADMIN"]),
});

export const staffPatchSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["STAFF", "ADMIN"]).optional(),
  active: z.boolean().optional(),
});

export const bookingActionSchema = z.object({
  action: z.enum(["confirm", "check_in", "complete", "cancel", "no_show", "mark_ready"]),
  reason: z.string().trim().max(200).optional(),
});
