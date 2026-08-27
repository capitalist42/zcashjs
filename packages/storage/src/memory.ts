import { ZcashError, type NetworkId } from "@zcash-js/core";
import { emptyWalletState, type ViewingKeyStore, type WalletRepository, type WalletState } from "./types.js";

function clone<T>(value: T): T { return structuredClone(value); }

export class MemoryWalletRepository implements WalletRepository {
  #state: WalletState | undefined;
  #opened = false;
  #queue: Promise<void> = Promise.resolve();
  async open(network: NetworkId): Promise<void> { this.#state ??= emptyWalletState(network); if (this.#state.network !== network) throw new ZcashError("NETWORK_MISMATCH", "Stored wallet belongs to another network"); this.#opened = true; }
  async read(): Promise<WalletState> { if (!this.#opened || !this.#state) throw new ZcashError("WALLET_CLOSED", "Repository is not open"); return clone(this.#state); }
  async update(mutator: (state: WalletState) => WalletState | Promise<WalletState>): Promise<WalletState> {
    let result!: WalletState;
    const operation = this.#queue.then(async () => {
      if (!this.#opened || !this.#state) throw new ZcashError("WALLET_CLOSED", "Repository is not open");
      const next = await mutator(clone(this.#state));
      if (next.network !== this.#state.network || next.schemaVersion !== this.#state.schemaVersion) throw new ZcashError("STORAGE_ERROR", "Mutator changed immutable wallet metadata");
      this.#state = { ...clone(next), revision: this.#state.revision + 1 };
      result = clone(this.#state);
    });
    this.#queue = operation.catch(() => undefined);
    await operation;
    return result;
  }
  async close(): Promise<void> { await this.#queue; this.#opened = false; }
}

export class MemoryViewingKeyStore implements ViewingKeyStore {
  readonly #keys = new Map<string, string>();
  async put(reference: string, encodedKey: string): Promise<void> { this.#keys.set(reference, encodedKey); }
  async get(reference: string): Promise<string | undefined> { return this.#keys.get(reference); }
  async delete(reference: string): Promise<void> { this.#keys.delete(reference); }
}
