import { redirect } from "next/navigation";

/**
 * Pembayaran tidak lagi punya halaman sendiri — QRIS dan instruksi transfer
 * menyatu di tiket (`/tiket/[code]`). Rute lama dipertahankan sebagai redirect
 * supaya tautan WhatsApp/pesan lama yang sudah tersebar tetap mendarat di
 * tempat yang benar, bukan 404.
 */
export default async function PaymentPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/tiket/${encodeURIComponent(code)}`);
}