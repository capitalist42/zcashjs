# Live Zakura regtest

This environment pins Zakura `v1.2.0` and lightwalletd `v0.5.2`. Zakura exposes
JSON-RPC on `127.0.0.1:18432`; lightwalletd exposes plaintext test-only gRPC on
`127.0.0.1:19067`. The chain is ephemeral and the lightwalletd cache is kept in
a named Docker volume until `regtest:reset` is run.

Prerequisites: Node.js 22+, Docker with Compose, and permission to access the
Docker daemon. On Linux, if `/var/run/docker.sock` belongs to the `docker` group,
add the current account to that group using your system's administrator workflow
and start a new login session.

```sh
npm install
npm run test:regtest
```

For an interactive environment:

```sh
npm run regtest:up
npm run test:live
docker compose -f infra/zakura-regtest/compose.yml logs -f
npm run regtest:down
```

Use `npm run regtest:reset` to remove the lightwalletd cache as well. The live
suite mines three blocks, waits for lightwalletd to index them, verifies compact
block continuity and canonical protobuf bytes, syncs into memory and SQLite,
checks resume behavior, and verifies malformed transaction rejection.

This is chain-integration testing, not yet a real shielded-wallet test. The
current scanner, key-derivation, prover, and signer APIs are backend contracts;
until an audited Rust backend implements them, the suite cannot safely fund,
decrypt, prove, or spend shielded notes.
