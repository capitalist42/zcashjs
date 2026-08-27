import { ZcashError } from "./errors.js";

export type NetworkId = "mainnet" | "testnet" | "regtest";

export interface Network {
  readonly id: NetworkId;
  readonly coinType: number;
  readonly saplingHrp: string;
  readonly unifiedHrp: string;
  readonly transparentP2pkhPrefix: Uint8Array;
  readonly transparentP2shPrefix: Uint8Array;
}

export const Mainnet: Network = Object.freeze({
  id: "mainnet", coinType: 133, saplingHrp: "zs", unifiedHrp: "u",
  transparentP2pkhPrefix: Uint8Array.of(0x1c, 0xb8),
  transparentP2shPrefix: Uint8Array.of(0x1c, 0xbd),
});

export const Testnet: Network = Object.freeze({
  id: "testnet", coinType: 1, saplingHrp: "ztestsapling", unifiedHrp: "utest",
  transparentP2pkhPrefix: Uint8Array.of(0x1d, 0x25),
  transparentP2shPrefix: Uint8Array.of(0x1c, 0xba),
});

export const Regtest: Network = Object.freeze({
  ...Testnet, id: "regtest", saplingHrp: "zregtestsapling", unifiedHrp: "uregtest",
});

export const NETWORKS = [Mainnet, Testnet, Regtest] as const;

export function networkById(id: NetworkId): Network {
  const network = NETWORKS.find((candidate) => candidate.id === id);
  if (!network) throw new ZcashError("UNSUPPORTED_PROTOCOL", `Unsupported network: ${String(id)}`);
  return network;
}
