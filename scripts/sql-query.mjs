import { Client } from "pg";
import { config } from "dotenv";

config({ path: ".env.test", quiet: true });

const sql = process.argv[2];
if (!sql) {
  console.error("usage: node scripts/sql-query.mjs <sql>");
  process.exit(1);
}

const db = new Client({
  connectionString: process.env.TEST_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await db.connect();
try {
  const res = await db.query(sql);
  console.log(JSON.stringify(res.rows, null, 2));
} finally {
  await db.end();
}
