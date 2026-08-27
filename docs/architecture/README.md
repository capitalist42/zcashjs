# Architecture Decision Record: Phase 0 Foundation

Status: extended through the Phase 2 prototype (2026-08-26).

## Boundary

TypeScript owns public APIs, validation orchestration, transport, persistence
interfaces, and application-facing types. Rust owns consensus-sensitive parsing,
key derivation, note encryption, proving, and signing. Rust is compiled to Wasm
for browsers and may later be compiled as a native library for Node.js and React
Native. TypeScript implementations in Phase 1 are restricted to non-secret
amount arithmetic, standard encodings, payment URIs, and structural inspection.

```text
Application
    |
TypeScript packages (policy, types, orchestration)
    |
CryptoBackend interface (opaque bytes and structured errors)
    |
Pinned librustzcash crates -> Wasm/native artifact
```

No package may bypass `CryptoBackend` to implement spending operations in JS.
Backend calls must be deterministic except explicit entropy APIs, accept bounded
inputs, return stable error codes, and avoid exposing secret material in errors.

## Package dependencies

`core` has no workspace dependencies. `address` and `transaction` depend only on
`core`. `wasm` implements the backend boundary. The `zcash-js` convenience package
re-exports stable APIs. Dependency direction may not be inverted.

Phase 2 adds `storage` (runtime-neutral contracts plus IndexedDB), `storage-node`
(SQLite), `light-client` (transport and sync orchestration), and `wallet`
(read-only account views). The scanner consumes opaque protobuf blocks and owns
protocol-specific trial decryption; the repository persists only its opaque
checkpoint and resulting wallet effects.

## Runtime matrix

| Runtime | Phase 1 | Policy |
| --- | --- | --- |
| Node.js 22+ | Supported | ESM, Web Crypto available |
| Modern browsers | Build-compatible | test Chromium/Firefox/WebKit before release |
| Web Workers | Build-compatible | no DOM requirement in library code |
| React Native | Planned | requires secure RNG/storage and native/Wasm evaluation |

Phase 2 runtime adapters are Node's built-in SQLite and browser IndexedDB. The
in-memory repository and key store are for tests and ephemeral tools.

## Protocol matrix

Phase 1 recognizes Mainnet, Testnet, and Regtest; transparent P2PKH/P2SH,
Sapling, and ZIP 316 Revision 0 Unified Address encodings; ZIP 321 ZEC payment
requests; and transaction envelope versions 1 through 5. Recognition is not
spending support. Revision 2 ZIP 316 prefixes and post-v5 transaction formats are
reserved until pinned upstream Rust releases are selected and vectors added.

Upstream versions must be exact in `Cargo.lock`. Network activation data is
descriptive in Phase 1 and must be checked against the current protocol spec
before transaction construction is introduced.
