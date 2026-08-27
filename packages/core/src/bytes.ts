import { ZcashError } from "./errors.js";

const HEX = /^[0-9a-f]*$/i;

export function fromHex(value: string): Uint8Array {
  if (value.length % 2 !== 0 || !HEX.test(value)) {
    throw new ZcashError("INVALID_ENCODING", "Hex must contain an even number of hexadecimal characters");
  }
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

export function toHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function concatBytes(...values: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(values.reduce((sum, value) => sum + value.length, 0));
  let offset = 0;
  for (const value of values) { output.set(value, offset); offset += value.length; }
  return output;
}

export class ByteReader {
  #offset = 0;
  constructor(private readonly bytes: Uint8Array) {}
  get offset(): number { return this.#offset; }
  get remaining(): number { return this.bytes.length - this.#offset; }
  read(length: number): Uint8Array {
    if (!Number.isSafeInteger(length) || length < 0 || length > this.remaining) {
      throw new ZcashError("TRUNCATED_DATA", `Cannot read ${length} bytes at offset ${this.#offset}`);
    }
    const result = this.bytes.slice(this.#offset, this.#offset + length);
    this.#offset += length;
    return result;
  }
  readUint8(): number { return this.read(1)[0]!; }
  readUint32LE(): number {
    const b = this.read(4);
    return (b[0]! | b[1]! << 8 | b[2]! << 16 | b[3]! << 24) >>> 0;
  }
  readUint64LE(): bigint {
    const b = this.read(8);
    let value = 0n;
    for (let index = 7; index >= 0; index--) value = (value << 8n) | BigInt(b[index]!);
    return value;
  }
  readCompactSize(max = 0x0200_0000): number {
    const tag = this.readUint8();
    let value: bigint;
    if (tag < 253) value = BigInt(tag);
    else if (tag === 253) { const b = this.read(2); value = BigInt(b[0]! | b[1]! << 8); if (value < 253n) throw new ZcashError("INVALID_ENCODING", "Non-canonical CompactSize"); }
    else if (tag === 254) { value = BigInt(this.readUint32LE()); if (value <= 0xffffn) throw new ZcashError("INVALID_ENCODING", "Non-canonical CompactSize"); }
    else { value = this.readUint64LE(); if (value <= 0xffff_ffffn) throw new ZcashError("INVALID_ENCODING", "Non-canonical CompactSize"); }
    if (value > BigInt(max)) throw new ZcashError("INVALID_ENCODING", "CompactSize exceeds configured limit");
    return Number(value);
  }
}
