import { describe, expect, it } from "vitest";
import { createWasmBackend } from "../src/index.js";

describe("Wasm boundary", () => {
  it("adapts generated exports and validates input bounds", () => {
    const backend = createWasmBackend({
      backend_version: () => "test",
      unjumble_unified_payload: (payload) => payload.slice().reverse(),
    });
    expect(backend.version).toBe("test");
    expect(backend.unjumbleUnifiedPayload(new Uint8Array(48).fill(1))).toHaveLength(48);
    expect(() => backend.unjumbleUnifiedPayload(new Uint8Array(47))).toThrow();
  });
});
