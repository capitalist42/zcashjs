import { zatoshis, type Zatoshi } from "@zcash-js/core";

export interface LogicalActionShape {
  readonly transparentInputBytes?: number;
  readonly transparentOutputBytes?: number;
  readonly sproutJoinSplits?: number;
  readonly saplingSpends?: number;
  readonly saplingOutputs?: number;
  readonly orchardActions?: number;
  readonly ironwoodActions?: number;
}

export interface FeeCalculation { readonly fee: Zatoshi; readonly logicalActions: number; readonly contributions: Readonly<Record<string, number>>; }

function positiveInteger(value: number | undefined, name: string): number {
  const result = value ?? 0;
  if (!Number.isSafeInteger(result) || result < 0) throw new RangeError(`${name} must be a non-negative safe integer`);
  return result;
}

/** ZIP 317 Revision 1 conventional fee (including Ironwood). */
export function zip317Fee(shape: LogicalActionShape): FeeCalculation {
  const transparent = Math.max(Math.ceil(positiveInteger(shape.transparentInputBytes, "transparentInputBytes") / 150), Math.ceil(positiveInteger(shape.transparentOutputBytes, "transparentOutputBytes") / 34));
  const sprout = 2 * positiveInteger(shape.sproutJoinSplits, "sproutJoinSplits");
  const sapling = Math.max(positiveInteger(shape.saplingSpends, "saplingSpends"), positiveInteger(shape.saplingOutputs, "saplingOutputs"));
  const orchard = positiveInteger(shape.orchardActions, "orchardActions");
  const ironwood = positiveInteger(shape.ironwoodActions, "ironwoodActions");
  const logicalActions = transparent + sprout + sapling + orchard + ironwood;
  return { fee: zatoshis(BigInt(Math.max(2, logicalActions)) * 5_000n), logicalActions, contributions: { transparent, sprout, sapling, orchard, ironwood } };
}
