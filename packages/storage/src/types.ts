import type { NetworkId } from "@zcash-js/core";

export const WALLET_SCHEMA_VERSION = 1;
export type ShieldedPool = "sapling" | "orchard";

export interface StoredAccount {
  readonly id: string;
  readonly keyReference: string;
  readonly birthdayHeight: number;
  readonly createdAt: number;
}

export interface StoredBlock {
  readonly height: number;
  readonly hash: string;
  readonly previousHash: string;
  readonly time: number;
  readonly scannerState?: Uint8Array;
}

export interface StoredNote {
  readonly id: string;
  readonly accountId: string;
  readonly transactionId: string;
  readonly pool: ShieldedPool;
  readonly value: bigint;
  readonly height: number;
  readonly spentHeight?: number;
  readonly lockedBy?: string;
  readonly lockExpiresAt?: number;
}

export interface StoredTransaction {
  readonly id: string;
  readonly accountId: string;
  readonly height: number;
  readonly timestamp: number;
  readonly direction: "incoming" | "outgoing" | "self" | "shielding";
  readonly value: bigint;
  readonly fee?: bigint;
  readonly memo?: Uint8Array;
}

export interface WalletState {
  readonly schemaVersion: typeof WALLET_SCHEMA_VERSION;
  readonly network: NetworkId;
  readonly revision: number;
  readonly accounts: readonly StoredAccount[];
  readonly blocks: readonly StoredBlock[];
  readonly notes: readonly StoredNote[];
  readonly transactions: readonly StoredTransaction[];
}

export function emptyWalletState(network: NetworkId): WalletState {
  return { schemaVersion: WALLET_SCHEMA_VERSION, network, revision: 0, accounts: [], blocks: [], notes: [], transactions: [] };
}

export interface WalletRepository {
  open(network: NetworkId): Promise<void>;
  read(): Promise<WalletState>;
  /** Commits all changes atomically and serializes concurrent writers. */
  update(mutator: (state: WalletState) => WalletState | Promise<WalletState>): Promise<WalletState>;
  close(): Promise<void>;
}

/** Viewing keys live outside public chain state and may be keystore-encrypted. */
export interface ViewingKeyStore {
  put(reference: string, encodedKey: string): Promise<void>;
  get(reference: string): Promise<string | undefined>;
  delete(reference: string): Promise<void>;
}
