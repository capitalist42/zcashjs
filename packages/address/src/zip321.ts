import { formatZec, parseZec, ZcashError, type NetworkId, type Zatoshi } from "@zcash-js/core";
import { base64url } from "@scure/base";
import { decodeAddress } from "./address.js";

export interface Payment {
  readonly address: string;
  readonly amount?: Zatoshi;
  readonly label?: string;
  readonly message?: string;
  readonly memo?: Uint8Array;
  readonly unknown?: Readonly<Record<string, string>>;
}

export interface PaymentRequest { readonly payments: readonly Payment[]; }

function decodeComponent(value: string): string {
  try { return decodeURIComponent(value.replace(/\+/g, "%20")); }
  catch (cause) { throw new ZcashError("INVALID_PAYMENT_URI", "Invalid percent encoding", { cause }); }
}

function decodeMemo(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new ZcashError("INVALID_PAYMENT_URI", "Memo is not unpadded base64url");
  try {
    const padded = value.padEnd(Math.ceil(value.length / 4) * 4, "=");
    const bytes = base64url.decode(padded);
    if (bytes.length > 512) throw new ZcashError("INVALID_PAYMENT_URI", "Memo exceeds 512 bytes");
    return bytes;
  } catch (cause) {
    if (cause instanceof ZcashError) throw cause;
    throw new ZcashError("INVALID_PAYMENT_URI", "Memo is not valid unpadded base64url", { cause });
  }
}

export function parsePaymentUri(uri: string, expectedNetwork?: NetworkId): PaymentRequest {
  if (!uri.startsWith("zcash:") || uri.startsWith("zcash://")) throw new ZcashError("INVALID_PAYMENT_URI", "Expected a non-hierarchical zcash: URI");
  const [location = "", query = ""] = uri.slice(6).split("?", 2);
  if (location.includes("%")) throw new ZcashError("INVALID_PAYMENT_URI", "The URI address must not be percent-encoded");
  const groups = new Map<string, Record<string, string>>();
  const put = (index: string, key: string, value: string): void => {
    const group = groups.get(index) ?? {};
    if (key in group) throw new ZcashError("INVALID_PAYMENT_URI", `Duplicate ${key}${index ? `.${index}` : ""}`);
    group[key] = value; groups.set(index, group);
  };
  if (location) put("", "address", location);
  if (query) for (const field of query.split("&")) {
    const separator = field.indexOf("=");
    if (separator < 1) throw new ZcashError("INVALID_PAYMENT_URI", "Every query parameter must have a value");
    const rawKey = field.slice(0, separator);
    if (rawKey.includes("%")) throw new ZcashError("INVALID_PAYMENT_URI", "Parameter names must not be percent-encoded");
    const match = /^([A-Za-z][A-Za-z0-9-]*)(?:\.([1-9][0-9]*))?$/.exec(rawKey);
    if (!match) throw new ZcashError("INVALID_PAYMENT_URI", `Invalid payment parameter: ${rawKey}`);
    put(match[2] ?? "", match[1]!, decodeComponent(field.slice(separator + 1)));
  }
  if (groups.size === 0) throw new ZcashError("INVALID_PAYMENT_URI", "Payment request contains no address");
  const payments: Payment[] = [];
  for (const [index, group] of groups) {
    const address = group.address;
    if (!address) throw new ZcashError("INVALID_PAYMENT_URI", `Payment ${index || "0"} has parameters but no address`);
    const decoded = decodeAddress(address, expectedNetwork);
    if (group["req-asset"] !== undefined) throw new ZcashError("UNSUPPORTED_PROTOCOL", "ZIP 321 custom assets are not supported by this release");
    for (const key of Object.keys(group)) if (key.startsWith("req-")) throw new ZcashError("INVALID_PAYMENT_URI", `Unknown required parameter: ${key}`);
    if (group.memo !== undefined && decoded.kind.startsWith("transparent")) throw new ZcashError("INVALID_PAYMENT_URI", "Transparent recipients cannot receive memos");
    const known = new Set(["address", "amount", "label", "message", "memo"]);
    const unknown = Object.fromEntries(Object.entries(group).filter(([key]) => !known.has(key)));
    payments.push({
      address,
      ...(group.amount === undefined ? {} : { amount: parseZec(group.amount) }),
      ...(group.label === undefined ? {} : { label: group.label }),
      ...(group.message === undefined ? {} : { message: group.message }),
      ...(group.memo === undefined ? {} : { memo: decodeMemo(group.memo) }),
      ...(Object.keys(unknown).length === 0 ? {} : { unknown }),
    });
  }
  return { payments };
}

function encodeComponent(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, "%20");
}

export function encodePaymentUri(request: PaymentRequest, expectedNetwork?: NetworkId): string {
  if (request.payments.length === 0) throw new ZcashError("INVALID_PAYMENT_URI", "At least one payment is required");
  const fields: string[] = [];
  request.payments.forEach((payment, position) => {
    const index = position === 0 ? "" : `.${position}`;
    const decoded = decodeAddress(payment.address, expectedNetwork);
    fields.push(`address${index}=${payment.address}`);
    if (payment.amount !== undefined) fields.push(`amount${index}=${formatZec(payment.amount)}`);
    if (payment.label !== undefined) fields.push(`label${index}=${encodeComponent(payment.label)}`);
    if (payment.message !== undefined) fields.push(`message${index}=${encodeComponent(payment.message)}`);
    if (payment.memo !== undefined) {
      if (decoded.kind.startsWith("transparent")) throw new ZcashError("INVALID_PAYMENT_URI", "Transparent recipients cannot receive memos");
      if (payment.memo.length > 512) throw new ZcashError("INVALID_PAYMENT_URI", "Memo exceeds 512 bytes");
      fields.push(`memo${index}=${base64url.encode(payment.memo).replace(/=+$/, "")}`);
    }
    for (const [key, value] of Object.entries(payment.unknown ?? {})) {
      if (key.startsWith("req-") || !/^[A-Za-z][A-Za-z0-9-]*$/.test(key)) throw new ZcashError("INVALID_PAYMENT_URI", `Cannot encode unknown parameter: ${key}`);
      fields.push(`${key}${index}=${encodeComponent(value)}`);
    }
  });
  return `zcash:?${fields.join("&")}`;
}
