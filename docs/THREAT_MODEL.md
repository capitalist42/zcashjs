# Threat Model

## Assets

Seeds and spending keys are critical. Viewing keys, recipient addresses, memos,
wallet history, balances, IP metadata, and account linkage are sensitive. Chain
state, transaction proposals, downloaded Wasm, and database migrations require
integrity.

## Adversaries and mitigations

| Threat | Initial mitigation | Residual risk |
| --- | --- | --- |
| Malicious lightwallet server | TLS, bounded parsing, cross-checkable tips, reorg rules | server learns timing/IP and may omit data |
| Dependency compromise | lockfiles, minimal dependencies, CI audit, provenance goal | registry/build infrastructure remains trusted |
| XSS or compromised app | CSP guidance, worker isolation, no secret logging | same-origin script can access JS/Wasm memory |
| Local database theft | future encrypted secret store separated from sync data | access patterns and public state may leak |
| Malformed address/URI/transaction | strict codecs, size limits, fuzzing target | Phase 1 parsers are not consensus validators |
| Reorg or rollback | checkpoints and validated rewind in Phase 2 | unavailable in Phase 1 |
| Timing/memory inspection | secret operations confined to audited backend | JS and Wasm cannot promise process isolation |
| Privacy downgrade | shielded-only default and explicit policy types | users can still authorize unsafe policies |

## Trust boundaries

Applications are responsible for origin security, secure persistence, endpoint
selection, and user confirmation. The library must treat network bytes, database
contents, URIs, addresses, and serialized transactions as hostile. The Rust/Wasm
artifact is trusted only after version pinning, hash verification, and review.

## Required before production

- independent review of the native/Wasm and secret-handling boundary;
- a private vulnerability channel and incident process;
- reproducible signed artifacts with provenance;
- fuzz coverage for every untrusted parser;
- documented server privacy and wallet backup UX;
- integration tests for adversarial compact chains and reorganizations.
