import { ZcashError } from "@zcash-js/core";

export interface BlockchainInfo { readonly chain: string; readonly blocks: number; readonly bestblockhash: string; readonly consensus?: { readonly chaintip: string; readonly nextblock: string }; }
export interface RpcOptions { readonly endpoint: string; readonly authorization?: string; readonly fetch?: typeof globalThis.fetch; }

export class ZcashRpcClient {
  #id = 0; readonly #fetch: typeof globalThis.fetch;
  constructor(private readonly options: RpcOptions) { this.#fetch = options.fetch ?? globalThis.fetch; if (!this.#fetch) throw new ZcashError("NETWORK_ERROR", "Fetch is unavailable"); }
  async call<T>(method: string, params: readonly unknown[] = [], signal?: AbortSignal): Promise<T> {
    const response = await this.#fetch(this.options.endpoint, { method: "POST", headers: { "content-type": "application/json", ...(this.options.authorization ? { authorization: this.options.authorization } : {}) }, body: JSON.stringify({ jsonrpc: "1.0", id: ++this.#id, method, params }), ...(signal ? { signal } : {}) });
    if (!response.ok) throw new ZcashError("NETWORK_ERROR", `RPC HTTP status ${response.status}`);
    const body = await response.json() as { result?: T; error?: { code: number; message: string } | null };
    if (body.error) throw new ZcashError("NETWORK_ERROR", `RPC ${method} failed (${body.error.code}): ${body.error.message}`);
    if (!("result" in body)) throw new ZcashError("NETWORK_ERROR", `RPC ${method} returned no result`);
    return body.result as T;
  }
  getBlockchainInfo(signal?: AbortSignal): Promise<BlockchainInfo> { return this.call("getblockchaininfo", [], signal); }
  getRawTransaction(txid: string, verbose = false, signal?: AbortSignal): Promise<string | Readonly<Record<string, unknown>>> { return this.call("getrawtransaction", [txid, verbose ? 1 : 0], signal); }
  sendRawTransaction(hex: string, signal?: AbortSignal): Promise<string> { return this.call("sendrawtransaction", [hex], signal); }
}
