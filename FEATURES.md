# Zcash JS Framework — Proposed Feature Set

> Implementation status: the TypeScript framework and extension contracts for
> Phases 0–5 are present. Consensus-sensitive scanning, key derivation, proving,
> signing, canonical gRPC bindings, and hardware communication require audited
> backend implementations before this can be considered a production wallet.

## 1. Vision

Build a TypeScript-first framework for creating Zcash applications in Node.js,
browsers, React Native, and other JavaScript runtimes. The published packages
should contain compiled JavaScript, TypeScript declaration files, source maps,
and documented, stable APIs.

The framework should make common Zcash operations safe and approachable while
keeping protocol-sensitive cryptography in an audited native or WebAssembly
core. TypeScript should provide the public API, runtime coordination, storage
abstractions, transport adapters, and application-facing types; it should not
reimplement consensus-critical cryptography from scratch.

## 2. Design Principles

- **Shielded by default:** prefer shielded receivers and clearly identify every
  operation that reduces privacy.
- **Secure primitives, ergonomic API:** expose high-level wallet workflows while
  retaining lower-level packages for advanced consumers.
- **Protocol-aware:** make network, pool, consensus branch, and transaction
  version explicit instead of scattering magic constants.
- **Portable:** share one API across Node.js, browsers, workers, and React Native,
  with platform-specific storage and cryptography adapters.
- **BigInt-safe:** represent zatoshis as `bigint`, never as floating-point ZEC.
- **Offline-capable:** separate proposal, proving, authorization, and broadcast
  so hardware and air-gapped signers can be supported.
- **Observable and recoverable:** synchronization must report progress, survive
  interruption, and recover safely from chain reorganizations.
- **Minimal secret exposure:** distinguish spending keys, full viewing keys, and
  incoming viewing keys in both the type system and runtime APIs.

## 3. Proposed Package Layout

The project can begin as a monorepo whose packages are independently consumable:

| Package | Responsibility |
| --- | --- |
| `@zcash-js/core` | Networks, amounts, errors, byte utilities, protocol types |
| `@zcash-js/keys` | Seed handling, ZIP 32 derivation, viewing/spending keys |
| `@zcash-js/address` | Unified, Sapling, and transparent address codecs |
| `@zcash-js/transaction` | Transaction parsing, proposals, building, signing |
| `@zcash-js/light-client` | Compact-block sync and lightwalletd transport |
| `@zcash-js/wallet` | Accounts, balances, notes, history, send/receive flows |
| `@zcash-js/storage` | Storage interfaces and encrypted persistence adapters |
| `@zcash-js/rpc` | Typed Zcash node JSON-RPC client |
| `@zcash-js/wasm` | Audited Rust/Wasm cryptographic backend |
| `@zcash-js/testing` | Regtest, fixtures, mock servers, and protocol vectors |

A convenience `zcash-js` package may re-export the stable high-level API while
advanced users import smaller packages directly.

## 4. Core Features

### 4.1 Network and protocol configuration

- Built-in Mainnet, Testnet, and Regtest configurations.
- Custom-network configuration for application and protocol testing.
- Typed network identifiers that prevent mixing keys, addresses, or transactions
  from different networks.
- Centralized activation heights, consensus branch IDs, transaction formats,
  and feature flags.
- Capability negotiation with nodes and lightwalletd servers.
- Forward-compatible pool and transaction models so future network upgrades do
  not require redesigning every public type.

### 4.2 Amounts and serialization

- `Zatoshi` value object backed by `bigint` with checked arithmetic.
- Exact ZEC/zatoshi formatting and parsing with configurable locale display.
- Canonical hexadecimal, byte, CompactSize, and endianness utilities.
- Strict transaction and block parsers with size limits and structured errors.
- Browser-friendly codecs using `Uint8Array`, without requiring Node `Buffer`.

### 4.3 Keys and accounts

- Cryptographically secure seed generation through runtime-specific entropy
  providers.
- Optional mnemonic import/export behind an explicit package or feature.
- ZIP 32 hierarchical derivation for supported shielded protocols.
- Account creation, multi-account wallets, internal/change scopes, and address
  rotation using diversifiers.
- Unified spending keys, unified full viewing keys, and unified incoming viewing
  keys where supported.
- Watch-only wallets built from viewing keys.
- Strongly differentiated opaque types for seed material, spending keys, full
  viewing keys, incoming viewing keys, and public addresses.
- Explicit secret lifecycle methods, redacted inspection, and best-effort memory
  clearing in native/Wasm boundaries.

### 4.4 Addresses and payment requests

- Encode, decode, validate, and inspect Unified Addresses (ZIP 316).
- Support Orchard, Sapling, and transparent receivers as required by the active
  protocol; retain legacy formats for import and compatibility.
- Receiver selection based on sender capabilities and a documented privacy
  policy.
- Network mismatch and unsupported-receiver diagnostics.
- Address metadata APIs that do not silently expose a transparent receiver.
- ZIP 321 payment URI parsing and creation, including multiple payments, memo,
  amount, label, message, and unknown-parameter preservation.
