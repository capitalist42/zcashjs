import { DatabaseSync } from "node:sqlite";
import { ZcashError, type NetworkId } from "@zcash-js/core";
import { WALLET_SCHEMA_VERSION, emptyWalletState, type WalletRepository, type WalletState } from "@zcash-js/storage";

function encode(state: WalletState): string {
  return JSON.stringify(state, (_key, value: unknown) => typeof value === "bigint"
    ? { $zcashType: "bigint", value: value.toString() }
    : value instanceof Uint8Array ? { $zcashType: "bytes", value: Array.from(value) } : value);
}

function decode(value: string): WalletState {
  return JSON.parse(value, (_key, item: unknown) => {
    if (typeof item === "object" && item !== null && "$zcashType" in item) {
      const tagged = item as { $zcashType: string; value: string | number[] };
      if (tagged.$zcashType === "bigint") return BigInt(tagged.value as string);
      if (tagged.$zcashType === "bytes") return Uint8Array.from(tagged.value as number[]);
    }
    return item;
  }) as WalletState;
}

export class SqliteWalletRepository implements WalletRepository {
  #db: DatabaseSync | undefined;
  constructor(private readonly path: string) {}
  async open(network: NetworkId): Promise<void> {
    if (this.#db) return;
    const db = new DatabaseSync(this.path);
    db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS wallet_state (id INTEGER PRIMARY KEY CHECK (id = 1), schema_version INTEGER NOT NULL, network TEXT NOT NULL, state TEXT NOT NULL)");
    const row = db.prepare("SELECT schema_version, network, state FROM wallet_state WHERE id = 1").get() as { schema_version: number; network: string; state: string } | undefined;
    if (!row) db.prepare("INSERT INTO wallet_state (id, schema_version, network, state) VALUES (1, ?, ?, ?)").run(WALLET_SCHEMA_VERSION, network, encode(emptyWalletState(network)));
    else {
      if (row.schema_version > WALLET_SCHEMA_VERSION) { db.close(); throw new ZcashError("MIGRATION_REQUIRED", "Wallet was created by a newer storage schema"); }
      if (row.schema_version < WALLET_SCHEMA_VERSION) { db.close(); throw new ZcashError("MIGRATION_REQUIRED", "Wallet storage migration is required"); }
      if (row.network !== network) { db.close(); throw new ZcashError("NETWORK_MISMATCH", "Stored wallet belongs to another network"); }
    }
    this.#db = db;
  }
  #required(): DatabaseSync { if (!this.#db) throw new ZcashError("WALLET_CLOSED", "Repository is not open"); return this.#db; }
  async read(): Promise<WalletState> { const row = this.#required().prepare("SELECT state FROM wallet_state WHERE id = 1").get() as { state: string }; return decode(row.state); }
  async update(mutator: (state: WalletState) => WalletState | Promise<WalletState>): Promise<WalletState> {
    const db = this.#required(); db.exec("BEGIN IMMEDIATE");
    try {
      const current = await this.read();
      const changed = await mutator(structuredClone(current));
      const next = { ...changed, revision: current.revision + 1 };
      db.prepare("UPDATE wallet_state SET state = ? WHERE id = 1").run(encode(next));
      db.exec("COMMIT"); return next;
    } catch (cause) { db.exec("ROLLBACK"); throw new ZcashError("STORAGE_ERROR", "SQLite wallet update failed", { cause }); }
  }
  async close(): Promise<void> { this.#db?.close(); this.#db = undefined; }
}
