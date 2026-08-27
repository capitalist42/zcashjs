import { ZcashError, zatoshis, type Network, type Zatoshi } from "@zcash-js/core";
import { SyncEngine, type BlockScanner, type LightwalletClient, type ScanAccount, type SyncProgress } from "@zcash-js/light-client";
import type { ShieldedPool, StoredAccount, StoredTransaction, ViewingKeyStore, WalletRepository } from "@zcash-js/storage";

export interface WalletOptions {
  readonly network: Network;
  readonly repository: WalletRepository;
  readonly viewingKeys: ViewingKeyStore;
  readonly client: LightwalletClient;
  readonly scanner: BlockScanner;
  readonly confirmations?: number;
}

export interface PoolBalance { readonly spendable: Zatoshi; readonly pending: Zatoshi; }
export interface AccountBalance { readonly sapling: PoolBalance; readonly orchard: PoolBalance; readonly total: PoolBalance; readonly asOfHeight: number; }
export interface TransactionView extends StoredTransaction { readonly confirmations: number; readonly status: "pending" | "confirmed"; }
export type WalletEvent = { readonly type: "balance-changed" | "transaction" | "rewind"; readonly accountId: string; readonly height: number };
export type WalletListener = (event: WalletEvent) => void;

function sum(values: readonly bigint[]): Zatoshi { return zatoshis(values.reduce((total, value) => total + value, 0n)); }

export class ReadOnlyWallet {
  readonly #listeners = new Set<WalletListener>();
  readonly #confirmations: number; #open = false;
  constructor(private readonly options: WalletOptions) { this.#confirmations = options.confirmations ?? 10; }
  async open(): Promise<this> { await this.options.repository.open(this.options.network.id); this.#open = true; return this; }
  async close(): Promise<void> { await this.options.repository.close(); this.#open = false; }
  #ensureOpen(): void { if (!this.#open) throw new ZcashError("WALLET_CLOSED", "Wallet is closed"); }
  subscribe(listener: WalletListener): () => void { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  #emit(event: WalletEvent): void { for (const listener of this.#listeners) listener(event); }
  async importViewingKey(input: { readonly key: string; readonly birthdayHeight: number; readonly accountId?: string }): Promise<ReadOnlyAccount> {
    this.#ensureOpen();
    if (!Number.isSafeInteger(input.birthdayHeight) || input.birthdayHeight < 0) throw new ZcashError("INVALID_ENCODING", "Birthday height must be a non-negative safe integer");
    const id = input.accountId ?? crypto.randomUUID(); const keyReference = `viewing-key:${id}`;
    await this.options.viewingKeys.put(keyReference, input.key);
    await this.options.repository.update((state) => state.accounts.some((account) => account.id === id) ? state : { ...state, accounts: [...state.accounts, { id, keyReference, birthdayHeight: input.birthdayHeight, createdAt: Date.now() }] });
    return new ReadOnlyAccount(this, id);
  }
  async accounts(): Promise<readonly ReadOnlyAccount[]> { this.#ensureOpen(); return (await this.options.repository.read()).accounts.map((account) => new ReadOnlyAccount(this, account.id)); }
  async accountRecord(id: string): Promise<StoredAccount> { this.#ensureOpen(); const account = (await this.options.repository.read()).accounts.find((item) => item.id === id); if (!account) throw new ZcashError("ACCOUNT_NOT_FOUND", `Account not found: ${id}`); return account; }
  async scanAccounts(): Promise<readonly ScanAccount[]> {
    const state = await this.options.repository.read();
    return Promise.all(state.accounts.map(async (account) => { const viewingKey = await this.options.viewingKeys.get(account.keyReference); if (!viewingKey) throw new ZcashError("STORAGE_ERROR", `Viewing key unavailable for account ${account.id}`); return { id: account.id, viewingKey, birthdayHeight: account.birthdayHeight }; }));
  }
  syncEngine(): SyncEngine { return new SyncEngine(this.options.repository, this.options.client, this.options.scanner); }
  repository(): WalletRepository { return this.options.repository; }
  confirmations(): number { return this.#confirmations; }
  emit(event: WalletEvent): void { this.#emit(event); }
  async rewind(height: number): Promise<void> {
    this.#ensureOpen();
    await this.options.repository.update((state) => ({ ...state, blocks: state.blocks.filter((block) => block.height <= height), notes: state.notes.filter((note) => note.height <= height).map((note) => note.spentHeight !== undefined && note.spentHeight > height ? { id: note.id, accountId: note.accountId, transactionId: note.transactionId, pool: note.pool, value: note.value, height: note.height } : note), transactions: state.transactions.filter((transaction) => transaction.height <= height) }));
    for (const account of (await this.options.repository.read()).accounts) this.#emit({ type: "rewind", accountId: account.id, height });
  }
}

export class ReadOnlyAccount {
  constructor(private readonly wallet: ReadOnlyWallet, readonly id: string) {}
  async *sync(signal?: AbortSignal): AsyncIterable<SyncProgress> {
    const account = await this.wallet.accountRecord(this.id); const accounts = await this.wallet.scanAccounts();
    const before = await this.wallet.repository().read();
    for await (const progress of this.wallet.syncEngine().sync(accounts, Math.min(...(await this.wallet.repository().read()).accounts.map((item) => item.birthdayHeight)), signal)) yield progress;
    const after = await this.wallet.repository().read();
    if (after.notes.length !== before.notes.length) this.wallet.emit({ type: "balance-changed", accountId: this.id, height: after.blocks.at(-1)?.height ?? account.birthdayHeight });
    for (const transaction of after.transactions.slice(before.transactions.length).filter((tx) => tx.accountId === this.id)) this.wallet.emit({ type: "transaction", accountId: this.id, height: transaction.height });
  }
  async balance(): Promise<AccountBalance> {
    await this.wallet.accountRecord(this.id); const state = await this.wallet.repository().read(); const tip = state.blocks.at(-1)?.height ?? 0;
    const notes = state.notes.filter((note) => note.accountId === this.id && note.spentHeight === undefined);
    const pool = (name: ShieldedPool): PoolBalance => { const selected = notes.filter((note) => note.pool === name); const spendable = selected.filter((note) => tip - note.height + 1 >= this.wallet.confirmations()).map((note) => note.value); const pending = selected.filter((note) => tip - note.height + 1 < this.wallet.confirmations()).map((note) => note.value); return { spendable: sum(spendable), pending: sum(pending) }; };
    const sapling = pool("sapling"); const orchard = pool("orchard");
    return { sapling, orchard, total: { spendable: sum([sapling.spendable, orchard.spendable]), pending: sum([sapling.pending, orchard.pending]) }, asOfHeight: tip };
  }
  async transactions(): Promise<readonly TransactionView[]> {
    await this.wallet.accountRecord(this.id); const state = await this.wallet.repository().read(); const tip = state.blocks.at(-1)?.height ?? 0;
    return state.transactions.filter((transaction) => transaction.accountId === this.id).map((transaction): TransactionView => { const confirmations = Math.max(0, tip - transaction.height + 1); return { ...transaction, confirmations, status: confirmations >= this.wallet.confirmations() ? "confirmed" : "pending" }; }).sort((left, right) => right.height - left.height);
  }
  async rescan(signal?: AbortSignal): Promise<void> { const account = await this.wallet.accountRecord(this.id); await this.wallet.rewind(account.birthdayHeight - 1); for await (const _ of this.sync(signal)) { /* drain */ } }
}

export async function createReadOnlyWallet(options: WalletOptions): Promise<ReadOnlyWallet> { return new ReadOnlyWallet(options).open(); }
