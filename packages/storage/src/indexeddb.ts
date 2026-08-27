import { ZcashError, type NetworkId } from "@zcash-js/core";
import { WALLET_SCHEMA_VERSION, emptyWalletState, type WalletRepository, type WalletState } from "./types.js";

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error); });
}

export class IndexedDbWalletRepository implements WalletRepository {
  #db: IDBDatabase | undefined;
  constructor(private readonly name = "zcash-js-wallet") {}
  async open(network: NetworkId): Promise<void> {
    if (typeof indexedDB === "undefined") throw new ZcashError("STORAGE_ERROR", "IndexedDB is unavailable in this runtime");
    const opening = indexedDB.open(this.name, WALLET_SCHEMA_VERSION);
    opening.onupgradeneeded = () => { if (!opening.result.objectStoreNames.contains("wallet")) opening.result.createObjectStore("wallet"); };
    this.#db = await request(opening);
    const current = await this.#readValue();
    if (!current) await this.#writeValue(emptyWalletState(network));
    else if (current.network !== network) throw new ZcashError("NETWORK_MISMATCH", "Stored wallet belongs to another network");
  }
  async #readValue(): Promise<WalletState | undefined> { const db = this.#required(); return request(db.transaction("wallet").objectStore("wallet").get("state")); }
  async #writeValue(value: WalletState): Promise<void> { const db = this.#required(); const tx = db.transaction("wallet", "readwrite"); tx.objectStore("wallet").put(value, "state"); await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); }
  #required(): IDBDatabase { if (!this.#db) throw new ZcashError("WALLET_CLOSED", "Repository is not open"); return this.#db; }
  async read(): Promise<WalletState> { const state = await this.#readValue(); if (!state) throw new ZcashError("STORAGE_ERROR", "Wallet state is missing"); return structuredClone(state); }
  async update(mutator: (state: WalletState) => WalletState | Promise<WalletState>): Promise<WalletState> {
    const db = this.#required();
    const tx = db.transaction("wallet", "readwrite");
    const store = tx.objectStore("wallet");
    const current = await request<WalletState>(store.get("state"));
    // Async work cannot safely keep an IndexedDB transaction alive; reject it.
    const candidate = mutator(structuredClone(current));
    if (candidate instanceof Promise) { tx.abort(); throw new ZcashError("STORAGE_ERROR", "IndexedDB repository mutators must be synchronous"); }
    const next = { ...structuredClone(candidate), revision: current.revision + 1 };
    store.put(next, "state");
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
    return next;
  }
  async close(): Promise<void> { this.#db?.close(); this.#db = undefined; }
}
