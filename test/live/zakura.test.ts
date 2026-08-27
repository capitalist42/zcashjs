import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LightwalletClient, SyncEngine, type BlockScanner, type SyncProgress } from "@zcash-js/light-client";
import { NodeGrpcLightwalletdTransport } from "@zcash-js/light-client-node";
import { ZcashRpcClient } from "@zcash-js/rpc";
import { MemoryWalletRepository } from "@zcash-js/storage";
import { SqliteWalletRepository } from "@zcash-js/storage-node";

const live = process.env.ZCASH_JS_LIVE_REGTEST === "1" ? describe : describe.skip;
const rpcEndpoint = process.env.ZAKURA_RPC_URL ?? "http://127.0.0.1:18432";
const grpcEndpoint = process.env.LIGHTWALLETD_GRPC_ADDR ?? "127.0.0.1:19067";

async function eventually<T>(operation: () => Promise<T>, predicate: (value: T) => boolean, timeoutMs = 90_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try { const value = await operation(); if (predicate(value)) return value; }
    catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("service did not reach the expected state", { cause: lastError });
}

live("Zakura + lightwalletd", () => {
  const rpc = new ZcashRpcClient({ endpoint: rpcEndpoint });
  const transport = new NodeGrpcLightwalletdTransport(grpcEndpoint);
  const client = new LightwalletClient([transport], { retries: 1, retryDelayMs: 50 });
  let workdir = "";
  let startHeight = 0;
  let targetHeight = 0;

  beforeAll(async () => {
    workdir = await mkdtemp(join(tmpdir(), "zcash-js-regtest-"));
    const initial = await eventually(() => rpc.getBlockchainInfo(), () => true);
    startHeight = initial.blocks;
    const hashes = await rpc.call<string[]>("generate", [3]);
    expect(hashes).toHaveLength(3);
    targetHeight = (await rpc.getBlockchainInfo()).blocks;
    await eventually(() => client.getInfo(), (info) => info.blockHeight >= targetHeight);
  }, 120_000);

  afterAll(async () => { transport.close(); if (workdir) await rm(workdir, { recursive: true, force: true }); });

  it("mines through Zakura RPC and observes blocks through lightwalletd", async () => {
    const node = await rpc.getBlockchainInfo();
    const lightwalletd = await client.getInfo();
    expect(node.blocks).toBeGreaterThanOrEqual(startHeight + 3);
    expect(lightwalletd.blockHeight).toBeGreaterThanOrEqual(node.blocks);
    expect(lightwalletd.chainName.toLowerCase()).toContain("regtest");
  });

  it("downloads canonical, continuous compact blocks", async () => {
    const blocks = [];
    for await (const block of client.getBlockRange(targetHeight - 2, targetHeight)) blocks.push(block);
    expect(blocks.map((block) => block.height)).toEqual([targetHeight - 2, targetHeight - 1, targetHeight]);
    for (let index = 1; index < blocks.length; index++) expect(blocks[index]!.previousHash).toBe(blocks[index - 1]!.hash);
    expect(blocks.every((block) => block.bytes.length > 0)).toBe(true);
  });

  it.each([
    ["memory", async () => new MemoryWalletRepository()],
    ["sqlite", async () => new SqliteWalletRepository(join(workdir, "wallet.sqlite"))],
  ] as const)("persists and resumes real-chain sync with %s storage", async (_name, makeRepository) => {
    const repository = await makeRepository();
    await repository.open("regtest");
    const scanner: BlockScanner = { async scanBlock(block) { return { scannerState: Uint8Array.of(block.height & 255), notes: [], transactions: [], spentNoteIds: [] }; } };
    const engine = new SyncEngine(repository, client, scanner, { batchSize: 2 });
    const first: SyncProgress[] = [];
    for await (const progress of engine.sync([], targetHeight - 2)) first.push(progress);
    expect(first.at(-1)).toMatchObject({ stage: "complete", currentHeight: targetHeight });
    expect((await repository.read()).blocks.at(-1)?.height).toBe(targetHeight);
    const resumed: SyncProgress[] = [];
    for await (const progress of engine.sync([], targetHeight - 2)) resumed.push(progress);
    expect(resumed.filter((progress) => progress.stage === "scanning")).toHaveLength(0);
    await repository.close();
  });

  it("surfaces lightwalletd rejection of malformed transactions", async () => {
    await expect(client.sendTransaction(Uint8Array.of(0xde, 0xad, 0xbe, 0xef))).rejects.toThrow();
  });
});
