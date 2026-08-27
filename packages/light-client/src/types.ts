import type { StoredNote, StoredTransaction } from "@zcash-js/storage";

export interface LightwalletdInfo {
  readonly chainName: string;
  readonly blockHeight: number;
  readonly consensusBranchId?: string;
  readonly vendor?: string;
}

export interface CompactBlock {
  readonly height: number;
  readonly hash: string;
  readonly previousHash: string;
  readonly time: number;
  /** Canonical protobuf bytes, retained for the Rust scanner. */
  readonly bytes: Uint8Array;
}

export interface LightwalletdTransport {
  readonly endpoint: string;
  getInfo(signal?: AbortSignal): Promise<LightwalletdInfo>;
  getBlock(height: number, signal?: AbortSignal): Promise<CompactBlock>;
  getBlockRange(startHeight: number, endHeight: number, signal?: AbortSignal): AsyncIterable<CompactBlock>;
  getTransaction(txid: string, signal?: AbortSignal): Promise<Uint8Array>;
  sendTransaction(transaction: Uint8Array, signal?: AbortSignal): Promise<string>;
}

export interface ScanAccount { readonly id: string; readonly viewingKey: string; readonly birthdayHeight: number; }
export interface ScanResult {
  readonly scannerState: Uint8Array;
  readonly notes: readonly StoredNote[];
  readonly transactions: readonly StoredTransaction[];
  readonly spentNoteIds: readonly string[];
}

export interface BlockScanner {
  scanBlock(block: CompactBlock, accounts: readonly ScanAccount[], previousState?: Uint8Array): Promise<ScanResult>;
}

export type SyncStage = "connecting" | "reconciling" | "downloading" | "scanning" | "complete";
export interface SyncProgress {
  readonly stage: SyncStage;
  readonly currentHeight: number;
  readonly targetHeight: number;
  readonly ratio: number;
  readonly endpoint?: string;
  readonly rewoundBlocks?: number;
}
