import { describe, expect, it } from "vitest";
import { Mainnet, Testnet, parseZec } from "@zcash-js/core";
import { decodeAddress, encodePaymentUri, encodeSaplingAddress, encodeTransparentAddress, parsePaymentUri } from "../src/index.js";

const SAPLING_VECTOR = "ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez";
const TRANSPARENT_VECTOR = "tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU";

describe("addresses", () => {
  it("decodes official ZIP 321 vectors", () => {
    expect(decodeAddress(SAPLING_VECTOR)).toMatchObject({ kind: "sapling", network: "testnet" });
    expect(decodeAddress(TRANSPARENT_VECTOR)).toMatchObject({ kind: "transparent-p2pkh", network: "testnet" });
  });
  it("round trips generated legacy addresses", () => {
    const t = encodeTransparentAddress(new Uint8Array(20).fill(7), "transparent-p2sh", Mainnet);
    expect(decodeAddress(t, "mainnet").data).toEqual(new Uint8Array(20).fill(7));
    const z = encodeSaplingAddress(new Uint8Array(43).fill(9), Testnet);
    expect(decodeAddress(z).data).toEqual(new Uint8Array(43).fill(9));
  });
});

describe("ZIP 321", () => {
  it("parses the official memo example", () => {
    const parsed = parsePaymentUri(`zcash:${SAPLING_VECTOR}?amount=1&memo=VGhpcyBpcyBhIHNpbXBsZSBtZW1vLg&message=Thank%20you`);
    expect(parsed.payments[0]?.amount).toBe(100_000_000n);
    expect(new TextDecoder().decode(parsed.payments[0]?.memo)).toBe("This is a simple memo.");
  });
  it("round trips multiple payments", () => {
    const uri = encodePaymentUri({ payments: [
      { address: SAPLING_VECTOR, amount: parseZec("1.25"), label: "shop" },
      { address: TRANSPARENT_VECTOR, amount: parseZec("2") },
    ] });
    expect(parsePaymentUri(uri).payments).toHaveLength(2);
  });
  it("rejects memo on a transparent payment", () => {
    expect(() => parsePaymentUri(`zcash:${TRANSPARENT_VECTOR}?memo=SGk`)).toThrow();
  });
});
