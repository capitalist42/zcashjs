# Read-only Wallet Guide

Phase 2 separates five responsibilities:

1. a `LightwalletdTransport` speaks the canonical CompactTxStreamer gRPC API;
2. `LightwalletClient` adds endpoint failover, retry, cancellation, and range
   continuity checks;
3. a Rust-backed `BlockScanner` performs trial decryption and maintains compact
   commitment-tree state;
4. `WalletRepository` atomically persists public sync state;
5. `ViewingKeyStore` protects viewing keys using the host keystore.

```ts
import {
  Testnet,
  LightwalletClient,
  MemoryViewingKeyStore,
  MemoryWalletRepository,
  createReadOnlyWallet,
} from "zcash-js";

const wallet = await createReadOnlyWallet({
  network: Testnet,
  repository: new MemoryWalletRepository(),
  viewingKeys: new MemoryViewingKeyStore(), // tests only; use a secure keystore
  client: new LightwalletClient([grpcTransport]),
  scanner: rustScanner,
});

const account = await wallet.importViewingKey({
  key: unifiedFullViewingKey,
  birthdayHeight: 2_000_000,
});

for await (const progress of account.sync(signal)) {
  console.log(progress.stage, progress.ratio);
}

console.log(await account.balance());
console.log(await account.transactions());
```

`MemoryViewingKeyStore` is intentionally non-persistent and is only appropriate
for tests. Applications must provide a `ViewingKeyStore` backed by their secure
keystore. Viewing keys reveal wallet activity and must not be written to the
public SQLite or IndexedDB sync-state adapters.

## Server privacy

A server can observe client IP address, request timing, requested height ranges,
and transaction enhancement requests. TLS authenticates the endpoint but does
not conceal this metadata. Use endpoint diversity cautiously: contacting several
operators can disclose the same wallet's synchronization pattern to more parties.

The client transport must implement the canonical
[lightwallet-protocol](https://github.com/zcash/lightwallet-protocol) protobuf
service. Browser applications generally require a gRPC-Web-compatible proxy;
Node and native hosts can use HTTP/2 gRPC directly.

## Restoration and reorganizations

Synchronization begins at the lowest imported account birthday. Each committed
block stores the opaque scanner checkpoint returned by Rust. On a fork, local and
remote hashes are compared backwards, derived notes and history above the common
ancestor are removed atomically, spent markers are restored, and scanning resumes.
Reorganizations deeper than 100 blocks fail closed by default.
