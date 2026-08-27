import { describe, expect, it } from "vitest";
import { ZcashRpcClient } from "../src/index.js";

describe("ZcashRpcClient", () => {
  it("sends typed JSON-RPC requests", async () => {
    const client = new ZcashRpcClient({ endpoint: "http://node", fetch: async (_input, init) => { const request = JSON.parse(String(init?.body)) as { method: string }; return Response.json({ result: { chain: "test", blocks: 42, method: request.method }, error: null }); } });
    expect(await client.getBlockchainInfo()).toMatchObject({ chain: "test", blocks: 42 });
  });
  it("maps RPC failures to structured errors", async () => {
    const client = new ZcashRpcClient({ endpoint: "http://node", fetch: async () => Response.json({ result: null, error: { code: -1, message: "bad" } }) });
    await expect(client.getBlockchainInfo()).rejects.toThrow("RPC getblockchaininfo failed");
  });
});
