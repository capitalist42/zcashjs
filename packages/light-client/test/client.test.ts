import { describe, expect, it } from "vitest";
import { LightwalletClient, type CompactBlock, type LightwalletdTransport } from "../src/index.js";

function transport(endpoint: string, fails: boolean): LightwalletdTransport {
  const block: CompactBlock = { height: 1, hash: "01", previousHash: "00", time: 1, bytes: new Uint8Array() };
  return { endpoint,
    async getInfo() { if (fails) throw new Error("offline"); return { chainName: "test", blockHeight: 1 }; },
    async getBlock() { if (fails) throw new Error("offline"); return block; },
    async *getBlockRange() { if (fails) throw new Error("offline"); yield block; },
    async getTransaction() { if (fails) throw new Error("offline"); return new Uint8Array(); },
    async sendTransaction() { if (fails) throw new Error("offline"); return "txid"; },
  };
}

describe("LightwalletClient", () => {
  it("fails over between transports", async () => {
    const client = new LightwalletClient([transport("bad", true), transport("good", false)], { retries: 0, retryDelayMs: 0 });
    expect((await client.getInfo()).blockHeight).toBe(1);
  });
  it("validates range continuity", async () => {
    const client = new LightwalletClient([transport("good", false)], { retries: 0, retryDelayMs: 0 });
    const heights: number[] = []; for await (const block of client.getBlockRange(1, 1)) heights.push(block.height);
    expect(heights).toEqual([1]);
  });
});
