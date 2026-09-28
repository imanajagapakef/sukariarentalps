import { adminCrud } from "@/lib/api/admin-crud";
import { pricingSchema } from "@/lib/validations/admin";

export const { POST, PATCH, DELETE } = adminCrud("pricing_rules", pricingSchema, ["ADMIN", "OWNER"]);
