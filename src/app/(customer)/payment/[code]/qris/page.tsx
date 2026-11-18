import { redirect } from "next/navigation";

/** QRIS sekarang tampil di dalam tiket; rute lama dipertahankan sebagai redirect. */
export default async function PaymentQrisPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/tiket/${encodeURIComponent(code)}`);
}