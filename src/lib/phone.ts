/**
 * Normalisasi nomor HP Indonesia ke format kanonis `62…`.
 * "0812…", "+62812…", "62812…" → "62812…".
 * Return null bila tidak bisa dinormalisasi.
 */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/[^\d]/g, "");
  if (digits.startsWith("62")) {
    // sudah format internasional, biarkan
  } else if (digits.startsWith("0")) {
    digits = "62" + digits.slice(1);
  } else if (digits.startsWith("8")) {
    digits = "62" + digits;
  }
  // pola seluler Indonesia: 62 + 8/9… dan total 10–15 digit
  if (!/^62[0-9]{8,13}$/.test(digits)) return null;
  return digits;
}

export function isValidPhone(raw: string): boolean {
  return normalizePhone(raw) !== null;
}
