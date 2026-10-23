import { revalidatePath } from "next/cache";

/**
 * Drop the public pages' cached catalogue after a media write.
 *
 * Server-only, and it lives in its own module for that reason: `lib/media.ts` is also
 * imported by `components/admin/table-editor.tsx`, which is a client component, and
 * `next build` refuses a `revalidatePath` import that ends up in the client graph —
 * while `tsc` passes it happily.
 *
 * Why it is needed at all: the public catalogue reads sit behind a 300 s fetch cache
 * and nothing in this app called `revalidatePath`. So removing a branch photo left the
 * old row — pointing at an object that had just been deleted — in the cache for five
 * minutes, and the branch page rendered a broken image the whole time. A deleted object
 * cannot be re-fetched, so the cache has to go.
 */
export function revalidatePublicMedia() {
  revalidatePath("/");
  revalidatePath("/tempat-main");
  revalidatePath("/cabang");
  // The "page" form for a dynamic segment invalidates every instance of it.
  revalidatePath("/cabang/[branch_id]", "page");
  revalidatePath("/units/[unit_id]", "page");
  revalidatePath("/snacks");
}