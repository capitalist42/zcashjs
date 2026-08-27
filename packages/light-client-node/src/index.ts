import { credentials, loadPackageDefinition, type ClientReadableStream, type ClientUnaryCall, type ServiceError } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { fromHex, toHex, ZcashError } from "@zcash-js/core";
import type { CompactBlock, LightwalletdInfo, LightwalletdTransport } from "@zcash-js/light-client";
import protobuf from "protobufjs";
import { fileURLToPath } from "node:url";

type Message = Record<string, unknown>;
interface GrpcClient {
  GetLightdInfo(request: Message, callback: (error: ServiceError | null, value: Message) => void): ClientUnaryCall;
  GetBlock(request: Message, callback: (error: ServiceError | null, value: Message) => void): ClientUnaryCall;
  GetBlockRange(request: Message): ClientReadableStream<Message>;
  GetTransaction(request: Message, callback: (error: ServiceError | null, value: Message) => void): ClientUnaryCall;
  SendTransaction(request: Message, callback: (error: ServiceError | null, value: Message) => void): ClientUnaryCall;
  close(): void;
}
interface GrpcConstructor { new(endpoint: string, channelCredentials: ReturnType<typeof credentials.createInsecure>): GrpcClient; }

const protoPath = fileURLToPath(new URL("../proto/service.proto", import.meta.url));
const includeDir = fileURLToPath(new URL("../proto", import.meta.url));
const definition = loadSync(protoPath, { includeDirs: [includeDir], longs: Number, enums: String, defaults: true, oneofs: true });
const loaded = loadPackageDefinition(definition) as unknown as { cash: { z: { wallet: { sdk: { rpc: { CompactTxStreamer: GrpcConstructor } } } } } };
const root = protobuf.loadSync(protoPath);
const compactBlockType = root.lookupType("cash.z.wallet.sdk.rpc.CompactBlock");

function bytes(value: unknown): Uint8Array { return value instanceof Uint8Array ? value : Buffer.isBuffer(value) ? new Uint8Array(value) : new Uint8Array(); }
function unary(call: (callback: (error: ServiceError | null, value: Message) => void) => ClientUnaryCall, signal?: AbortSignal): Promise<Message> {
  return new Promise((resolve, reject) => {
    const request = call((error, value) => error ? reject(error) : resolve(value));
    if (signal?.aborted) { request.cancel(); reject(signal.reason); }
    else signal?.addEventListener("abort", () => { request.cancel(); reject(signal.reason); }, { once: true });
  });
}
function compact(value: Message): CompactBlock {
  const raw = compactBlockType.encode(compactBlockType.fromObject(value)).finish();
  return { height: Number(value.height), hash: toHex(bytes(value.hash)), previousHash: toHex(bytes(value.prevHash)), time: Number(value.time), bytes: raw };
}

export interface GrpcTransportOptions { readonly tls?: boolean; }

export class NodeGrpcLightwalletdTransport implements LightwalletdTransport {
  readonly #client: GrpcClient;
  constructor(readonly endpoint: string, options: GrpcTransportOptions = {}) {
    const channelCredentials = options.tls ? credentials.createSsl() : credentials.createInsecure();
    this.#client = new loaded.cash.z.wallet.sdk.rpc.CompactTxStreamer(endpoint, channelCredentials);
  }
  async getInfo(signal?: AbortSignal): Promise<LightwalletdInfo> {
    const value = await unary((callback) => this.#client.GetLightdInfo({}, callback), signal);
    return { chainName: String(value.chainName), blockHeight: Number(value.blockHeight), consensusBranchId: String(value.consensusBranchId), vendor: String(value.vendor) };
  }
  async getBlock(height: number, signal?: AbortSignal): Promise<CompactBlock> { return compact(await unary((callback) => this.#client.GetBlock({ height }, callback), signal)); }
  async *getBlockRange(startHeight: number, endHeight: number, signal?: AbortSignal): AsyncIterable<CompactBlock> {
    const stream = this.#client.GetBlockRange({ start: { height: startHeight }, end: { height: endHeight } });
    signal?.addEventListener("abort", () => stream.cancel(), { once: true });
    const queue: Message[] = []; let ended = false; let failure: unknown; let wake: (() => void) | undefined;
    stream.on("data", (value: Message) => { queue.push(value); wake?.(); });
    stream.on("end", () => { ended = true; wake?.(); });
    stream.on("error", (error: unknown) => { failure = error; ended = true; wake?.(); });
    while (!ended || queue.length > 0) { if (queue.length === 0) await new Promise<void>((resolve) => { wake = resolve; }); wake = undefined; const value = queue.shift(); if (value) yield compact(value); }
    if (failure) throw failure;
  }
  async getTransaction(txid: string, signal?: AbortSignal): Promise<Uint8Array> {
    const hash = fromHex(txid).reverse(); const value = await unary((callback) => this.#client.GetTransaction({ hash }, callback), signal); return bytes(value.data);
  }
  async sendTransaction(transaction: Uint8Array, signal?: AbortSignal): Promise<string> {
    const value = await unary((callback) => this.#client.SendTransaction({ data: transaction }, callback), signal);
    if (Number(value.errorCode) !== 0) throw new ZcashError("NETWORK_ERROR", `lightwalletd rejected transaction (${String(value.errorCode)}): ${String(value.errorMessage)}`);
    return String(value.errorMessage).replace(/^"|"$/g, "");
  }
  close(): void { this.#client.close(); }
}
