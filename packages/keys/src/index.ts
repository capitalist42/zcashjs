import { ZcashError, type NetworkId } from "@zcash-js/core";

declare const handleBrand: unique symbol;
export type KeyHandle = string & { readonly [handleBrand]: true };
export type ViewingAuthority = "incoming" | "full";

export interface AccountKeys {
  /** Opaque backend handle; never serialized as key material. */
  readonly handle: KeyHandle;
  readonly network: NetworkId;
  readonly accountIndex: number;
}

export interface KeyDerivationBackend {
  createAccount(input: { readonly network: NetworkId; readonly accountIndex: number; readonly entropy?: Uint8Array }): Promise<AccountKeys>;
  importSeed(input: { readonly network: NetworkId; readonly accountIndex: number; readonly seed: Uint8Array }): Promise<AccountKeys>;
  exportViewingKey(handle: KeyHandle, authority: ViewingAuthority): Promise<string>;
  deriveUnifiedAddress(handle: KeyHandle, diversifierIndex?: bigint): Promise<{ readonly address: string; readonly diversifierIndex: bigint }>;
  destroy(handle: KeyHandle): Promise<void>;
}

export class KeyAccount {
  #destroyed = false;
  constructor(private readonly backend: KeyDerivationBackend, readonly keys: AccountKeys) {}
  #active(): void { if (this.#destroyed) throw new ZcashError("WALLET_CLOSED", "Key handle has been destroyed"); }
  async viewingKey(authority: ViewingAuthority): Promise<string> { this.#active(); return this.backend.exportViewingKey(this.keys.handle, authority); }
  async address(diversifierIndex?: bigint): Promise<{ readonly address: string; readonly diversifierIndex: bigint }> { this.#active(); return this.backend.deriveUnifiedAddress(this.keys.handle, diversifierIndex); }
  async destroy(): Promise<void> { if (!this.#destroyed) await this.backend.destroy(this.keys.handle); this.#destroyed = true; }
  toJSON(): never { throw new ZcashError("INVALID_ENCODING", "Key accounts cannot be serialized"); }
  toString(): string { return "[Zcash KeyAccount]"; }
}

export async function createKeyAccount(backend: KeyDerivationBackend, input: { readonly network: NetworkId; readonly accountIndex?: number }): Promise<KeyAccount> {
  const accountIndex = input.accountIndex ?? 0;
  if (!Number.isSafeInteger(accountIndex) || accountIndex < 0) throw new ZcashError("INVALID_ENCODING", "Account index must be non-negative");
  return new KeyAccount(backend, await backend.createAccount({ network: input.network, accountIndex }));
}
