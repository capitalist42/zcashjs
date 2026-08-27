import { describe, expect, it } from "vitest";
import { createKeyAccount, type KeyDerivationBackend, type KeyHandle } from "../src/index.js";

describe("opaque keys", () => {
  it("never serializes handles and destroys backend state", async () => {
    let destroyed = false; const backend: KeyDerivationBackend = { createAccount: async ({ network, accountIndex }) => ({ network, accountIndex, handle: "opaque" as KeyHandle }), importSeed: async ({ network, accountIndex }) => ({ network, accountIndex, handle: "opaque" as KeyHandle }), exportViewingKey: async () => "uview", deriveUnifiedAddress: async () => ({ address: "u1opaque", diversifierIndex: 0n }), destroy: async () => { destroyed = true; } };
    const account = await createKeyAccount(backend, { network: "testnet" }); expect(account.toString()).not.toContain("opaque"); expect(() => JSON.stringify(account)).toThrow(); await account.destroy(); expect(destroyed).toBe(true); await expect(account.viewingKey("full")).rejects.toThrow();
  });
});
