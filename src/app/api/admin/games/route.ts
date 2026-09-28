import { adminCrud } from "@/lib/api/admin-crud";
import { gameSchema } from "@/lib/validations/admin";

export const { POST, PATCH, DELETE } = adminCrud("games", gameSchema, ["ADMIN", "OWNER"]);
