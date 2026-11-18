import { Client } from "pg";
import { readFileSync } from "node:fs";
import { config } from "dotenv";

/**
 * Jalankan migrasi SQL terhadap DB yang ditunjuk .env.test.
 * Default: validasi saja (BEGIN → jalankan → ROLLBACK) supaya error
 * ketahuan tanpa mengubah apa pun. `--apply` untuk benar-benar commit.
 */
config({ path: ".env.test", quiet: true });

const apply = process.argv.includes("--apply");
const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (files.length === 0) {
  console.error("usage: node scripts/run-migrations.mjs [--apply] <file.sql> [...]");
  process.exit(1);
}

const db = new Client({
  connectionString: process.env.TEST_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await db.connect();

for (const file of files) {
  const sql = readFileSync(file, "utf8");
  try {
    await db.query("begin");
    await db.query(sql);
    if (apply) {
      await db.query("commit");
      console.log(`OK  ${file}`);
    } else {
      await db.query("rollback");
      console.log(`VALID (rolled back)  ${file}`);
    }
  } catch (e) {
    await db.query("rollback").catch(() => {});
    console.error(`FAIL  ${file}\n  ${e.message}`);
    process.exitCode = 1;
  }
}

await db.end();
