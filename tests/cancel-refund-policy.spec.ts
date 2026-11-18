import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";

const connectionString = process.env.TEST_DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;

/**
 * Perilaku uang & anti-abuse yang ditambahkan di migrasi 0038–0041.
 *
 * Semua diuji terhadap RPC aslinya, bukan versi JS, karena yang dijamin
 * adalah transaksi di Postgres: refund ikut melepas slot, walk-in tidak boleh
 * ninggalkan booking terkonfirmasi tanpa pembayaran, dan lockout harus bertahan
 * antar-instance.
 */
describeDb("cancel, refund & walk-in (migrasi 0038–0041)", () => {
  const suffix = Date.now().toString(36).toUpperCase();
  const unitId = `X-UNIT-${suffix}`;
  const facilityId = `X-FAC-${suffix}`;
  const branchId = "BR-GANET";
  // Nomor HP harus angka saja (base36 bisa memuat huruf; nomor dinormalisasi ke 62…).
  const phone = `62899${String(Date.now()).slice(-8)}`;

  let db: Client;

  // 5 hari ke depan: di dalam jendela advance_booking_days (30).
  const day = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const at = (time: string) => `${day} ${time}+07`;

  beforeAll(async () => {
    db = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    await db.connect();
    await db.query(
      `insert into facility_types (facility_type_id, code, name, platform, category)
       values ($1, $2, 'Policy Test Facility', 'PS5', 'RENTAL')`,
      [facilityId, `XF-${suffix}`],
    );
    await db.query(
      `insert into units (unit_id, branch_id, facility_type_id, name)
       values ($1, $2, $3, 'Policy Test Unit')`,
      [unitId, branchId, facilityId],
    );
    await db.query(
      `insert into pricing_rules (pricing_id, branch_id, facility_type_id, pricing_type, duration_minutes, price)
       values ($1, $2, $3, 'HOURLY', 60, 20000), ($4, $2, $3, 'PACKAGE', 120, 35000)`,
      [`XP-1-${suffix}`, branchId, facilityId, `XP-2-${suffix}`],
    );
  });

  afterAll(async () => {
    if (!db) return;
    await db.query(`delete from payments where booking_id in (select booking_id from bookings where unit_id = $1)`, [unitId]);
    await db.query(`delete from unit_reservations where unit_id = $1`, [unitId]);
    await db.query(`delete from booking_items where booking_id in (select booking_id from bookings where unit_id = $1)`, [unitId]);
    await db.query(`delete from bookings where unit_id = $1`, [unitId]);
    await db.query(`delete from unit_status_history where unit_id = $1`, [unitId]);
    await db.query(`delete from customers where phone = $1`, [phone]);
    await db.query(`delete from pricing_rules where branch_id = $1 and facility_type_id = $2`, [branchId, facilityId]);
    await db.query(`delete from units where unit_id = $1`, [unitId]);
    await db.query(`delete from facility_types where facility_type_id = $1`, [facilityId]);
    await db.end();
  });

  beforeEach(async () => {
    await db.query(`delete from payments where booking_id in (select booking_id from bookings where unit_id = $1)`, [unitId]);
    await db.query(`delete from unit_reservations where unit_id = $1`, [unitId]);
    await db.query(`delete from booking_items where booking_id in (select booking_id from bookings where unit_id = $1)`, [unitId]);
    await db.query(`delete from bookings where unit_id = $1`, [unitId]);
    await db.query(`delete from unit_status_history where unit_id = $1`, [unitId]);
    await db.query(`update units set status = 'AVAILABLE', condition = 'GOOD' where unit_id = $1`, [unitId]);
  });

  async function createBooking(start = "10:00") {
    const { rows } = await db.query(
      `select * from public.create_booking($1, $2, $3, $4, $5::timestamptz, $6)`,
      [branchId, unitId, "Policy Tester", phone, at(start), 60],
    );
    return rows[0] as { booking_id: string; booking_code: string; total_amount: number };
  }

  async function markPaid(bookingId: string, amount: number) {
    await db.query(
      `insert into payments (booking_id, provider, method, status, gross_amount, paid_at)
       values ($1, 'MANUAL', 'QRIS_MANUAL', 'PAID', $2, now())`,
      [bookingId, amount],
    );
  }

  /* ------------------------------------------------------------------ *
   * cancel_booking: refund atomik + jendela 6 jam
   * ------------------------------------------------------------------ */

  it("membatalkan booking berbayar → payment jadi REFUNDED dan refunded_at terisi", async () => {
    const booking = await createBooking();
    await markPaid(booking.booking_id, booking.total_amount);

    const { rows } = await db.query(
      `select public.cancel_booking($1, 'dibatalkan customer', true) as status`,
      [booking.booking_id],
    );
    expect(rows[0].status).toBe("CANCELLED");

    const { rows: payments } = await db.query(
      `select status, refunded_at from payments where booking_id = $1`,
      [booking.booking_id],
    );
    expect(payments).toHaveLength(1);
    // Ini inti perbaikan: uang yang sudah masuk tidak boleh tetap PAID pada
    // booking yang dibatalkan — kalau tidak, laporan menghitungnya sebagai
    // pendapatan although customer-nya sudah dibayar balik.
    expect(payments[0].status).toBe("REFUNDED");
    expect(payments[0].refunded_at).not.toBeNull();
  });

  it("membatalkan booking berbayar juga melepas slot dan mengembalikan unit", async () => {
    const booking = await createBooking();
    await markPaid(booking.booking_id, booking.total_amount);
    await db.query(`select public.confirm_booking($1)`, [booking.booking_id]);

    await db.query(`select public.cancel_booking($1, 'dibatalkan customer', true)`, [booking.booking_id]);

    const { rows: res } = await db.query(
      `select count(*)::int as n from unit_reservations where booking_id = $1`,
      [booking.booking_id],
    );
    expect(res[0].n).toBe(0);

    const { rows: unit } = await db.query(`select status from units where unit_id = $1`, [unitId]);
    expect(unit[0].status).toBe("AVAILABLE");
  });

  it("menolak batal mandiri di bawah 6 jam sebelum sesi dimulai", async () => {
    // Mulai 2 jam dari sekarang → di luar jendela 6 jam.
    const start = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const { rows } = await db.query(
      `select * from public.create_booking($1, $2, $3, $4, $5::timestamptz, $6)`,
      [branchId, unitId, "Late Canceller", phone, start, 60],
    );
    const bookingId = rows[0].booking_id as string;

    await expect(
      db.query(`select public.cancel_booking($1, 'terlambat', true)`, [bookingId]),
    ).rejects.toThrow(/6 jam/);

    // Booking harus tetap utuh — penolakan tidak boleh membatalkan separuhnya.
    const { rows: after } = await db.query(`select status from bookings where booking_id = $1`, [bookingId]);
    expect(after[0].status).toBe("WAITING_PAYMENT");
  });

  it("kasir (tanpa enforce_window) tetap bisa membatalkan kapan saja", async () => {
    const start = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const { rows } = await db.query(
      `select * from public.create_booking($1, $2, $3, $4, $5::timestamptz, $6)`,
      [branchId, unitId, "Cashier Cancel", phone, start, 60],
    );
    const bookingId = rows[0].booking_id as string;

    const { rows: out } = await db.query(
      `select public.cancel_booking($1, 'refund: pelanggan datang', false) as status`,
      [bookingId],
    );
    expect(out[0].status).toBe("CANCELLED");
  });

  it("membatalkan booking yang belum dibayar tidak menyentuh payment", async () => {
    const booking = await createBooking();
    const { rows } = await db.query(
      `select public.cancel_booking($1, 'dibatalkan sebelum bayar', true) as status`,
      [booking.booking_id],
    );
    expect(rows[0].status).toBe("CANCELLED");

    const { rows: payments } = await db.query(
      `select count(*)::int as n from payments where booking_id = $1`,
      [booking.booking_id],
    );
    expect(payments[0].n).toBe(0);
  });

  /* ------------------------------------------------------------------ *
   * rate_limit_hit + lockout
   * ------------------------------------------------------------------ */

  it("rate_limit_hit menghitung per key dan jendela direset setelah kedaluwarsa", async () => {
    const key = `test-rl-${suffix}`;
    const first = await db.query(`select * from public.rate_limit_hit($1, 2, 60)`, [key]);
    expect(first.rows[0].allowed).toBe(true);

    await db.query(`select * from public.rate_limit_hit($1, 2, 60)`, [key]);
    const third = await db.query(`select * from public.rate_limit_hit($1, 2, 60)`, [key]);
    expect(third.rows[0].allowed).toBe(false);
    expect(third.rows[0].retry_after_seconds).toBeGreaterThan(0);

    // Key lain tidak terpengaruh.
    const other = await db.query(`select * from public.rate_limit_hit($1, 2, 60)`, [`${key}-other`]);
    expect(other.rows[0].allowed).toBe(true);

    await db.query(`delete from public.rate_limit_counters where key like $1`, [`${key}%`]);
  });

  it("lockout: 5 percobaan salah mengunci kode selama 15 menit", async () => {
    const code = `SR-TEST${suffix}`;
    for (let i = 0; i < 4; i++) {
      const res = await db.query(`select * from public.booking_access_record($1, false)`, [code]);
      expect(res.rows[0].locked).toBe(false);
    }
    const fifth = await db.query(`select * from public.booking_access_record($1, false)`, [code]);
    expect(fifth.rows[0].locked).toBe(true);

    const check = await db.query(`select * from public.booking_access_is_locked($1)`, [code]);
    expect(check.rows[0].locked).toBe(true);
    expect(check.rows[0].retry_after_seconds).toBeGreaterThan(0);

    // Verifikasi yang benar tidak bisa membuka kunci — sengaja, supaya brute-force
    // tidak bisa waited out dengan satu tebakan benar.
    const right = await db.query(`select * from public.booking_access_record($1, true)`, [code]);
    expect(right.rows[0].locked).toBe(true);

    await db.query(`delete from public.booking_access_failures where booking_code = $1`, [code]);
  });

  it("verifikasi yang berhasil menghapus riwayat gagal", async () => {
    const code = `SR-OK${suffix}`;
    await db.query(`select * from public.booking_access_record($1, false)`, [code]);
    await db.query(`select * from public.booking_access_record($1, true)`, [code]);

    const { rows } = await db.query(
      `select count(*)::int as n from public.booking_access_failures where booking_code = $1`,
      [code],
    );
    expect(rows[0].n).toBe(0);
  });

  /* ------------------------------------------------------------------ *
   * find_or_create_customer: normalisasi nomor
   * ------------------------------------------------------------------ */

  it("nomor 08xx dan 62xx menunjuk ke pelanggan yang sama", async () => {
    const local = `0812${String(Date.now()).slice(-8)}`;
    const intl = `62${local.slice(1)}`;

    const first = await db.query(`select public.find_or_create_customer($1, $2, null)`, ["Customer A", local]);
    const second = await db.query(`select public.find_or_create_customer($1, $2, null)`, ["Customer B", intl]);

    expect(second.rows[0].find_or_create_customer).toBe(first.rows[0].find_or_create_customer);

    const { rows } = await db.query(
      `select phone from customers where customer_id = $1`,
      [first.rows[0].find_or_create_customer],
    );
    expect(rows[0].phone).toBe(intl);
  });

  it("nama lama tidak ditimpa diam-diam; perubahannya dicatat di audit_logs", async () => {
    const local = `0813${String(Date.now()).slice(-8)}`;
    const id = (
      await db.query(`select public.find_or_create_customer($1, $2, null)`, ["Budi Asli", local])
    ).rows[0].find_or_create_customer as string;

    await db.query(`select public.find_or_create_customer($1, $2, null)`, ["Budi Ganti", local]);

    const { rows: cust } = await db.query(`select name from customers where customer_id = $1`, [id]);
    expect(cust[0].name).toBe("Budi Asli");

    const { rows: audit } = await db.query(
      `select action, entity_id, before_data, after_data from audit_logs
        where entity_type = 'customers' and entity_id = $1`,
      [id],
    );
    expect(audit.length).toBeGreaterThan(0);
    expect(audit[0].action).toBe("customer_name_change_requested");
    expect(audit[0].before_data).toMatchObject({ name: "Budi Asli" });
    expect(audit[0].after_data).toMatchObject({ name: "Budi Ganti" });

    await db.query(`delete from audit_logs where entity_type = 'customers' and entity_id = $1`, [id]);
    await db.query(`delete from customers where customer_id = $1`, [id]);
  });

  it("nama diisi otomatis kalau pelanggan lama belum punya nama", async () => {
    const local = `0814${String(Date.now()).slice(-8)}`;
    const id = (
      await db.query(`select public.find_or_create_customer($1, $2, null)`, ["Siti", local])
    ).rows[0].find_or_create_customer as string;
    await db.query(`update customers set name = '' where customer_id = $1`, [id]);

    await db.query(`select public.find_or_create_customer($1, $2, null)`, ["Siti Lengkap", local]);
    const { rows } = await db.query(`select name from customers where customer_id = $1`, [id]);
    expect(rows[0].name).toBe("Siti Lengkap");

    await db.query(`delete from customers where customer_id = $1`, [id]);
  });
});
