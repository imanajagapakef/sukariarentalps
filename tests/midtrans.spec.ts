import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createSnapTransaction, verifySignature } from "@/lib/midtrans";

const TEST_SERVER_KEY = "test-server-key";
process.env.MIDTRANS_SERVER_KEY = TEST_SERVER_KEY;

const sig = (orderId: string, statusCode: string, gross: string) =>
  createHash("sha512").update(`${orderId}${statusCode}${gross}${TEST_SERVER_KEY}`).digest("hex");

describe("midtrans lib", () => {
  it("verifies a correct signature and rejects bad ones", () => {
    const good = sig("PAY-1", "200", "35000");
    expect(verifySignature({ order_id: "PAY-1", status_code: "200", gross_amount: "35000", signature_key: good })).toBe(true);
    expect(verifySignature({ order_id: "PAY-1", status_code: "200", gross_amount: "35000", signature_key: "nope" })).toBe(false);
    expect(verifySignature({ order_id: "PAY-1", status_code: "200", gross_amount: "35000" })).toBe(false);
  });

  it("posts to Snap and returns token + redirect_url", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ token: "tok-abc", redirect_url: "https://app.sandbox.midtrans.com/snap/v2/vtx.html?token=tok-abc" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createSnapTransaction({
      order_id: "PAY-1",
      gross_amount: 35000,
      customer: { first_name: "Budi", phone: "0812345678" },
    });

    expect(result.token).toBe("tok-abc");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/snap/v1/transactions");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from(`${TEST_SERVER_KEY}:`).toString("base64")}`);
    vi.unstubAllGlobals();
  });

  it("throws when Snap answers with an error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ message: "boom" }), { status: 400 })));
    await expect(
      createSnapTransaction({ order_id: "PAY-1", gross_amount: 1, customer: { first_name: "x", phone: "1" } }),
    ).rejects.toThrow(/Midtrans Snap gagal/);
    vi.unstubAllGlobals();
  });
});
