import { Client } from "pg";
import { config } from "dotenv";

/**
 * Bersihkan sisa data test dari database — termasuk fixture yang namanya
 * tidak ada di daftar tetap (mis. "Race A" dari skrip balapan).
 *
 * Aturan aman: hanya customer yang TIDAK punya booking, DAN namanya cocok
 * pola fixture yang jelas (Race X, Booking Tester, dst.) atau nomornya
 * berakhiran dengan pola timestamp test.
 *
 * Default dry-run; --apply untuk menghapus.
 */
config({ path: ".env.test", quiet: true });

const apply = process.argv.includes("--apply");

const FIXTURE_NAMES = [
  "Customer A", "Budi Asli", "Budi", "Notif", "Satu", "Dua", "Bayar", "Awal", "QRIS",
  "Gratis", "Lunas", "Ganti", "Snap", "Telat", "Pengganti", "Belum", "Hadir", "Batal",
  "Cadangan", "Bracket A", "Bracket B", "Bracket C", "Solo", "Seed1", "Seed2", "Seed3",
  "Main 1", "Main 2", "Main 3", "Main 4", "Seri A", "Seri B", "Kosong", "Penuh A",
  "Penuh B", "Booking Tester", "Promo Tester", "Policy Tester", "Walk In Customer",
  "Late Canceller", "Cashier Cancel", "Bad Method", "Siti", "Siti Lengkap",
  "Nama Asli Fixture", "Test Customer", "Race A", "Race B",
];

const db = new Client({
  connectionString: process.env.TEST_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await db.connect();

const { rows: fixtures } = await db.query(
  `select c.customer_id, c.name, c.phone
     from customers c
    where not exists (select 1 from bookings b where b.customer_id = c.customer_id)
      and c.name = any ($1::text[])`,
  [FIXTURE_NAMES],
);
const ids = fixtures.map((f) => f.customer_id);

const { rows: auditRows } = await db.query(
  `select id from audit_logs where entity_type = 'customers' and entity_id = any($1::text[])`,
  [ids],
);

console.log(`fixture customer tanpa booking: ${ids.length}`);
console.log(`audit log terkait: ${auditRows.length}`);

if (!apply) {
  for (const f of fixtures.slice(0, 15)) console.log(`  ${f.customer_id}  ${f.name}  ${f.phone}`);
  console.log("\nDry-run. Jalankan ulang dengan --apply.");
  await db.end();
  process.exit(0);
}

await db.query("begin");
try {
  if (auditRows.length > 0) {
    await db.query(`delete from audit_logs where id = any($1::bigint[])`, [
      auditRows.map((a) => a.id),
    ]);
  }
  if (ids.length > 0) {
    await db.query(`delete from customers where customer_id = any($1::text[])`, [ids]);
  }
  await db.query("commit");
  console.log(`\nTerhapus: ${ids.length} customer, ${auditRows.length} audit log.`);
} catch (e) {
  await db.query("rollback");
  console.error("Gagal, sudah rollback:", e.message);
  process.exitCode = 1;
}

await db.end();
