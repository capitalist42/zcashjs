import { describe, expect, it } from "vitest";
import { Testnet } from "@zcash-js/core";
import { LightwalletClient, type BlockScanner, type CompactBlock, type LightwalletdTransport } from "@zcash-js/light-client";
import { MemoryViewingKeyStore, MemoryWalletRepository } from "@zcash-js/storage";
import { createReadOnlyWallet } from "../src/index.js";

class SyntheticChain implements LightwalletdTransport {
  readonly endpoint = "synthetic://chain";
  blocks: CompactBlock[] = [];
  async getInfo() { return { chainName: "regtest", blockHeight: this.blocks.at(-1)?.height ?? 0 }; }
  async getBlock(height: number) { const block = this.blocks.find((item) => item.height === height); if (!block) throw new Error("missing block"); return block; }
  async *getBlockRange(start: number, end: number) { for (const block of this.blocks.filter((item) => item.height >= start && item.height <= end)) yield block; }
  async getTransaction() { return new Uint8Array(); }
  async sendTransaction() { return "txid"; }
}

const scanner: BlockScanner = {
  async scanBlock(block, accounts) {
    const value = BigInt(block.bytes[0] ?? 0);
    const accountId = accounts[0]!.id;
    return {
      scannerState: Uint8Array.of(block.height), spentNoteIds: [],
      notes: value === 0n ? [] : [{ id: `note:${block.hash}`, accountId, transactionId: `tx:${block.hash}`, pool: "orchard", value, height: block.height }],
      transactions: value === 0n ? [] : [{ id: `tx:${block.hash}`, accountId, height: block.height, timestamp: block.time, direction: "incoming", value }],
    };
  },
};

function block(height: number, hash: string, previousHash: string, value = 0): CompactBlock { return { height, hash, previousHash, time: height, bytes: Uint8Array.of(value) }; }

describe("read-only wallet synchronization", () => {
  it("restores from birthday, reports balances/history, and rewinds a fork", async () => {
    const chain = new SyntheticChain();
    chain.blocks = [block(1, "a1", "a0"), block(2, "a2", "a1", 5), block(3, "a3", "a2")];
    const repository = new MemoryWalletRepository();
    const wallet = await createReadOnlyWallet({ network: Testnet, repository, viewingKeys: new MemoryViewingKeyStore(), client: new LightwalletClient([chain], { retries: 0, retryDelayMs: 0 }), scanner, confirmations: 2 });
    const account = await wallet.importViewingKey({ key: "uviewtest1opaque", birthdayHeight: 1, accountId: "primary" });
    const progress = []; for await (const item of account.sync()) progress.push(item);
    expect(progress.at(-1)).toMatchObject({ stage: "complete", currentHeight: 3 });
    expect(await account.balance()).toMatchObject({ orchard: { spendable: 5n, pending: 0n }, asOfHeight: 3 });
    expect((await account.transactions())[0]).toMatchObject({ id: "tx:a2", status: "confirmed", confirmations: 2 });

    chain.blocks = [block(1, "a1", "a0"), block(2, "b2", "a1"), block(3, "b3", "b2")];
    for await (const _ of account.sync()) { /* drain */ }
    expect((await account.balance()).total.spendable).toBe(0n);
    expect(await account.transactions()).toEqual([]);
    expect((await repository.read()).blocks.map((item) => item.hash)).toEqual(["a1", "b2", "b3"]);
    await wallet.close();
  });

  it("resumes after an interrupted range", async () => {
    const chain = new SyntheticChain(); chain.blocks = [block(5, "a5", "a4"), block(6, "a6", "a5")];
    const repository = new MemoryWalletRepository();
    const wallet = await createReadOnlyWallet({ network: Testnet, repository, viewingKeys: new MemoryViewingKeyStore(), client: new LightwalletClient([chain], { retries: 0, retryDelayMs: 0 }), scanner });
    const account = await wallet.importViewingKey({ key: "view", birthdayHeight: 5, accountId: "a" });
    for await (const progress of account.sync()) if (progress.currentHeight === 5) break;
    expect((await repository.read()).blocks.at(-1)?.height).toBe(5);
    for await (const _ of account.sync()) { /* resume */ }
    expect((await repository.read()).blocks.at(-1)?.height).toBe(6);
  });
});
