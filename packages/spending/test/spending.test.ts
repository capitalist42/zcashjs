import { describe, expect, it } from "vitest";
import { Testnet, parseZec } from "@zcash-js/core";
import { LightwalletClient, type LightwalletdTransport } from "@zcash-js/light-client";
import { MemoryWalletRepository } from "@zcash-js/storage";
import { ProposalBuilder, authorizeProposal, broadcastTransaction, monitorTransaction, zip317Fee, type Pczt } from "../src/index.js";

const ADDRESS = "ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez";

async function fundedRepository(): Promise<MemoryWalletRepository> {
  const repository = new MemoryWalletRepository(); await repository.open("testnet");
  await repository.update((state) => ({ ...state,
    accounts: [{ id: "a", keyReference: "k", birthdayHeight: 1, createdAt: 1 }],
    blocks: Array.from({ length: 20 }, (_, index) => ({ height: index + 1, hash: `h${index + 1}`, previousHash: `h${index}`, time: index })),
    notes: [{ id: "n1", accountId: "a", transactionId: "fund", pool: "sapling", value: parseZec("1"), height: 1 }],
  })); return repository;
}

describe("ZIP 317", () => {
  it("uses the grace window and sums pool contributions", () => {
    expect(zip317Fee({ orchardActions: 1 }).fee).toBe(10_000n);
    expect(zip317Fee({ saplingSpends: 3, saplingOutputs: 2, orchardActions: 2 })).toMatchObject({ fee: 25_000n, logicalActions: 5 });
  });
});

describe("spending workflow", () => {
  it("selects and durably locks notes", async () => {
    const repository = await fundedRepository(); const builder = new ProposalBuilder(repository, Testnet.id);
    const proposal = await builder.propose("a", { payments: [{ address: ADDRESS, amount: parseZec("0.5") }] });
    expect(proposal).toMatchObject({ fee: 10_000n, selectedNoteIds: ["n1"], logicalActions: 2 });
    expect((await repository.read()).notes[0]?.lockedBy).toBe(proposal.id);
    await expect(builder.propose("a", { payments: [{ address: ADDRESS, amount: parseZec("0.1") }] })).rejects.toThrow();
    await builder.release(proposal); expect((await repository.read()).notes[0]?.lockedBy).toBeUndefined();
  });

  it("runs PCZT roles and broadcasts", async () => {
    const repository = await fundedRepository(); const proposal = await new ProposalBuilder(repository, "testnet").propose("a", { payments: [{ address: ADDRESS, amount: parseZec("0.5") }] });
    const mutate = (pczt: Pczt): Promise<Pczt> => Promise.resolve({ ...pczt, bytes: Uint8Array.of(...pczt.bytes, 1) });
    const transaction = await authorizeProposal(proposal, {
      constructor: { createPczt: async () => ({ proposalId: proposal.id, bytes: Uint8Array.of(1) }) },
      signer: { name: "test", sign: mutate }, prover: { prove: mutate }, finalizer: { finalize: async (pczt) => pczt.bytes },
    });
    const transport: LightwalletdTransport = { endpoint: "test", async getInfo() { return { chainName: "test", blockHeight: 1 }; }, async getBlock() { throw new Error(); }, async *getBlockRange() {}, async getTransaction() { return new Uint8Array(); }, async sendTransaction() { return "ab".repeat(32); } };
    expect(await broadcastTransaction(transaction, new LightwalletClient([transport], { retries: 0, retryDelayMs: 0 }))).toMatchObject({ txid: "ab".repeat(32) });
  });
  it("monitors submission state to a terminal confirmation", async () => {
    let calls = 0; const updates = [];
    for await (const update of monitorTransaction("ab".repeat(32), { getStatus: async () => ++calls === 1 ? { txid: "ab".repeat(32), status: "submitted" } : { txid: "ab".repeat(32), status: "mined", height: 10, confirmations: 1 } }, { pollIntervalMs: 0 })) updates.push(update.status);
    expect(updates).toEqual(["submitted", "mined"]);
  });
});
