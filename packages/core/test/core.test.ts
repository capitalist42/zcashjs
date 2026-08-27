import { describe, expect, it } from "vitest";
import { ByteReader, MAX_MONEY, addZatoshis, formatZec, fromHex, parseZec, toHex, zatoshis } from "../src/index.js";

describe("amounts", () => {
  it("parses and formats exact ZEC", () => {
    expect(parseZec("1.23000000")).toBe(123_000_000n);
    expect(formatZec(parseZec("0.00000001"))).toBe("0.00000001");
    expect(addZatoshis(parseZec("1"), parseZec("2"))).toBe(300_000_000n);
  });
  it("rejects invalid monetary values", () => {
    expect(() => parseZec(".1")).toThrow();
    expect(() => zatoshis(MAX_MONEY + 1n)).toThrow();
  });
});

describe("bytes", () => {
  it("round trips hex and reads canonical CompactSize", () => {
    expect(toHex(fromHex("00aF"))).toBe("00af");
    expect(new ByteReader(Uint8Array.of(253, 253, 0)).readCompactSize()).toBe(253);
  });
  it("rejects non-canonical CompactSize", () => {
    expect(() => new ByteReader(Uint8Array.of(253, 1, 0)).readCompactSize()).toThrow();
  });
});
