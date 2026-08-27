import { sha256 } from "@noble/hashes/sha2.js";
import { base58check, bech32, bech32m } from "@scure/base";
import { ByteReader, Mainnet, NETWORKS, ZcashError, type Network, type NetworkId } from "@zcash-js/core";

const b58check = base58check(sha256);
const SAPLING_LENGTH = 43;

export type AddressKind = "transparent-p2pkh" | "transparent-p2sh" | "sapling" | "unified";

export interface DecodedAddress {
  readonly encoded: string;
  readonly kind: AddressKind;
  readonly network: NetworkId;
  /** Raw receiver for legacy addresses; jumbled ZIP 316 payload for Unified Addresses. */
  readonly data: Uint8Array;
}

export interface UnifiedReceiver {
  readonly typecode: number;
  readonly kind: "transparent-p2pkh" | "transparent-p2sh" | "sapling" | "orchard" | "unknown";
  readonly data: Uint8Array;
}

export interface UnifiedAddress {
  readonly encoded: string;
  readonly network: NetworkId;
  readonly receivers: readonly UnifiedReceiver[];
}

export interface UnifiedPayloadDecoder {
  unjumbleUnifiedPayload(payload: Uint8Array): Uint8Array;
}

function equalPrefix(value: Uint8Array, prefix: Uint8Array): boolean {
  return prefix.every((byte, index) => value[index] === byte);
}

function decodeTransparent(encoded: string): DecodedAddress | undefined {
  let payload: Uint8Array;
  try { payload = b58check.decode(encoded); } catch { return undefined; }
  if (payload.length !== 22) return undefined;
  for (const network of NETWORKS) {
    if (equalPrefix(payload, network.transparentP2pkhPrefix)) {
      return { encoded, kind: "transparent-p2pkh", network: network.id, data: payload.slice(2) };
    }
    if (equalPrefix(payload, network.transparentP2shPrefix)) {
      return { encoded, kind: "transparent-p2sh", network: network.id, data: payload.slice(2) };
    }
  }
  return undefined;
}

function decodeSapling(encoded: string): DecodedAddress | undefined {
  try {
    const decoded = bech32.decode(encoded, 1_000);
    const network = NETWORKS.find((candidate) => candidate.saplingHrp === decoded.prefix);
    if (!network) return undefined;
    const data = bech32.fromWords(decoded.words);
    return data.length === SAPLING_LENGTH ? { encoded, kind: "sapling", network: network.id, data } : undefined;
  } catch { return undefined; }
}

function decodeUnified(encoded: string): DecodedAddress | undefined {
  try {
    const decoded = bech32m.decode(encoded, false);
    const network = NETWORKS.find((candidate) => candidate.unifiedHrp === decoded.prefix);
    if (!network) return undefined;
    const data = bech32m.fromWords(decoded.words);
    // F4Jumble accepts messages from 48 through 4,194,368 bytes.
    return data.length >= 48 && data.length <= 4_194_368
      ? { encoded, kind: "unified", network: network.id, data }
      : undefined;
  } catch { return undefined; }
}

export function decodeAddress(encoded: string, expectedNetwork?: NetworkId): DecodedAddress {
  if (encoded.length === 0 || encoded.trim() !== encoded) {
    throw new ZcashError("INVALID_ADDRESS", "Address must be a non-empty string without surrounding whitespace");
  }
  const decoded = decodeTransparent(encoded) ?? decodeSapling(encoded) ?? decodeUnified(encoded);
  if (!decoded) throw new ZcashError("INVALID_ADDRESS", "Unknown or invalid Zcash address encoding");
  if (expectedNetwork && decoded.network !== expectedNetwork) {
    throw new ZcashError("NETWORK_MISMATCH", `Expected ${expectedNetwork}, received ${decoded.network} address`);
  }
  return decoded;
}

export function isValidAddress(encoded: string, expectedNetwork?: NetworkId): boolean {
  try { decodeAddress(encoded, expectedNetwork); return true; } catch { return false; }
}

export function encodeTransparentAddress(
  receiver: Uint8Array,
  kind: "transparent-p2pkh" | "transparent-p2sh",
  network: Network = Mainnet,
): string {
  if (receiver.length !== 20) throw new ZcashError("INVALID_ADDRESS", "Transparent receiver must contain 20 bytes");
  const prefix = kind === "transparent-p2pkh" ? network.transparentP2pkhPrefix : network.transparentP2shPrefix;
  const payload = new Uint8Array(prefix.length + receiver.length);
  payload.set(prefix); payload.set(receiver, prefix.length);
  return b58check.encode(payload);
}

export function encodeSaplingAddress(receiver: Uint8Array, network: Network = Mainnet): string {
  if (receiver.length !== SAPLING_LENGTH) throw new ZcashError("INVALID_ADDRESS", "Sapling receiver must contain 43 bytes");
  return bech32.encode(network.saplingHrp, bech32.toWords(receiver), 1_000);
}

/** Fully decodes ZIP 316 after F4Jumble inversion by the Rust backend. */
export function inspectUnifiedAddress(encoded: string, backend: UnifiedPayloadDecoder): UnifiedAddress {
  const address = decodeAddress(encoded);
  if (address.kind !== "unified") throw new ZcashError("INVALID_ADDRESS", "Expected a Unified Address");
  const network = NETWORKS.find((candidate) => candidate.id === address.network)!;
  const raw = backend.unjumbleUnifiedPayload(address.data);
  const padding = new Uint8Array(16);
  padding.set(new TextEncoder().encode(network.unifiedHrp));
  if (raw.length < 17 || !padding.every((byte, index) => raw[raw.length - 16 + index] === byte)) {
    throw new ZcashError("INVALID_ADDRESS", "Unified Address has invalid network padding");
  }
  const reader = new ByteReader(raw.slice(0, -16));
  const receivers: UnifiedReceiver[] = [];
  let lastTypecode = -1;
  let hasShielded = false;
  let hasTransparent = false;
  while (reader.remaining > 0) {
    const typecode = reader.readCompactSize();
    const length = reader.readCompactSize();
    if (typecode <= lastTypecode) throw new ZcashError("INVALID_ADDRESS", "Unified receiver typecodes must be unique and ascending");
    const data = reader.read(length);
    const kind = typecode === 0 ? "transparent-p2pkh" : typecode === 1 ? "transparent-p2sh" : typecode === 2 ? "sapling" : typecode === 3 ? "orchard" : "unknown";
    const expected = typecode <= 1 ? 20 : typecode <= 3 ? 43 : undefined;
    if (expected !== undefined && data.length !== expected) throw new ZcashError("INVALID_ADDRESS", `Receiver type ${typecode} must contain ${expected} bytes`);
    if (typecode <= 1) {
      if (hasTransparent) throw new ZcashError("INVALID_ADDRESS", "A Unified Address cannot contain both transparent receiver types");
      hasTransparent = true;
    }
    if (typecode === 2 || typecode === 3) hasShielded = true;
    receivers.push({ typecode, kind, data });
    lastTypecode = typecode;
  }
  if (!hasShielded) throw new ZcashError("INVALID_ADDRESS", "ZIP 316 Revision 0 requires a shielded receiver");
  return { encoded, network: address.network, receivers };
}
