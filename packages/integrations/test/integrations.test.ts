import { describe, expect, it } from "vitest";
import { EncryptedViewingKeyStore, ReactNativeWalletRepository } from "../src/index.js";

describe("production adapters", () => {
  it("encrypts viewing keys before persistence", async () => {
    const blobs = new Map<string, Uint8Array>();
    const store = new EncryptedViewingKeyStore({ put: async (k, v) => { blobs.set(k, v); }, get: async (k) => blobs.get(k), delete: async (k) => { blobs.delete(k); } }, { encrypt: async (v) => Uint8Array.from(v, (b) => b ^ 0xff), decrypt: async (v) => Uint8Array.from(v, (b) => b ^ 0xff) });
    await store.put("k", "secret-viewing-key"); expect(new TextDecoder().decode(blobs.get("k"))).not.toContain("secret"); expect(await store.get("k")).toBe("secret-viewing-key");
  });
  it("persists through an AsyncStorage-compatible adapter", async () => {
    const values = new Map<string, string>(); const kv = { getItem: async (k: string) => values.get(k) ?? null, setItem: async (k: string, v: string) => { values.set(k, v); }, removeItem: async (k: string) => { values.delete(k); } };
    const repository = new ReactNativeWalletRepository(kv); await repository.open("testnet"); await repository.update((state) => ({ ...state, notes: [{ id: "n", accountId: "a", transactionId: "t", pool: "orchard", value: 7n, height: 1 }] })); await repository.close(); await repository.open("testnet"); expect((await repository.read()).notes[0]?.value).toBe(7n);
  });
});