- QR-friendly output and input validation helpers.

### 4.5 Transaction lifecycle

- Parse transactions and expose typed transparent and shielded bundle summaries.
- Build single- and multi-recipient payments.
- Memo support with clear byte limits, text/binary helpers, and memo privacy
  guidance.
- Input and note selection with deterministic, testable policies.
- Protocol-correct fee calculation, including ZIP 317 conventional fees.
- Change strategy, dust handling, transaction expiry, and minimum-confirmation
  controls.
- Shielding and migration workflows between supported value pools.
- Transaction proposal API that estimates fees and describes privacy effects
  before secrets are used.
- Split workflow: propose, authorize, prove, finalize, broadcast, and monitor.
- PCZT support for offline, hardware, and multi-party transaction workflows.
- Transaction status tracking: proposed, created, submitted, mined, expired,
  conflicted, or reorged.

### 4.6 Wallet engine

- Create, restore, open, lock, and close wallets.
- Birthday-height restoration to avoid scanning irrelevant chain history.
- Per-account and per-pool balances separated into spendable, pending, immature,
  and locked amounts.
- Incoming, outgoing, self-send, shielding, and change classification.
- Transaction history with mined height, confirmation state, recipients, memos,
  fee, and local metadata.
- Safe rescan, rewind, and recovery operations.
- Note locking to prevent concurrent sends from selecting the same funds.
- Idempotent write operations and resumable long-running jobs.
- Event stream and async-iterator APIs for sync progress, balance changes,
  transactions, and recoverable errors.

### 4.7 Chain access and synchronization

- A typed lightwalletd gRPC client for compact blocks, transactions, tree state,
  server metadata, and broadcast.
- Optional typed full-node JSON-RPC client for trusted/backend deployments.
- Incremental compact-block scanning and trial decryption.
- Sapling and Orchard commitment-tree and witness management, extended through
  adapters as new shielded pools activate.
- Reorganization detection, validated rewind, checkpointing, and replay.
- Server failover, deadlines, retry with backoff, cancellation, and resumable
  downloads.
- Sync progress metrics that separate download, scan, enhancement, and witness
  work.
- Transaction enhancement for fetching complete wallet-relevant transactions.
- Pluggable transport for native gRPC, gRPC-Web, proxies, and privacy-preserving
  transports such as Tor where the host supports them.
- Server trust model documentation: a lightwallet server can observe client
  metadata and availability patterns even when it cannot directly decrypt notes.

### 4.8 Storage

- Versioned storage interfaces independent of any particular database.
- Initial adapters for SQLite (Node/React Native) and IndexedDB (browser).
- Atomic migrations with rollback and compatibility checks.
- Encryption at rest for wallet secrets and sensitive metadata, with keys
  supplied by an application-controlled keystore adapter.
- Separate public sync state from secret key storage.
- Import/export, backup metadata, corruption detection, and integrity checks.
- Cross-tab/process locking or a documented single-writer model.
- Privacy-conscious logging with secret and address redaction by default.

### 4.9 Runtime and developer experience

- ESM-first compiled JavaScript plus declaration files and source maps; add a CJS
  compatibility build only if real downstream demand justifies it.
- Explicit package `exports`, tree-shakable modules, and no implicit Node globals
  in browser packages.
- Promise-based APIs with `AbortSignal` cancellation.
- Structured error hierarchy with stable error codes and actionable context.
- Runtime capability detection with clear missing-backend errors.
- Typed events, API reference docs, tutorials, runnable examples, and migration
  guides.
- Framework adapters/examples for Node.js, browser workers, React Native, and
  server-side services.
- CLI utilities for address inspection, transaction decoding, key-safe wallet
  diagnostics, regtest funding, and sync debugging.

## 5. Security and Privacy Requirements

These are release requirements rather than optional features:

- Bind to audited upstream Zcash Rust implementations through native bindings or
  WebAssembly for key derivation, note encryption, proving, signing, and
  consensus-sensitive serialization.
- Never send seeds or spending keys to a node, lightwalletd server, worker owned
  by another origin, analytics system, or log sink.
- Require an explicit acknowledgement for transparent fallback, memo disclosure,
  viewing-key export, and other privacy-degrading actions.
- Use constant-time primitives where secret material is involved and document
  which surrounding JavaScript operations cannot offer constant-time guarantees.
- Verify downloaded artifacts and proving parameters with pinned hashes.
- Define a threat model covering malicious servers, compromised dependencies,
  XSS, local database theft, supply-chain attacks, metadata leakage, and rollback
  or reorganization attacks.
- Maintain a security policy, private vulnerability-reporting path, dependency
  review process, signed releases, provenance attestations, and reproducible
  build goals.
- Do not label the package production-ready until its cryptographic boundary and
  wallet-critical flows have received independent review.

## 6. Testing and Quality Features

- Official protocol vectors for keys, addresses, note encryption, signatures,
  transaction digests, and serialization.
- Unit and property-based tests for codecs, amount arithmetic, selectors, and
  state transitions.
