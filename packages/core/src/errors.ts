export type ZcashErrorCode =
  | "INVALID_AMOUNT"
  | "AMOUNT_OUT_OF_RANGE"
  | "INVALID_ENCODING"
  | "INVALID_ADDRESS"
  | "NETWORK_MISMATCH"
  | "INVALID_PAYMENT_URI"
  | "UNSUPPORTED_PROTOCOL"
  | "TRUNCATED_DATA"
  | "STORAGE_ERROR"
  | "STORAGE_BUSY"
  | "MIGRATION_REQUIRED"
  | "NETWORK_ERROR"
  | "SYNC_ERROR"
  | "REORG_TOO_DEEP"
  | "WALLET_CLOSED"
  | "ACCOUNT_NOT_FOUND";

export class ZcashError extends Error {
  override readonly name = "ZcashError";

  constructor(
    public readonly code: ZcashErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export function invariant(
  condition: unknown,
  code: ZcashErrorCode,
  message: string,
): asserts condition {
  if (!condition) throw new ZcashError(code, message);
}
