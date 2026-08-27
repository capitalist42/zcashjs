import { ZcashError } from "@zcash-js/core";
import type { LightwalletClient } from "@zcash-js/light-client";
import type { TransferProposal } from "./proposal.js";

export interface Pczt { readonly bytes: Uint8Array; readonly proposalId: string; }
export interface TransactionConstructor { createPczt(proposal: TransferProposal, signal?: AbortSignal): Promise<Pczt>; }
export interface TransactionSigner { readonly name: string; sign(pczt: Pczt, signal?: AbortSignal): Promise<Pczt>; }
export interface TransactionProver { prove(pczt: Pczt, signal?: AbortSignal): Promise<Pczt>; }
export interface TransactionFinalizer { finalize(pczt: Pczt, signal?: AbortSignal): Promise<Uint8Array>; }
export interface AuthorizedTransaction { readonly proposalId: string; readonly bytes: Uint8Array; }

export async function authorizeProposal(proposal: TransferProposal, roles: { constructor: TransactionConstructor; signer: TransactionSigner; prover: TransactionProver; finalizer: TransactionFinalizer }, signal?: AbortSignal): Promise<AuthorizedTransaction> {
  if (proposal.expiresAt <= Date.now()) throw new ZcashError("SYNC_ERROR", "Transaction proposal and its note locks have expired");
  signal?.throwIfAborted(); let pczt = await roles.constructor.createPczt(proposal, signal);
  if (pczt.proposalId !== proposal.id) throw new ZcashError("INVALID_ENCODING", "Constructor returned a PCZT for another proposal");
  pczt = await roles.signer.sign(pczt, signal); pczt = await roles.prover.prove(pczt, signal);
  const bytes = await roles.finalizer.finalize(pczt, signal);
  if (bytes.length === 0) throw new ZcashError("INVALID_ENCODING", "Finalizer returned an empty transaction");
  return { proposalId: proposal.id, bytes };
}

export async function broadcastTransaction(transaction: AuthorizedTransaction, client: LightwalletClient, signal?: AbortSignal): Promise<{ readonly txid: string; readonly submittedAt: number }> {
  const txid = await client.sendTransaction(transaction.bytes, signal);
  if (!/^[0-9a-f]{64}$/i.test(txid)) throw new ZcashError("NETWORK_ERROR", "Server returned an invalid transaction id");
  return { txid: txid.toLowerCase(), submittedAt: Date.now() };
}

export type SubmissionStatus = "submitted" | "mined" | "expired" | "conflicted";
export interface SubmissionUpdate { readonly txid: string; readonly status: SubmissionStatus; readonly height?: number; readonly confirmations?: number; }
export interface TransactionStatusProvider { getStatus(txid: string, signal?: AbortSignal): Promise<SubmissionUpdate>; }

export async function* monitorTransaction(
  txid: string,
  provider: TransactionStatusProvider,
  options: { readonly pollIntervalMs?: number; readonly signal?: AbortSignal } = {},
): AsyncIterable<SubmissionUpdate> {
  if (!/^[0-9a-f]{64}$/i.test(txid)) throw new ZcashError("INVALID_ENCODING", "Invalid transaction id");
  const interval = options.pollIntervalMs ?? 15_000;
  if (!Number.isSafeInteger(interval) || interval < 0) throw new ZcashError("INVALID_ENCODING", "Poll interval must be non-negative");
  let previous = "";
  for (;;) {
    options.signal?.throwIfAborted();
    const update = await provider.getStatus(txid, options.signal);
    const fingerprint = JSON.stringify(update);
    if (fingerprint !== previous) { yield update; previous = fingerprint; }
    if (update.status === "expired" || update.status === "conflicted" || (update.status === "mined" && (update.confirmations ?? 0) > 0)) return;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(resolve, interval);
      options.signal?.addEventListener("abort", () => { clearTimeout(timeout); reject(options.signal?.reason); }, { once: true });
    });
  }
}
