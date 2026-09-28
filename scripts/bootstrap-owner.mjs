// One-shot owner bootstrap: run with  node --env-file=.env.local scripts/bootstrap-owner.mjs
// Creates the auth user + OWNER profile from ADMIN_BOOTSTRAP_EMAIL/PASSWORD.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
const name = process.env.ADMIN_BOOTSTRAP_NAME?.trim() || "Owner";

if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY wajib");
if (!email || !password) throw new Error("ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD wajib diisi di .env.local");
if (password.length < 12) throw new Error("Password minimal 12 karakter");

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: all } = await db.auth.admin.listUsers();
const existing = (all?.users ?? []).find((u) => u.email?.toLowerCase() === email);
if (existing) {
  const { data: prof } = await db.from("profiles").select("role, active").eq("user_id", existing.id).maybeSingle();
  console.log(`sudah ada: ${email} (role=${prof?.role ?? "tanpa profile"}). Login pakai lewat form /login.`);
  process.exit(0);
}

const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw new Error(error.message);

const { error: pErr } = await db.from("profiles").insert({
  user_id: data.user.id,
  full_name: name,
  role: "OWNER",
  active: true,
});
if (pErr) {
  await db.auth.admin.deleteUser(data.user.id);
  throw new Error(pErr.message);
}

console.log(`OWNER ${email} dibuat.`);
