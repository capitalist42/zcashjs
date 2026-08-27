import { ZcashError } from "./errors.js";

export const ZATOSHIS_PER_ZEC = 100_000_000n;
export const MAX_MONEY = 21_000_000n * ZATOSHIS_PER_ZEC;

declare const zatoshiBrand: unique symbol;
export type Zatoshi = bigint & { readonly [zatoshiBrand]: true };

export function zatoshis(value: bigint): Zatoshi {
  if (value < 0n || value > MAX_MONEY) {
    throw new ZcashError("AMOUNT_OUT_OF_RANGE", "Zatoshi amount is outside the valid monetary range");
  }
  return value as Zatoshi;
}

export function parseZec(value: string): Zatoshi {
  if (!/^[0-9]+(?:\.[0-9]{1,8})?$/.test(value)) {
    throw new ZcashError("INVALID_AMOUNT", "ZEC amount must be an unsigned decimal with at most 8 fractional digits");
  }
  const [whole = "0", fraction = ""] = value.split(".");
  return zatoshis(BigInt(whole) * ZATOSHIS_PER_ZEC + BigInt(fraction.padEnd(8, "0") || "0"));
}

export function formatZec(value: Zatoshi, options: { trimTrailingZeros?: boolean } = {}): string {
  const whole = value / ZATOSHIS_PER_ZEC;
  let fraction = (value % ZATOSHIS_PER_ZEC).toString().padStart(8, "0");
  if (options.trimTrailingZeros ?? true) fraction = fraction.replace(/0+$/, "");
  return fraction.length === 0 ? whole.toString() : `${whole}.${fraction}`;
}

export function addZatoshis(left: Zatoshi, right: Zatoshi): Zatoshi {
  return zatoshis(left + right);
}

export function subtractZatoshis(left: Zatoshi, right: Zatoshi): Zatoshi {
  return zatoshis(left - right);
}
