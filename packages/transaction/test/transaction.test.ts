import { describe, expect, it } from "vitest";
import { parseTransactionHeader } from "../src/index.js";

describe("transaction envelope", () => {
  it("parses a v5 header", () => {
    const bytes = Uint8Array.of(
      5, 0, 0, 128,
      0x0a, 0x27, 0xa7, 0x26,
      0xb4, 0xd0, 0xd6, 0xc2,
      1, 0, 0, 0,
      40, 0, 0, 0,
    );
    expect(parseTransactionHeader(bytes)).toMatchObject({ version: 5, overwintered: true, lockTime: 1, expiryHeight: 40, headerLength: 20 });
  });
  it("rejects truncated and unknown versions", () => {
    expect(() => parseTransactionHeader(Uint8Array.of(5))).toThrow();
    expect(() => parseTransactionHeader(Uint8Array.of(9, 0, 0, 0))).toThrow();
  });
});
