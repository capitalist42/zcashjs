import { describe, expect, it } from "vitest";
import { zatoshis } from "@zcash-js/core";
import { ThresholdPcztSigner, planMigration, standardPools } from "../src/index.js";

describe("advanced extension points", () => {
  it("plans deterministic bounded migrations", () => {
    expect(planMigration([{ noteId: "b", value: zatoshis(2n) }, { noteId: "a", value: zatoshis(1n) }], 1)).toEqual([{ inputIds: ["a"], value: 1n }, { inputIds: ["b"], value: 2n }]);
  });
  it("selects pools by activation", () => { expect(standardPools.active("mainnet", 1_700_000).map((pool) => pool.id)).toEqual(["sapling", "orchard"]); });
  it("coordinates a signing threshold", async () => {
    const signer = (participantId: string) => ({ participantId, name: participantId, sign: async (pczt: { bytes: Uint8Array; proposalId: string }) => ({ ...pczt, bytes: Uint8Array.of(...pczt.bytes, 1) }) });
    const result = await new ThresholdPcztSigner(2, [signer("a"), signer("b"), signer("c")]).sign({ proposalId: "p", bytes: new Uint8Array() });
    expect(result.bytes).toEqual(Uint8Array.of(1, 1));
  });
});
