import { describe, expect, it } from "vitest";
import { checkImageFile, mediaPath, orphanedImageUrl, MAX_IMAGE_BYTES } from "@/lib/media";

/** Minimal File stand-in: mediaPath only reads name, type and bytes. */
function fakeFile(name: string, body: string, type = "image/png"): File {
  return new File([new TextEncoder().encode(body)], name, { type });
}

describe("media path", () => {
  it("gives two different files the same filename different keys", async () => {
    // The regression. Staff upload files named cover.svg / item.svg — that is every
    // cover in the catalogue — and the key used to be the filename alone, so with
    // `upsert` a replacement reused the same object *and* the same public URL. The
    // admin table decides whether a row is dirty by comparing that URL, so an
    // image-only edit looked like no edit at all and Simpan stayed disabled.
    const before = await mediaPath("games", "GM-002", fakeFile("cover.svg", "<svg>old</svg>", "image/svg+xml"));
    const after = await mediaPath("games", "GM-002", fakeFile("cover.svg", "<svg>new</svg>", "image/svg+xml"));
    expect(after).not.toBe(before);
  });

  it("reuses the key when the very same file is uploaded again", async () => {
    // Idempotence is the point of hashing the bytes rather than the name: picking
    // the same picture twice must not leave the previous object orphaned.
    const one = fakeFile("item.webp", "same bytes");
    const two = fakeFile("item.webp", "same bytes");
    expect(await mediaPath("snacks", "SNK-001", one)).toBe(await mediaPath("snacks", "SNK-001", two));
  });

  it("namespaces by entity and row id", async () => {
    const path = await mediaPath("units", "B5-R06", fakeFile("cover.png", "bytes"));
    expect(path.startsWith("units/B5-R06/")).toBe(true);
    expect(path.endsWith(".png")).toBe(true);
  });

  it("keeps a readable slug from the original name", async () => {
    const path = await mediaPath("games", "GM-001", fakeFile("EA Sports FC 25.webp", "bytes"));
    // slug + hash + extension, no spaces and no uppercase leaking into the key.
    expect(path).toMatch(/^games\/GM-001\/ea-sports-fc-25-[0-9a-f]+\.webp$/);
  });

  it("still rejects the wrong mime type and oversize files", () => {
    expect(checkImageFile(fakeFile("x.txt", "bytes", "text/plain"))).toMatch(/tidak didukung/);
    const big = fakeFile("big.png", "x");
    Object.defineProperty(big, "size", { value: MAX_IMAGE_BYTES + 1 });
    expect(checkImageFile(big)).toMatch(/5 MB/);
    expect(checkImageFile(fakeFile("ok.png", "bytes"))).toBeNull();
  });
});

describe("orphaned image reference", () => {
  const OLD = "https://x.supabase.co/storage/v1/object/public/media/games/GM-026/cover.svg";

  it("hands back the file a removal leaves unreferenced", () => {
    expect(orphanedImageUrl({ image_url: null }, OLD)).toBe(OLD);
  });

  it("leaves the file alone when the save set a different URL", () => {
    // Replacing a cover keeps the row pointing at something real.
    expect(orphanedImageUrl({ image_url: "https://x/new-abc.png" }, OLD)).toBe("");
  });

  it("leaves the file alone when the save never touched image_url", () => {
    // The column absent from the payload must not be read as a removal. This is the
    // bug that made every unrelated edit on a coverless row try to delete a file.
    expect(orphanedImageUrl({ name: "Halo" }, OLD)).toBe("");
    expect(orphanedImageUrl({}, OLD)).toBe("");
  });

  it("has nothing to purge when the row had no file to begin with", () => {
    expect(orphanedImageUrl({ image_url: null }, null)).toBe("");
    expect(orphanedImageUrl({ image_url: null }, undefined)).toBe("");
    expect(orphanedImageUrl({ image_url: null }, "")).toBe("");
  });

  it("ignores a missing or malformed payload", () => {
    expect(orphanedImageUrl(null, OLD)).toBe("");
    expect(orphanedImageUrl(undefined, OLD)).toBe("");
    expect(orphanedImageUrl("image_url", OLD)).toBe("");
  });

  it("does not re-purge the file when the row is saved again unchanged", () => {
    // Saving a cleared row a second time must not try to delete anything.
    expect(orphanedImageUrl({ image_url: null }, null)).toBe("");
  });
});