- Differential tests against the upstream Rust implementation.
- Regtest integration tests against supported node and lightwalletd versions.
- Synthetic compact-chain tests for forks, deep reorganizations, gaps, duplicate
  blocks, server inconsistency, expired transactions, and interrupted scans.
- Cross-runtime test matrix for supported Node.js, browser, and React Native
  versions.
- Fuzzing for all untrusted binary and string parsers.
- Golden fixtures for database migrations and wallet restoration.
- Benchmarks for initial sync, incremental sync, proving, memory consumption, and
  bundle size, with regression thresholds in CI.
- Type-level API tests and checks that published packages contain working JS,
  declarations, source maps, and correct exports.

## 7. Suggested Delivery Phases

### Phase 0 — Architecture and threat model

- Select and pin the upstream Rust crates and define the native/Wasm boundary.
- Specify supported runtimes, browser constraints, and protocol/network matrix.
- Write the threat model, security policy, compatibility policy, and API design
  conventions.

### Phase 1 — Protocol foundation

- Monorepo, TypeScript build, package exports, CI, release automation.
- Amounts, networks, byte utilities, error model, address codecs, ZIP 321, and
  transaction parsing.
- Rust/Wasm proof of concept plus protocol-vector and cross-runtime tests.

### Phase 2 — Read-only light wallet

- Viewing-key accounts, storage interfaces, lightwalletd client, compact-block
  sync, reorg handling, balances, transaction history, and restoration.
- Node SQLite and browser IndexedDB reference adapters.

### Phase 3 — Spending wallet

- Proposals, note selection, ZIP 317 fees, memos, proving, authorization,
  broadcast, transaction monitoring, shielding, and migrations.
- Independent review of the cryptographic and secret-handling boundary.

### Phase 4 — Production integrations

- React Native adapter, hardware/offline signing with PCZT, Tor-capable transport,
  performance work, operational telemetry hooks, and production examples.

### Phase 5 — Advanced capabilities

- Multi-party signing where supported, additional storage backends, backend
  service patterns, and new shielded pools/network upgrades after upstream
  implementations and specifications stabilize.

## 8. Initial Stable API Sketch

```ts
import { createWallet, Mainnet, zec } from "zcash-js";

const wallet = await createWallet({
  network: Mainnet,
  storage,
  lightwalletd: { endpoint: "https://example.invalid" },
  cryptoBackend,
});

const account = await wallet.importViewingKey({
  key: unifiedFullViewingKey,
  birthdayHeight: 2_000_000,
});

for await (const progress of account.sync({ signal })) {
  console.log(progress.stage, progress.ratio);
}

const proposal = await account.proposeTransfer({
  payments: [{ address: recipient, amount: zec("0.01"), memo: "hello" }],
  privacyPolicy: "shielded-only",
});

// A wallet containing spending authority can authorize the reviewed proposal.
const transaction = await account.authorize(proposal);
const submission = await wallet.broadcast(transaction);
```

The names are illustrative. The important boundary is that synchronization,
proposal, authorization, and broadcast remain separate and individually
testable.

## 9. Explicit Non-goals for the First Release

- Reimplementing Zcash cryptography or proving systems in pure TypeScript.
- Acting as a consensus-validating full node or mining implementation.
- Supporting every historical pool for new funds; legacy support should focus on
  safe detection, recovery, and migration.
- Custodial key hosting, exchange accounting, fiat pricing, swaps, or analytics.
- Hiding privacy tradeoffs behind automatic transparent fallback.
- Promising identical functionality in every JavaScript runtime when secure
  storage, threads, transport, or memory semantics differ.

## 10. Open Decisions Before Implementation

1. Which upstream Rust crate versions and shielded pools form the first supported
   protocol matrix?
2. Should the initial release target Node.js plus browsers, or Node.js first with
   browser support after the cryptographic backend is proven?
3. Which Wasm threading strategy and Content Security Policy constraints will be
   supported?
4. Will SQLite and IndexedDB adapters ship in the main repository or as separate
   packages?
5. What compatibility window will be guaranteed for Node.js, browsers,
   lightwalletd, and network upgrades?
6. Which mnemonic standard and language lists, if any, will be officially
   supported?
7. What privacy policy vocabulary should the transaction proposal API expose?

## 11. Primary Technical References

- [Zcash Protocol Specification](https://zips.z.cash/protocol/protocol.pdf)
- [ZIP 32: Shielded Hierarchical Deterministic Wallets](https://zips.z.cash/zip-0032)
- [ZIP 316: Unified Addresses and Unified Viewing Keys](https://zips.z.cash/zip-0316)
- [ZIP 317: Proportional Transfer Fee Mechanism](https://zips.z.cash/zip-0317)
- [ZIP 321: Payment Request URIs](https://zips.z.cash/zip-0321)
- [ZIP 401: Privacy and Security Recommendations for Shielded Wallets](https://zips.z.cash/zip-0401)
- [librustzcash](https://github.com/zcash/librustzcash)
- [lightwalletd](https://github.com/zcash/lightwalletd)

This feature set should be revised whenever the supported Zcash network upgrade,
upstream library, or lightwallet protocol versions change.
