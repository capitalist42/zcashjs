import { ZcashError, type NetworkId } from "@zcash-js/core";
import { emptyWalletState, type ViewingKeyStore, type WalletRepository, type WalletState } from "@zcash-js/storage";

export type TransportRoute = "direct" | "tor-required";
export interface TransportPolicy { routeFor(operation: "sync" | "enhance" | "broadcast"): TransportRoute; }
export const privateTransportPolicy: TransportPolicy = { routeFor: () => "tor-required" };
export const balancedTransportPolicy: TransportPolicy = { routeFor: (operation) => operation === "broadcast" ? "tor-required" : "direct" };

export interface SecretCipher { encrypt(plaintext: Uint8Array): Promise<Uint8Array>; decrypt(ciphertext: Uint8Array): Promise<Uint8Array>; }
export interface SecretBlobStore { put(key: string, value: Uint8Array): Promise<void>; get(key: string): Promise<Uint8Array | undefined>; delete(key: string): Promise<void>; }

export class EncryptedViewingKeyStore implements ViewingKeyStore {
  constructor(private readonly blobs: SecretBlobStore, private readonly cipher: SecretCipher) {}
  async put(reference: string, encodedKey: string): Promise<void> { await this.blobs.put(reference, await this.cipher.encrypt(new TextEncoder().encode(encodedKey))); }
  async get(reference: string): Promise<string | undefined> { const value = await this.blobs.get(reference); return value ? new TextDecoder("utf-8", { fatal: true }).decode(await this.cipher.decrypt(value)) : undefined; }
  delete(reference: string): Promise<void> { return this.blobs.delete(reference); }
}

export interface AsyncKeyValueStore { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void>; }
function stringify(state: WalletState): string { return JSON.stringify(state, (_key, value: unknown) => typeof value === "bigint" ? { $type: "bigint", value: value.toString() } : value instanceof Uint8Array ? { $type: "bytes", value: Array.from(value) } : value); }
function parse(value: string): WalletState {
  return JSON.parse(value, (_key, item: unknown) => {
    if (typeof item !== "object" || item === null || !("$type" in item) || !("value" in item)) return item;
    const tagged = item as { $type: unknown; value: unknown };
    if (tagged.$type === "bigint" && typeof tagged.value === "string") return BigInt(tagged.value);
    if (tagged.$type === "bytes" && Array.isArray(tagged.value)) return Uint8Array.from(tagged.value as number[]);
    return item;
  }) as WalletState;
}

/** React Native adapter over AsyncStorage-compatible key/value stores. */
export class ReactNativeWalletRepository implements WalletRepository {
  #open = false; #queue = Promise.resolve();
  constructor(private readonly storage: AsyncKeyValueStore, private readonly key = "zcash-js:wallet") {}
  async open(network: NetworkId): Promise<void> { const value = await this.storage.getItem(this.key); if (!value) await this.storage.setItem(this.key, stringify(emptyWalletState(network))); else if (parse(value).network !== network) throw new ZcashError("NETWORK_MISMATCH", "Stored wallet belongs to another network"); this.#open = true; }
  async read(): Promise<WalletState> { if (!this.#open) throw new ZcashError("WALLET_CLOSED", "Repository is closed"); const value = await this.storage.getItem(this.key); if (!value) throw new ZcashError("STORAGE_ERROR", "Wallet state is missing"); return parse(value); }
  async update(mutator: (state: WalletState) => WalletState | Promise<WalletState>): Promise<WalletState> { let result!: WalletState; const operation = this.#queue.then(async () => { const current = await this.read(); result = { ...await mutator(structuredClone(current)), revision: current.revision + 1 }; await this.storage.setItem(this.key, stringify(result)); }); this.#queue = operation.catch(() => undefined); await operation; return result; }
  async close(): Promise<void> { await this.#queue; this.#open = false; }
}

export type TelemetryEvent = { readonly name: "sync-duration" | "scan-rate" | "proving-duration" | "transport-failure"; readonly value: number; readonly tags?: Readonly<Record<string, "node" | "browser" | "react-native" | "direct" | "tor">>; };
export interface TelemetrySink { record(event: TelemetryEvent): void; }
export const noTelemetry: TelemetrySink = { record() {} };

/** Rejects accidental high-cardinality or wallet-identifying telemetry. */
export class SafeTelemetry implements TelemetrySink {
  constructor(private readonly sink: TelemetrySink) {}
  record(event: TelemetryEvent): void { if (!Number.isFinite(event.value) || event.value < 0) throw new ZcashError("INVALID_ENCODING", "Telemetry values must be finite and non-negative"); this.sink.record(structuredClone(event)); }
}
