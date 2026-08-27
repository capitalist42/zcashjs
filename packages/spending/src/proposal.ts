import { decodeAddress } from "@zcash-js/address";
import { ZcashError, zatoshis, type NetworkId, type Zatoshi } from "@zcash-js/core";
import type { ShieldedPool, StoredNote, WalletRepository } from "@zcash-js/storage";
import { zip317Fee, type LogicalActionShape } from "./fee.js";

export type PrivacyPolicy = "shielded-only" | "allow-transparent";
export interface ProposedPayment { readonly address: string; readonly amount: Zatoshi; readonly memo?: Uint8Array; }
export interface TransferRequest { readonly payments: readonly ProposedPayment[]; readonly privacyPolicy?: PrivacyPolicy; readonly minimumConfirmations?: number; readonly lockDurationMs?: number; }
export interface TransferProposal {
  readonly version: 1;
  readonly id: string;
  readonly accountId: string;
  readonly network: NetworkId;
  readonly anchorHeight: number;
  readonly expiresAt: number;
  readonly payments: readonly ProposedPayment[];
  readonly selectedNoteIds: readonly string[];
  readonly inputValue: Zatoshi;
  readonly paymentValue: Zatoshi;
  readonly fee: Zatoshi;
  readonly change: Zatoshi;
  readonly changePool: ShieldedPool;
  readonly logicalActions: number;
  readonly privacyWarnings: readonly string[];
}

function total(values: readonly bigint[]): Zatoshi { return zatoshis(values.reduce((sum, value) => sum + value, 0n)); }

function shape(notes: readonly StoredNote[], payments: readonly ProposedPayment[], hasChange: boolean): LogicalActionShape {
  const saplingSpends = notes.filter((note) => note.pool === "sapling").length;
  const orchardSpends = notes.filter((note) => note.pool === "orchard").length;
  const saplingOutputs = payments.filter((payment) => decodeAddress(payment.address).kind === "sapling").length + (hasChange && notes[0]?.pool === "sapling" ? 1 : 0);
  const orchardOutputs = payments.filter((payment) => decodeAddress(payment.address).kind === "unified").length + (hasChange && notes[0]?.pool === "orchard" ? 1 : 0);
  const transparentOutputs = payments.filter((payment) => decodeAddress(payment.address).kind.startsWith("transparent")).length;
  return { saplingSpends, saplingOutputs, orchardActions: Math.max(orchardSpends, orchardOutputs), transparentOutputBytes: transparentOutputs * 34 };
}

export class ProposalBuilder {
  constructor(private readonly repository: WalletRepository, private readonly network: NetworkId) {}
  async propose(accountId: string, request: TransferRequest): Promise<TransferProposal> {
    if (request.payments.length === 0) throw new ZcashError("INVALID_AMOUNT", "At least one payment is required");
    const policy = request.privacyPolicy ?? "shielded-only"; const warnings: string[] = [];
    for (const payment of request.payments) {
      if (payment.amount <= 0n) throw new ZcashError("INVALID_AMOUNT", "Payment amounts must be positive");
      const address = decodeAddress(payment.address, this.network);
      if (payment.memo && payment.memo.length > 512) throw new ZcashError("INVALID_ENCODING", "Memo exceeds 512 bytes");
      if (payment.memo && address.kind.startsWith("transparent")) throw new ZcashError("INVALID_ADDRESS", "Transparent payments cannot contain memos");
      if (address.kind.startsWith("transparent")) {
        if (policy !== "allow-transparent") throw new ZcashError("INVALID_ADDRESS", "Transparent payment requires allow-transparent privacy policy");
        warnings.push("Transparent recipient reveals the payment amount and receiver on-chain.");
      }
    }
    const state = await this.repository.read(); const account = state.accounts.find((candidate) => candidate.id === accountId);
    if (!account) throw new ZcashError("ACCOUNT_NOT_FOUND", `Account not found: ${accountId}`);
    const tip = state.blocks.at(-1)?.height ?? account.birthdayHeight;
    const confirmations = request.minimumConfirmations ?? 10; const now = Date.now();
    const candidates = state.notes.filter((note) => note.accountId === accountId && note.spentHeight === undefined && (note.lockExpiresAt === undefined || note.lockExpiresAt <= now) && tip - note.height + 1 >= confirmations).sort((left, right) => left.value === right.value ? left.id.localeCompare(right.id) : left.value > right.value ? -1 : 1);
    const paymentValue = total(request.payments.map((payment) => payment.amount)); const selected: StoredNote[] = [];
    let inputValue = zatoshis(0n); let calculation = zip317Fee({});
    for (const note of candidates) {
      selected.push(note); inputValue = total([inputValue, note.value]);
      calculation = zip317Fee(shape(selected, request.payments, inputValue > paymentValue + calculation.fee));
      if (inputValue >= paymentValue + calculation.fee) { calculation = zip317Fee(shape(selected, request.payments, inputValue > paymentValue + calculation.fee)); if (inputValue >= paymentValue + calculation.fee) break; }
    }
    if (inputValue < paymentValue + calculation.fee) throw new ZcashError("AMOUNT_OUT_OF_RANGE", "Insufficient confirmed funds including the conventional fee");
    const id = crypto.randomUUID(); const expiresAt = now + (request.lockDurationMs ?? 10 * 60_000);
    const proposal: TransferProposal = { version: 1, id, accountId, network: this.network, anchorHeight: tip, expiresAt, payments: request.payments.map((payment) => ({ ...payment, ...(payment.memo ? { memo: payment.memo.slice() } : {}) })), selectedNoteIds: selected.map((note) => note.id), inputValue, paymentValue, fee: calculation.fee, change: zatoshis(inputValue - paymentValue - calculation.fee), changePool: selected[0]!.pool, logicalActions: calculation.logicalActions, privacyWarnings: [...new Set(warnings)] };
    await this.repository.update((wallet) => {
      const ids = new Set(proposal.selectedNoteIds);
      for (const id of ids) {
        const note = wallet.notes.find((candidate) => candidate.id === id);
        if (!note || note.spentHeight !== undefined) throw new ZcashError("STORAGE_BUSY", `Note ${id} is no longer spendable`);
        if (note.lockedBy !== undefined && (note.lockExpiresAt ?? Infinity) > now) throw new ZcashError("STORAGE_BUSY", `Note ${id} is already locked`);
      }
      return { ...wallet, notes: wallet.notes.map((note) => ids.has(note.id) ? { ...note, lockedBy: id, lockExpiresAt: expiresAt } : note) };
    });
    return proposal;
  }
  async release(proposal: TransferProposal): Promise<void> { await this.repository.update((state) => ({ ...state, notes: state.notes.map((note) => note.lockedBy === proposal.id ? (({ lockedBy: _, lockExpiresAt: __, ...rest }) => rest)(note) : note) })); }
}
