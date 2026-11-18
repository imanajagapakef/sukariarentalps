/**
 * Menjalankan fungsi saat browser menganggur.
 *
 * Dipakai untuk memuat `@supabase/supabase-js` (~250 KB) di komponen realtime:
 * data live tetap dibutuhkan, tapi tidak boleh bersaing dengan render pertama.
 * `requestIdleCallback` tidak ada di Safari lama → fallback setTimeout.
 */
export function whenIdle(fn: () => void, timeoutMs = 2_000): () => void {
  if (typeof window === "undefined") return () => {};
  const ric = (window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  }).requestIdleCallback;
  if (ric) {
    const id = ric(fn, { timeout: timeoutMs });
    return () => {
      (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
    };
  }
  const id = setTimeout(fn, timeoutMs);
  return () => clearTimeout(id);
}