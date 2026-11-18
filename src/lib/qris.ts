import "server-only";
import QRCode from "qrcode";
import { convertQRIS } from "@/lib/qris-dinamis";

/**
 * QRIS dinamis untuk sebuah nominal, sebagai data URL.
 *
 * Dibangun dari QRIS_STATIC_STRING (payload merchant) + total, bukan dari baris
 * `payments`: QR yang sama harus muncul tanpa membuat tagihan lebih dulu, dan
 * angka yang dipindai pelanggan adalah angka yang tertulis di layar. Dipakai
 * tiket booking dan perpanjangan jam.
 *
 * Null berarti QRIS belum dikonfigurasi (atau payload merchant tidak valid);
 * pemanggil wajib menyediakan jalur lain (transfer / bayar di kasir).
 */
export async function dynamicQrisDataUrl(amount: number): Promise<string | null> {
  const staticQris = process.env.QRIS_STATIC_STRING;
  if (!staticQris) return null;
  try {
    const dynamic = convertQRIS(staticQris, { amount });
    return await QRCode.toDataURL(dynamic, { width: 448, margin: 1, errorCorrectionLevel: "M" });
  } catch {
    return null;
  }
}