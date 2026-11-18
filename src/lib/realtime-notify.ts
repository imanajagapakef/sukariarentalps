/**
 * Memberi tahu klien admin bahwa data berubah.
 *
 * Kenapa broadcast, bukan `postgres_changes`: `postgres_changes` menghormati RLS,
 * dan di project ini event untuk `bookings`/`payment_proofs` tidak sampai ke
 * klien staf (sudah diuji: UPDATE dan INSERT tidak memicu refresh). Broadcast
 * lewat REST Realtime tidak melewati RLS baca tabel — ia hanya mengirim sinyal
 * "ada yang berubah, muat ulang" — sehingga selalu sampai.
 *
 * Payload sengaja kosong: klien hanya memakai sinyalnya untuk `router.refresh()`,
 * dan semua angka dibaca ulang dari server. Broadcast palsu tidak bisa mengubah
 * tampilan selain memicu satu refresh.
 *
 * Fire-and-forget: kegagalan notifikasi tidak boleh menggagalkan penulisan yang
 * sudah berhasil, dan tidak ada yang perlu ditampilkan ke kasir.
 */
export const ADMIN_CHANNEL = "admin:data";

export function notifyAdminChanged(): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  void fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [{ topic: ADMIN_CHANNEL, event: "changed", payload: {} }],
    }),
    // Jangan tahan response route handler menunggu realtime.
    keepalive: true,
  }).catch(() => {
    /* sinyal opsional; klien punya fallback berkala */
  });
}