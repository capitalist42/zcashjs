import { ZcashError, zatoshis, type NetworkId, type Zatoshi } from "@zcash-js/core";
import type { Pczt, TransactionSigner } from "@zcash-js/spending";

export interface PoolDescriptor {
  readonly id: string;
  readonly receiverTypecode: number;
  readonly activationHeight: Partial<Record<NetworkId, number>>;
  readonly supportsMemos: boolean;
  readonly shielded: boolean;
}

export class PoolRegistry {
  readonly #pools = new Map<string, PoolDescriptor>();
  register(pool: PoolDescriptor): void {
    if (this.#pools.has(pool.id) || [...this.#pools.values()].some((candidate) => candidate.receiverTypecode === pool.receiverTypecode)) throw new ZcashError("UNSUPPORTED_PROTOCOL", `Duplicate pool id or receiver typecode: ${pool.id}`);
    this.#pools.set(pool.id, Object.freeze(structuredClone(pool)));
  }
  get(id: string): PoolDescriptor { const pool = this.#pools.get(id); if (!pool) throw new ZcashError("UNSUPPORTED_PROTOCOL", `Unknown value pool: ${id}`); return pool; }
  active(network: NetworkId, height: number): readonly PoolDescriptor[] { return [...this.#pools.values()].filter((pool) => (pool.activationHeight[network] ?? Infinity) <= height); }
}

export interface MigrationInput { readonly noteId: string; readonly value: Zatoshi; }
export interface MigrationBatch { readonly inputIds: readonly string[]; readonly value: Zatoshi; }

/** Deterministically batches pool migrations without constructing transactions. */
export function planMigration(inputs: readonly MigrationInput[], maximumInputs: number): readonly MigrationBatch[] {
  if (!Number.isSafeInteger(maximumInputs) || maximumInputs < 1) throw new ZcashError("INVALID_ENCODING", "maximumInputs must be positive");
  const sorted = [...inputs].sort((left, right) => left.noteId.localeCompare(right.noteId)); const batches: MigrationBatch[] = [];
  for (let index = 0; index < sorted.length; index += maximumInputs) { const batch = sorted.slice(index, index + maximumInputs); batches.push({ inputIds: batch.map((item) => item.noteId), value: zatoshis(batch.reduce((sum, item) => sum + item.value, 0n)) }); }
  return batches;
}

export interface ThresholdParticipant extends TransactionSigner { readonly participantId: string; }

/** Coordinates signer roles; cryptographic share validation remains in each signer. */
export class ThresholdPcztSigner implements TransactionSigner {
  readonly name = "threshold-pczt";
  constructor(private readonly threshold: number, private readonly participants: readonly ThresholdParticipant[]) {
    if (!Number.isSafeInteger(threshold) || threshold < 1 || threshold > participants.length) throw new ZcashError("INVALID_ENCODING", "Invalid signing threshold");
    if (new Set(participants.map((participant) => participant.participantId)).size !== participants.length) throw new ZcashError("INVALID_ENCODING", "Threshold participant IDs must be unique");
  }
  async sign(pczt: Pczt, signal?: AbortSignal): Promise<Pczt> {
    let signed = pczt; let successes = 0; const causes: unknown[] = [];
    for (const participant of this.participants) {
      signal?.throwIfAborted();
      try { signed = await participant.sign(signed, signal); successes++; if (successes === this.threshold) return signed; } catch (cause) { causes.push(cause); }
    }
    throw new ZcashError("UNSUPPORTED_PROTOCOL", `Only ${successes} of ${this.threshold} required signers completed`, { cause: causes.at(-1) });
  }
}

export const standardPools = new PoolRegistry();
standardPools.register({ id: "sapling", receiverTypecode: 2, activationHeight: { mainnet: 419_200, testnet: 280_000 }, supportsMemos: true, shielded: true });
standardPools.register({ id: "orchard", receiverTypecode: 3, activationHeight: { mainnet: 1_687_104, testnet: 1_842_420 }, supportsMemos: true, shielded: true });
