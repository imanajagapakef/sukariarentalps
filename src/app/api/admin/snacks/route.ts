import { adminCrud } from "@/lib/api/admin-crud";
import { snackSchema } from "@/lib/validations/admin";

export const { POST, PATCH, DELETE } = adminCrud("snacks", snackSchema);
