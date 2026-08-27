import { describe, expect, it } from "vitest";
import { MemoryWalletRepository } from "../src/index.js";

describe("MemoryWalletRepository", () => {
  it("serializes atomic updates", async () => {
    const storage = new MemoryWalletRepository(); await storage.open("testnet");
    await Promise.all(Array.from({ length: 10 }, () => storage.update(async (state) => { await Promise.resolve(); return { ...state, accounts: [...state.accounts] }; })));
    expect((await storage.read()).revision).toBe(10);
  });
  it("rejects network reuse", async () => {
    const storage = new MemoryWalletRepository(); await storage.open("mainnet");
    await expect(storage.open("testnet")).rejects.toThrow();
  });
  it("retains state after close and reopen", async () => {
    const storage = new MemoryWalletRepository(); await storage.open("testnet");
    await storage.update((state) => ({ ...state, accounts: [{ id: "a", keyReference: "k", birthdayHeight: 1, createdAt: 1 }] }));
    await storage.close(); await storage.open("testnet");
    expect((await storage.read()).accounts[0]?.id).toBe("a");
  });
});
