# Integration Examples

The tests are executable reference integrations:

- `packages/wallet/test/wallet.test.ts` builds a synthetic compact chain,
  restores an account, interrupts/resumes sync, and replaces a fork.
- `packages/spending/test/spending.test.ts` funds an account, creates a ZIP 317
  proposal, exercises PCZT roles, broadcasts, and monitors confirmation.
- `packages/storage-node/test/sqlite.test.ts` demonstrates persistent SQLite.
- `packages/integrations/test/integrations.test.ts` demonstrates encrypted key
  storage and a React Native-compatible repository.

Run every example and vector with `npm test`. Production applications replace
the synthetic scanner, transport, signer, prover, and cipher with audited host
implementations.
