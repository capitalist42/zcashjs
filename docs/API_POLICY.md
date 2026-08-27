# API and Compatibility Policy

- SemVer governs each published package independently after `1.0.0`.
- Public exports exist only through package `exports`; deep imports are private.
- Amounts use `bigint` zatoshis. Binary data uses `Uint8Array`.
- APIs performing I/O are asynchronous and accept `AbortSignal` where useful.
- Errors extend `ZcashError`, have a stable string code, and never contain keys.
- Network-specific values carry a network identifier and reject mismatches.
- New protocol variants are represented explicitly; exhaustive switches should
  fail at compile time when a consumer must choose policy.
- Deprecations remain for one minor release before `1.0`, and one major line
  after `1.0`, except urgent security removals.
- Experimental exports are placed under an explicit `experimental` entry point
  and may change without the stable compatibility guarantee.
