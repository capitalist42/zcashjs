import { ByteReader, ZcashError } from "@zcash-js/core";

export interface TransactionHeader {
  readonly version: 1 | 2 | 3 | 4 | 5;
  readonly overwintered: boolean;
  readonly versionGroupId?: number;
  readonly consensusBranchId?: number;
  readonly lockTime?: number;
  readonly expiryHeight?: number;
  readonly headerLength: number;
  readonly serializedLength: number;
}

/**
 * Reads the consensus transaction envelope without interpreting bundles.
 * This is suitable for routing and diagnostics, not consensus validation.
 */
export function parseTransactionHeader(bytes: Uint8Array): TransactionHeader {
  if (bytes.length > 2_000_000) throw new ZcashError("INVALID_ENCODING", "Serialized transaction exceeds the 2 MB parser limit");
  const reader = new ByteReader(bytes);
  const rawVersion = reader.readUint32LE();
  const overwintered = (rawVersion & 0x8000_0000) !== 0;
  const version = rawVersion & 0x7fff_ffff;
  if (version < 1 || version > 5) throw new ZcashError("UNSUPPORTED_PROTOCOL", `Unsupported transaction version: ${version}`);
  if (version <= 2 && overwintered) throw new ZcashError("INVALID_ENCODING", `Transaction version ${version} cannot set the overwinter flag`);
  if (version >= 3 && !overwintered) throw new ZcashError("INVALID_ENCODING", `Transaction version ${version} must set the overwinter flag`);
  if (version === 5) {
    const versionGroupId = reader.readUint32LE();
    const consensusBranchId = reader.readUint32LE();
    const lockTime = reader.readUint32LE();
    const expiryHeight = reader.readUint32LE();
    return { version, overwintered, versionGroupId, consensusBranchId, lockTime, expiryHeight, headerLength: reader.offset, serializedLength: bytes.length };
  }
  const versionGroupId = version >= 3 ? reader.readUint32LE() : undefined;
  return {
    version: version as 1 | 2 | 3 | 4,
    overwintered,
    ...(versionGroupId === undefined ? {} : { versionGroupId }),
    headerLength: reader.offset,
    serializedLength: bytes.length,
  };
}
