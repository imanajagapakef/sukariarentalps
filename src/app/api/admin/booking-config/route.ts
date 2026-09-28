import { adminCrud } from "@/lib/api/admin-crud";
import { bookingConfigSchema } from "@/lib/validations/admin";

export const { POST, PATCH, DELETE } = adminCrud("booking_config", bookingConfigSchema, ["OWNER"]);
