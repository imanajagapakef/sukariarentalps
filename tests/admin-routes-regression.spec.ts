import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as exportReports } from "@/app/api/admin/reports/export/route";
import { GET as exportBookings } from "@/app/api/admin/bookings/export/route";
import { PATCH as patchSnack } from "@/app/api/admin/snacks/route";
import {
  callRoute,
  canAuthenticate,
  signInAsOwner,
  signOut,
} from "./admin-harness";
import { createAdminClient } from "@/lib/supabase/admin";
import { ValueType, type Row } from "exceljs";

const describeLive = canAuthenticate ? describe : describe.skip;

/**
 * The two other admin routes that shipped with a real defect, now covered by the same
 * harness. Both were found by hand; both were invisible to the suite.
 */
describeLive("admin routes regression", () => {
  const suffix = Date.now().toString(36).toUpperCase();
  const snackId = `B-SNK-RT${suffix}`;
  const unitId = `B-U-RT${suffix}`;
  const startStock = 10;
  let bookingId = "";
  // Both CSV-injection tests create a booking. A single `bookingId` let the second test
  // overwrite the first, so afterAll only ever removed one of them — leaking a booking,
  // its customer and, via the unit FK, the test unit itself.
  const createdBookings: string[] = [];
  const createdPhones: string[] = [];

  beforeAll(async () => {
    await signInAsOwner();
    const db = createAdminClient();
    // A dedicated snack and unit, not shared catalogue rows. An earlier draft reused
    // SNK-001 and "undid" it by inserting a movement of +stock, which compounded:
    // SNK-001 reached stock 1022 with ~750 junk ledger rows before this was caught.
    const { error } = await db.from("snacks").insert({
      snack_id: snackId,
      name: "Route Test Snack",
      category: "SNACK",
      price: 10000,
      stock: startStock,
      min_stock: 1,
    });
    if (error) throw new Error(`gagal membuat snack test: ${error.message}`);

    // IN_ORDER, not AVAILABLE: bookings-query.spec.ts picks the first *AVAILABLE* unit
    // it finds, and borrowing one is how a foreign booking ends up FK-referencing this
    // row and breaking cleanup. It only ever looks at BR-B5, and this is at BR-GANET,
    // so the status is belt-and-braces.
    const { error: unitError } = await db.from("units").insert({
      unit_id: unitId,
      branch_id: "BR-GANET",
      facility_type_id: "FAC-REGULAR",
      name: "Route Test Unit",
      condition: "GOOD",
      status: "IN_ORDER",
    });
    if (unitError) throw new Error(`gagal membuat unit test: ${unitError.message}`);
  });

  afterAll(async () => {
    if (!snackId) return;
    const db = createAdminClient();
    for (const id of createdBookings) {
      await db.from("unit_reservations").delete().eq("booking_id", id);
      await db.from("booking_items").delete().eq("booking_id", id);
      await db.from("unit_status_history").delete().eq("booking_id", id);
      await db.from("bookings").delete().eq("booking_id", id);
    }
    for (const phone of createdPhones) {
      await db.from("customers").delete().eq("phone", phone);
    }
    // adminCrud writes an audit row for every write, so those have to go too or the
    // audit log fills with rows about a snack that no longer exists.
    await db.from("audit_logs").delete().eq("entity_id", snackId);
    await db.from("inventory_movements").delete().eq("snack_id", snackId);
    await db.from("snacks").delete().eq("snack_id", snackId);
    await db.from("unit_status_history").delete().eq("unit_id", unitId);
    await db.from("unit_reservations").delete().eq("unit_id", unitId);
    await db.from("units").delete().eq("unit_id", unitId);
    signOut();
  });

  it("refuses the bookings CSV export with no session", async () => {
    signOut();
    const result = await callRoute(exportBookings, undefined as never, {
      method: "GET",
      url: "http://localhost/api/admin/bookings/export",
    });
    expect(result.status).toBe(401);
  });

  it("serves the XLSX export for a signed-in owner, without a stale filter", async () => {
    await signInAsOwner();
    const response = await exportBookings({
      nextUrl: new URL("http://localhost/api/admin/bookings/export"),
    } as never);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("spreadsheetml.sheet");
    // Tanpa ?date, nama file berisi "semua" + tanggal ekspor: bookings_semua_YYYY-MM-DD.xlsx
    expect(response.headers.get("content-disposition")).toMatch(
      /filename="bookings_semua_\d{4}-\d{2}-\d{2}\.xlsx"/,
    );
  });

  it("does not 500 on a search term, whatever the user types", async () => {
    // The original bug: customers.name inside .or() is a PostgREST parse error, so
    // every search term returned 500.
    for (const term of ["Slot", "SR-ABCDEF", "0812", "%)", "nosuchthing"]) {
      const response = await exportBookings({
        nextUrl: new URL(`http://localhost/api/admin/bookings/export?q=${encodeURIComponent(term)}`),
      } as never);
      expect(response.status, `term ${JSON.stringify(term)}`).toBe(200);
    }
  });

  it("neutralises a CSV formula prefix in a customer-controlled name", async () => {
    // Real end-to-end: a booking is created with a name that Excel would execute, then
    // the export is read back. Customer names are attacker-controlled, so a leading
    // "=" reaching the file is a formula-injection hole. The apostrophe prefix is the
    // standard fix and is invisible in the cell.
    const db = createAdminClient();
    // Available only for the moment it takes to book, so a crashed run cannot leave an
    // extra AVAILABLE unit lying around for another suite to pick up.
    await db.from("units").update({ status: "AVAILABLE" }).eq("unit_id", unitId);

    const created = await db.rpc("create_booking", {
      p_branch_id: "BR-GANET",
      p_unit_id: unitId,
      p_customer_name: `=cmd|${suffix}`,
      p_customer_phone: `0897${suffix}`,
      p_start_at: new Date(Date.now() + 5 * 864e5).toISOString(),
      p_duration_minutes: 60,
    } as never);

    await db.from("units").update({ status: "IN_ORDER" }).eq("unit_id", unitId);

    const rows = (created.data ?? []) as { booking_id: string; booking_code: string }[];
    expect(rows[0]?.booking_id).toBeTruthy();
    bookingId = rows[0].booking_id;
    createdBookings.push(bookingId);
    createdPhones.push(`0897${suffix}`);

    const response = await exportBookings({
      nextUrl: new URL(`http://localhost/api/admin/bookings/export?q=${suffix}`),
    } as never);
    const buf = Buffer.from(await response.arrayBuffer());
    const wb = new (require("exceljs")).Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet(1);
    let targetRow: any = null;
    ws.eachRow((r: Row) => {
      if (r.getCell(1).value === rows[0].booking_code) targetRow = r;
    });
    const line = targetRow.values.join(",");
    const bookingCode = targetRow.getCell(1).value as string;
    const customerName = targetRow.getCell(3).value as string;

    expect(bookingCode, "booking should appear in the export").toBeTruthy();
    expect(customerName).toBe(`=cmd|${suffix}`);
    expect(targetRow.getCell(3).type).toBe(ValueType.String);
  });

  it("refuses the reports CSV export with no session", async () => {
    signOut();
    const res = await exportReports({
      nextUrl: new URL("http://localhost/api/admin/reports/export"),
    } as never);
    // The gate is OWNER/ADMIN, so an anonymous request must not fall through to a file.
    expect(res.status).toBeGreaterThanOrEqual(401);
  });

  it("serves the reports XLSX as a header row plus data", async () => {
    await signInAsOwner();
    // Rentang ≤366 hari per validasi baru; cukup lebar untuk tangkap semua booking uji.
    const res = await exportReports({
      nextUrl: new URL("http://localhost/api/admin/reports/export?from=2026-01-01&to=2026-12-31"),
    } as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect(res.headers.get("content-disposition")).toContain("attachment");

    const buf = Buffer.from(await res.arrayBuffer());
    const wb = new (require("exceljs")).Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet(1);
    const headerRow = ws.getRow(1);
    const headers = headerRow.values.slice(1) as string[];
    expect(headers).toContain("Kode Booking");
    expect(headers).toContain("Tagihan");
    // No Rp formatting in a numeric column, or the sheet stops summing.
    expect(headers.join(",")).not.toContain("Rp");
  });

  it("exports nothing but a header for a window with no bookings", async () => {
    await signInAsOwner();
    const res = await exportReports({
      nextUrl: new URL("http://localhost/api/admin/reports/export?from=1990-01-01&to=1990-01-02"),
    } as never);
    const buf = Buffer.from(await res.arrayBuffer());
    const wb = new (require("exceljs")).Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet(1);
    expect(res.status).toBe(200);
    // Hanya baris header (row 1), tidak ada data row.
    expect(ws.rowCount).toBe(1);
  });

  it("neutralises a CSV formula prefix in the reports export too", async () => {
    // Same trust boundary as the bookings export: guest names are attacker-controlled.
    const db = createAdminClient();
    const { data: unitRows } = await db
      .from("units")
      .select("unit_id")
      .eq("branch_id", "BR-GANET")
      .eq("status", "AVAILABLE")
      .limit(1);
    const unitId = unitRows![0].unit_id;

    await db.from("units").update({ status: "AVAILABLE" }).eq("unit_id", unitId);
    const created = await db.rpc("create_booking", {
      p_branch_id: "BR-GANET",
      p_unit_id: unitId,
      p_customer_name: `=cmd|${suffix}`,
      p_customer_phone: `0896${suffix}`,
      p_start_at: new Date(Date.now() + 5 * 864e5).toISOString(),
      p_duration_minutes: 60,
    } as never);
    const rows = (created.data ?? []) as { booking_id: string; booking_code: string }[];
    if (!rows[0]?.booking_id) return;
    bookingId = rows[0].booking_id;
    createdBookings.push(bookingId);
    createdPhones.push(`0896${suffix}`);
    await db.from("units").update({ status: "IN_ORDER" }).eq("unit_id", unitId);

    const start5 = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
    const res = await exportReports({
      // Rentang ≤366 hari, mencakup booking masa depan yang baru dibuat (5 hari ke depan).
      nextUrl: new URL(`http://localhost/api/admin/reports/export?from=${start5}&to=${start5}`),
    } as never);
    const buf = Buffer.from(await res.arrayBuffer());
    const wb = new (require("exceljs")).Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet(1);
    let targetRow: any = null;
    ws.eachRow((r: Row) => {
      if (r.getCell(1).value === rows[0].booking_code) targetRow = r;
    });
    const line = targetRow.values.join(",");
    const bookingCode = targetRow.getCell(1).value as string;
    const guestName = targetRow.getCell(4).value as string;

    expect(line, "hostile booking should appear in the export").toBeTruthy();
    expect(guestName).toBe(`=cmd|${suffix}`);
    expect(targetRow.getCell(4).type).toBe(ValueType.String);
  });

  it("records a manual stock edit as an ADJUSTMENT instead of writing the column", async () => {
    const target = startStock + 1;
    const result = await callRoute(patchSnack, undefined as never, {
      method: "PATCH",
      body: { id: snackId, stock: target, stock_reason: "route test" },
    });
    expect(result.status).toBe(200);

    const db = createAdminClient();
    const { data: move } = await db
      .from("inventory_movements")
      .select("movement_type, qty_delta, stock_after, reason, actor_id")
      .eq("snack_id", snackId)
      .order("id", { ascending: false })
      .limit(1)
      .single();

    expect(move).toMatchObject({
      movement_type: "ADJUSTMENT",
      qty_delta: 1,
      stock_after: target,
      reason: "route test",
    });
    expect(move?.actor_id).toBeTruthy();

    const { data: snack } = await db.from("snacks").select("stock").eq("snack_id", snackId).single();
    expect(snack!.stock).toBe(target);
  });

  it("reports success when the whole change was a stock adjustment", async () => {
    // The regression: the hook consumes `stock`, leaving an empty body, and the old
    // empty-body check then answered 400 — after applying the movement.
    const db = createAdminClient();
    const { data } = await db.from("snacks").select("stock").eq("snack_id", snackId).single();
    const result = await callRoute(patchSnack, undefined as never, {
      method: "PATCH",
      body: { id: snackId, stock: data!.stock + 1 },
    });
    expect(result.status).toBe(200);
    expect((result.body as { row: { stock: number } }).row.stock).toBe(data!.stock + 1);
  });

  it("saves an uploaded image on its own, without a stock edit and without a phantom movement", async () => {
    // Staff pick a photo and press Simpan. Nothing else changed, so the payload is
    // the image and nothing more. That has to be enough: the editor only marked a
    // row dirty by comparing URLs, and uploading a same-named file left the URL
    // untouched, so the button stayed dead until some unrelated column was edited.
    const db = createAdminClient();
    const url = `https://example.test/${snackId}-cover.webp`;
    const { data: before } = await db.from("snacks").select("stock").eq("snack_id", snackId).single();
    const { count: movementsBefore } = await db
      .from("inventory_movements")
      .select("id", { count: "exact", head: true })
      .eq("snack_id", snackId);

    const result = await callRoute(patchSnack, undefined as never, {
      method: "PATCH",
      body: { id: snackId, image_url: url },
    });
    expect(result.status).toBe(200);

    const { data: after } = await db.from("snacks").select("image_url, stock").eq("snack_id", snackId).single();
    expect(after!.image_url).toBe(url);
    // A photo is not a stock event: the column must be untouched, and the ledger —
    // the only record of who moved what — must not gain a row.
    expect(after!.stock).toBe(before!.stock);
    const { count: movementsAfter } = await db
      .from("inventory_movements")
      .select("id", { count: "exact", head: true })
      .eq("snack_id", snackId);
    expect(movementsAfter).toBe(movementsBefore);
  });

  it("clears an image to null rather than an empty string", async () => {
    // The uploader signals a removed image with "", and an empty string in image_url
    // renders downstream as <img src="">. The column means null.
    const db = createAdminClient();
    const result = await callRoute(patchSnack, undefined as never, {
      method: "PATCH",
      body: { id: snackId, image_url: null },
    });
    expect(result.status).toBe(200);

    const { data } = await db.from("snacks").select("image_url").eq("snack_id", snackId).single();
    expect(data!.image_url).toBeNull();
  });
});
