import { ZcashError } from "@zcash-js/core";
import type { CompactBlock, LightwalletdInfo, LightwalletdTransport } from "./types.js";

export interface LightwalletClientOptions { readonly retries?: number; readonly retryDelayMs?: number; }

function aborted(signal?: AbortSignal): void { if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError"); }

export class LightwalletClient {
  readonly #retries: number; readonly #delay: number;
  constructor(readonly transports: readonly LightwalletdTransport[], options: LightwalletClientOptions = {}) {
    if (transports.length === 0) throw new ZcashError("NETWORK_ERROR", "At least one lightwalletd transport is required");
    this.#retries = options.retries ?? 2; this.#delay = options.retryDelayMs ?? 100;
  }
  get endpoint(): string { return this.transports[0]!.endpoint; }
  async #call<T>(operation: (transport: LightwalletdTransport) => Promise<T>, signal?: AbortSignal): Promise<T> {
    let cause: unknown;
    for (let attempt = 0; attempt <= this.#retries; attempt++) for (const transport of this.transports) {
      aborted(signal);
      try { return await operation(transport); } catch (error) { cause = error; aborted(signal); }
      if (this.#delay > 0) await new Promise<void>((resolve, reject) => { const id = setTimeout(resolve, this.#delay * 2 ** attempt); signal?.addEventListener("abort", () => { clearTimeout(id); reject(signal.reason); }, { once: true }); });
    }
    throw new ZcashError("NETWORK_ERROR", "All lightwalletd endpoints failed", { cause });
  }
  getInfo(signal?: AbortSignal): Promise<LightwalletdInfo> { return this.#call((transport) => transport.getInfo(signal), signal); }
  getBlock(height: number, signal?: AbortSignal): Promise<CompactBlock> { return this.#call((transport) => transport.getBlock(height, signal), signal); }
  getTransaction(txid: string, signal?: AbortSignal): Promise<Uint8Array> { return this.#call((transport) => transport.getTransaction(txid, signal), signal); }
  sendTransaction(transaction: Uint8Array, signal?: AbortSignal): Promise<string> { return this.#call((transport) => transport.sendTransaction(transaction, signal), signal); }
  async *getBlockRange(start: number, end: number, signal?: AbortSignal): AsyncIterable<CompactBlock> {
    // Ranges resume at the last yielded height, preventing duplicate scans after failover.
    let next = start;
    while (next <= end) {
      const blocks = await this.#call(async (transport) => {
        const result: CompactBlock[] = [];
        for await (const block of transport.getBlockRange(next, end, signal)) result.push(block);
        return result;
      }, signal);
      if (blocks.length === 0) throw new ZcashError("NETWORK_ERROR", `Server returned an empty range at height ${next}`);
      for (const block of blocks) { if (block.height !== next) throw new ZcashError("SYNC_ERROR", `Expected block ${next}, received ${block.height}`); yield block; next++; }
    }
  }
}
