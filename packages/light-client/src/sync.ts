import { ZcashError } from "@zcash-js/core";
import type { StoredBlock, WalletRepository, WalletState } from "@zcash-js/storage";
import { LightwalletClient } from "./client.js";
import type { BlockScanner, ScanAccount, SyncProgress } from "./types.js";

export interface SyncEngineOptions { readonly maxReorgDepth?: number; readonly batchSize?: number; }

function ratio(current: number, start: number, target: number): number { return target <= start ? 1 : Math.max(0, Math.min(1, (current - start) / (target - start))); }

export class SyncEngine {
  readonly #maxReorgDepth: number; readonly #batchSize: number;
  constructor(private readonly repository: WalletRepository, private readonly client: LightwalletClient, private readonly scanner: BlockScanner, options: SyncEngineOptions = {}) {
    this.#maxReorgDepth = options.maxReorgDepth ?? 100; this.#batchSize = options.batchSize ?? 100;
  }
  async #reconcile(target: number, signal?: AbortSignal): Promise<number> {
    const state = await this.repository.read();
    let position = Math.min(state.blocks.at(-1)?.height ?? -1, target);
    const original = state.blocks.at(-1)?.height ?? position;
    let depth = 0;
    while (position >= 0) {
      const local = state.blocks.find((block) => block.height === position);
      if (!local) { position--; continue; }
      const remote = await this.client.getBlock(position, signal);
      if (remote.hash === local.hash) break;
      if (++depth > this.#maxReorgDepth) throw new ZcashError("REORG_TOO_DEEP", `Reorganization exceeds ${this.#maxReorgDepth} blocks`);
      position--;
    }
    if (position < original) await this.repository.update((current) => ({
      ...current,
      blocks: current.blocks.filter((block) => block.height <= position),
      notes: current.notes.filter((note) => note.height <= position).map((note) => note.spentHeight !== undefined && note.spentHeight > position ? (({ spentHeight: _, ...rest }) => rest)(note) : note),
      transactions: current.transactions.filter((transaction) => transaction.height <= position),
    }));
    return original - position;
  }
  async *sync(accounts: readonly ScanAccount[], birthdayHeight: number, signal?: AbortSignal): AsyncIterable<SyncProgress> {
    yield { stage: "connecting", currentHeight: 0, targetHeight: 0, ratio: 0, endpoint: this.client.endpoint };
    const info = await this.client.getInfo(signal); const target = info.blockHeight;
    const rewoundBlocks = await this.#reconcile(target, signal);
    let state = await this.repository.read();
    let current = state.blocks.at(-1)?.height ?? birthdayHeight - 1;
    yield { stage: "reconciling", currentHeight: current, targetHeight: target, ratio: ratio(current, birthdayHeight - 1, target), rewoundBlocks };
    const start = current;
    while (current < target) {
      const end = Math.min(target, current + this.#batchSize);
      yield { stage: "downloading", currentHeight: current, targetHeight: target, ratio: ratio(current, start, target), endpoint: this.client.endpoint };
      for await (const block of this.client.getBlockRange(current + 1, end, signal)) {
        signal?.throwIfAborted();
        const previous = state.blocks.at(-1);
        if (previous && (block.height !== previous.height + 1 || block.previousHash !== previous.hash)) throw new ZcashError("SYNC_ERROR", `Compact chain discontinuity at height ${block.height}`);
        const result = await this.scanner.scanBlock(block, accounts.filter((account) => account.birthdayHeight <= block.height), previous?.scannerState);
        const storedBlock: StoredBlock = { height: block.height, hash: block.hash, previousHash: block.previousHash, time: block.time, scannerState: result.scannerState };
        state = await this.repository.update((wallet) => {
          const spent = new Set(result.spentNoteIds);
          const notes = wallet.notes.map((note) => spent.has(note.id) ? { ...note, spentHeight: block.height } : note);
          const noteIds = new Set(notes.map((note) => note.id));
          const txIds = new Set(wallet.transactions.map((transaction) => `${transaction.accountId}:${transaction.id}`));
          return { ...wallet, blocks: [...wallet.blocks, storedBlock], notes: [...notes, ...result.notes.filter((note) => !noteIds.has(note.id))], transactions: [...wallet.transactions, ...result.transactions.filter((tx) => !txIds.has(`${tx.accountId}:${tx.id}`))] };
        });
        current = block.height;
        yield { stage: "scanning", currentHeight: current, targetHeight: target, ratio: ratio(current, start, target) };
      }
    }
    yield { stage: "complete", currentHeight: current, targetHeight: target, ratio: 1 };
  }
}
