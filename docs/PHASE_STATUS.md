# Implementation Status

## Phase 0 — complete for prototype

- Rust/Wasm ownership boundary: `docs/architecture/README.md`
- Supported runtime and protocol matrix: `docs/architecture/README.md`
- Threat model and production gates: `docs/THREAT_MODEL.md`
- API and compatibility rules: `docs/API_POLICY.md`
- Security and release processes: `SECURITY.md`, `docs/RELEASE.md`

The upstream prototype pins `f4jumble` and `wasm-bindgen`. Wallet phases must pin
the selected `librustzcash` wallet crates before adding key or spending APIs.

## Phase 1 — implemented prototype

- Workspace, ESM compilation, declarations, source maps, CI, package inspection
- Amounts, networks, strict bytes/CompactSize, and structured errors
- Transparent/Sapling address round trips and Unified Address validation
- ZIP 321 ZEC requests with multiple recipients and memos
- Bounded v1-v5 transaction envelope inspection
- Rust/Wasm F4Jumble backend and browser-target build
- Official ZIP 321 vectors, TypeScript tests, Rust tests, and Node 22/24 CI

## Deliberate limits

This milestone is a safe foundation, not a wallet. It does not derive keys,
validate transaction consensus rules, construct transactions, synchronize a
chain, persist wallet state, or spend funds. Unified Address receiver inspection
requires the Rust backend; TypeScript only validates the outer Bech32m envelope.
ZIP 316 Revision 2, custom assets, and post-v5 transactions fail explicitly until
their upstream protocol support is pinned and tested.

## Phase 2 — implemented prototype

- Watch-only multi-account import with birthday-height restoration
- Versioned atomic repository contracts and separated viewing-key storage
- In-memory, browser IndexedDB, and Node SQLite state adapters
- Typed canonical-lightwallet transport contract with retry and endpoint failover
- Resumable batched compact-block synchronization and cancellation
- Opaque Rust-scanner checkpoints, note effects, spend detection, and history
- Hash-based fork detection, bounded rewind, and replay
- Per-pool spendable/pending balances and confirmed/pending history
- Progress iteration and wallet change subscriptions
- Synthetic tests for restoration, interruption, persistence, and reorganization

The repository intentionally does not ship a pure-TypeScript shielded scanner or
embed a particular gRPC stack. Production integrations must supply a transport
generated from the canonical lightwallet protocol and a pinned librustzcash
scanner backend.

## Phase 3 — implemented framework

- Deterministic shielded-note selection and durable expiring note locks
- ZIP 317 Revision 1 conventional fee calculations
- Multi-recipient payments, memo validation, shielded-only defaults, and explicit
  transparent-payment warnings
- Reviewed immutable proposals with input, payment, fee, change, and action totals
- ZIP 374 PCZT constructor, signer, prover, and finalizer roles
- Broadcast validation and submitted/mined/expired/conflicted monitoring
- Offline, hardware, and external Rust backends implement the same signer roles

## Phase 4 — implemented integration layer

- Encrypted viewing-key adapter over an application keystore and cipher
- React Native AsyncStorage-compatible wallet repository
- Direct/Tor-required per-operation transport policy
- Privacy-bounded operational telemetry
- Node SQLite and browser IndexedDB production-state adapters
- Full-node JSON-RPC client and integration guidance

## Phase 5 — implemented extension layer

- Extensible value-pool registry with activation-height capability lookup
- Deterministic bounded pool-migration planning
- Threshold PCZT signer coordination for ZIP 312/FROST-capable signers
- Opaque key handles, account derivation, viewing-key export, address derivation,
  and explicit backend key destruction

## Production readiness

The roadmap's TypeScript APIs and orchestration are complete, but production
readiness is intentionally not claimed. The following are external security and
protocol deliverables, not safe TypeScript substitutes:

- audited librustzcash scanner, key, transaction, proving, and finalization bindings;
- generated canonical lightwallet gRPC/gRPC-Web transport for each target runtime;
- actual hardware-wallet/FROST participant implementations;
- independent security audit, fuzz campaign, signed reproducible releases, and
  operational endpoint infrastructure.
