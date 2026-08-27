# zcash-js

An experimental TypeScript-first framework for Zcash applications. Packages are
published as ESM JavaScript with TypeScript declarations. Consensus-sensitive
cryptography belongs in the audited Rust/Wasm boundary, not in TypeScript.

> **Security status:** Phase 1 foundation. This repository has not been audited
> and must not be used to custody real funds.

## Packages

The workspace includes protocol primitives, addresses, keys, transaction
inspection, storage, light-client sync, read-only wallets, spending proposals,
Rust/Wasm boundaries, platform integrations, full-node RPC, and advanced
pool/multisig extensions. The `zcash-js` package re-exports runtime-neutral APIs;
Node SQLite is available separately from `@zcash-js/storage-node`.

## Development

```sh
npm install
npm run check
```

Run the live Zakura + lightwalletd integration environment with Docker:

```sh
npm run test:regtest
```

See [the regtest guide](./infra/zakura-regtest/README.md) for ports, lifecycle,
and the boundary between live chain tests and the not-yet-implemented audited
shielded cryptography backend.

Build the optional Rust/Wasm proof of concept after installing `wasm-pack`:

```sh
npm run build:wasm
```

See [FEATURES.md](./FEATURES.md), [architecture](./docs/architecture/README.md),
the [read-only wallet guide](./docs/guides/read-only-wallet.md), and the
[threat model](./docs/THREAT_MODEL.md).
