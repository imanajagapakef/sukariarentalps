import { describe, expect, it } from "vitest";
import { extensionWindow } from "@/services/extension.service";

/**
 * Aturan pemilihan jam perpanjangan (murni, tanpa database).
 *
 * Yang dijaga: UI dan RPC memakai batas yang sama. RPC menolak
 * `new_end + cleaning > boundary`, jadi helper ini tidak boleh menawarkan
 * kombinasi yang lebih longgar — kalau tidak, tombol yang tampil akan gagal.
 */
const base = {
  scheduled_end_at: "2031-01-01T10:00:00+07:00",
  latest_extendable_at: null as string | null,
  config: {
    minimum_extension_minutes: 60,
    extension_interval_minutes: 60,
    cleaning_duration_minutes: 10,
  },
  quotes: [
    { minutes: 60, amount: 15_000 },
    { minutes: 120, amount: 30_000 },
    { minutes: 180, amount: 40_000 },
  ],
};

describe("extensionWindow", () => {
  it("menawarkan tiga jam saat tidak ada booking berikutnya", () => {
    const w = extensionWindow(base);
    expect(w.options.map((o) => o.minutes)).toEqual([60, 120, 180]);
    expect(w.options[0].amount).toBe(15_000);
    expect(w.noRoom).toBe(false);
  });

  it("berhenti sebelum booking berikutnya, menyisakan waktu pembersihan", () => {
    // Booking berikutnya 12:10, pembersihan 10 menit -> sesi harus selesai 12:00.
    const w = extensionWindow({
      ...base,
      latest_extendable_at: "2031-01-01T12:10:00+07:00",
    });
    expect(w.options.map((o) => o.minutes)).toEqual([60, 120]);
    expect(new Date(w.options[1].new_end_at).toISOString()).toBe(
      new Date("2031-01-01T12:00:00+07:00").toISOString(),
    );
  });

  it("tidak menawarkan apa pun kalau booking berikutnya datang tepat setelah pembersihan", () => {
    const w = extensionWindow({
      ...base,
      latest_extendable_at: "2031-01-01T10:10:00+07:00",
    });
    expect(w.options).toEqual([]);
    expect(w.noRoom).toBe(true);
  });

  it("menghormati minimum yang lebih panjang dari satu jam", () => {
    const w = extensionWindow({
      ...base,
      config: { ...base.config, minimum_extension_minutes: 90 },
    });
    expect(w.options.map((o) => o.minutes)).toEqual([120, 180]);
  });
});