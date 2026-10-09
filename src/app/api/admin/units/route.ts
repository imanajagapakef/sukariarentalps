import { adminCrud } from "@/lib/api/admin-crud";
import { unitSchema } from "@/lib/validations/admin";

/**
 * PATCH only. Units are seeded master data, not created or removed from the
 * back office — status changes go through /api/admin/units/status so they keep
 * their own audit trail, and adminCrud's DELETE would hard-delete the row
 * (units have no `active` flag) which is not something staff should be able to
 * do by accident.
 */
export const { PATCH } = adminCrud("units", unitSchema, ["OWNER", "ADMIN"]);
