# Release and Supply-chain Policy

Releases are produced from protected tags by CI. The release job must run the
full check, inspect package contents, publish with npm provenance, attach checksums
for native/Wasm artifacts, and generate a changelog. Maintainer laptops should
not publish production packages directly.

Before publishing `1.0`, add branch protection, two-person review for dependency
or Rust-boundary changes, artifact signing, reproducible-build verification, and
an automated dependency-review gate.
