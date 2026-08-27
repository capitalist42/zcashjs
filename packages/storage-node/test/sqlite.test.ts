import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteWalletRepository } from "../src/index.js";

let directory: string | undefined;
afterEach(async () => { if (directory) await rm(directory, { recursive: true }); directory = undefined; });

describe("SqliteWalletRepository", () => {
  it("persists bigint wallet state across opens", async () => {
    directory = await mkdtemp(join(tmpdir(), "zcash-js-test-")); const path = join(directory, "wallet.db");
    const first = new SqliteWalletRepository(path); await first.open("testnet");
    await first.update((state) => ({ ...state, notes: [{ id: "n", accountId: "a", transactionId: "tx", pool: "orchard", value: 5n, height: 1 }] }));
    await first.close();
    const second = new SqliteWalletRepository(path); await second.open("testnet");
    expect((await second.read()).notes[0]?.value).toBe(5n); await second.close();
  });
});
