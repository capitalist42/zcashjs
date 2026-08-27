import { ZcashError } from "@zcash-js/core";

export interface CryptoBackend {
  readonly name: string;
  readonly version: string;
  unjumbleUnifiedPayload(payload: Uint8Array): Uint8Array;
}

export interface ZcashWasmModule {
  backend_version(): string;
  unjumble_unified_payload(payload: Uint8Array): Uint8Array;
}

/** Adapts the generated wasm-bindgen module without coupling callers to it. */
export function createWasmBackend(module: ZcashWasmModule): CryptoBackend {
  if (typeof module.backend_version !== "function" || typeof module.unjumble_unified_payload !== "function") {
    throw new ZcashError("UNSUPPORTED_PROTOCOL", "The loaded Wasm module does not implement the zcash-js backend interface");
  }
  return Object.freeze({
    name: "zcash-js-rust-wasm",
    version: module.backend_version(),
    unjumbleUnifiedPayload(payload: Uint8Array): Uint8Array {
      if (payload.length < 48 || payload.length > 4_194_368) {
        throw new ZcashError("INVALID_ENCODING", "F4Jumble payload length is outside ZIP 316 bounds");
      }
      try { return module.unjumble_unified_payload(payload); }
      catch (cause) { throw new ZcashError("INVALID_ENCODING", "Rust backend rejected the Unified Address payload", { cause }); }
    },
  });
}
