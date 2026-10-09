# Build from source

This page is for SDK development or testing an unpublished change. Applications
install the prebuilt [npm package](installation.md); they need no Rust compiler or
post-install downloads.

## Prerequisites

Build on **macOS (Apple Silicon or Intel)** or **Linux x86_64**. On Windows, use
**WSL2 with an x86_64 Linux distribution** and keep the checkout in its Linux
filesystem. Native Windows and Linux ARM builds are not configured.

Install Node **22.12 or newer**, npm, Git, curl, a host C compiler and binutils,
and [rustup](https://rustup.rs/). Development linting requires Node **22.13 or
newer** (or Node 24+).

- **macOS:** `xcode-select --install` supplies the compiler tools. With Homebrew,
  `brew install node` supplies Node and npm. Use native ARM tools on Apple Silicon.
- **Debian/Ubuntu/WSL:** install `build-essential`, `git`, `curl` and
  `ca-certificates`, plus a supported Node version.

Rustup selects the Rust version and WASM target pinned in the native repository.
The native build downloads the matching, checksum-pinned WASI SDK and
wasm-bindgen tools. Python and a global `xtask` installation are not required.

## Build and check

```sh
git clone https://github.com/zcashlabs/zcashjs.git
cd zcashjs
npm ci
npm run build
npm run check
```

**`npm run build` builds the complete package.** It compiles TypeScript, obtains
and builds the pinned native source, downloads and verifies the canonical
Sapling proving parameters, and bundles the codecs, wallet worker and runtime.
Generated JavaScript, declarations, WASM, proving files and integrity receipts
are written to ignored `dist/`. Building does not modify tracked files.

The first build needs network access, takes several minutes and uses several GB
of disk space. Later builds verify and reuse the native output and proving
parameters, then regenerate SDK output from the current TypeScript and scripts.
Changing the native revision selects a new native build; Cargo can reuse its
compilation cache. SDK changes always regenerate the worker and package receipts.

`npm run check` runs lint, this build and the Node test suite. See
[tests/README.md](https://github.com/zcashlabs/zcashjs/blob/main/tests/README.md) for browser and additional integration checks.
Build-host support does not change the SDK's [wallet runtime platform limits](platforms.md).

## Components and source pins

- **This repository** owns the TypeScript API, worker, JavaScript bundling, npm
  packaging and proving-parameter acquisition.
- **[zakura-wasm-bindings](https://github.com/jp4g/zakura-wasm-bindings)** owns the
  `zakura-network-bindings` Rust crate, wallet WASM, primitive codecs, lightwire
  protobuf codec and transparent-address codec. Its `cargo xtask build` command
  produces the native components. It is a public source dependency; publishing
  the crate to crates.io is not required.
- **[scripts/native-source.json](https://github.com/zcashlabs/zcashjs/blob/main/scripts/native-source.json)** pins the exact
  native repository and commit. Its committed `rust-toolchain.toml`, Cargo
  lockfiles and tool archive hashes pin the native build inputs.
- **[src/wallet/proving-assets.ts](https://github.com/zcashlabs/zcashjs/blob/main/src/wallet/proving-assets.ts)** pins the
  size, SHA-256 and BLAKE2b-512 of both Sapling parameter files. The build downloads
  them from `https://download.z.cash/downloads/`; developers do not regenerate
  the cryptographic parameters.

Production runtime binaries and generated capsules are not tracked in Git.
Historical integration fixtures remain under `tests/fixtures/` as explicitly
pinned test inputs. License notices and source declarations remain tracked.

## Cache and recovery

- `.cache/native/<revision>/source/`: pinned native checkout; treat it as build-owned.
- `.cache/native/<revision>/sdk/`: verified native output and its completion receipt.
- `.cache/native/cache/`: native Cargo downloads, compiler output and tool archives.
- `.cache/proving/`: verified proving parameters.
- `build/package-*`: temporary packaging work, removed when that step finishes.

Rustup and the small Rust task itself also use their normal Cargo/toolchain caches.
Do not run concurrent builds in one checkout. To rebuild a native output, remove
its `.cache/native/<revision>/sdk/` directory. To recover from an interrupted
source fetch, remove `.cache/native/<revision>/`. For a fully fresh SDK cache:

```sh
rm -rf .cache/native .cache/proving dist
npm run build
```

Missing tools, failed downloads and checksum mismatches stop the build. A
checksum failure names the offending input; remove that cached file and retry.
A failed build removes `dist/`, so a previous distribution cannot masquerade as
the current result. Never bypass integrity checks to make packaging succeed.

## Make a local package

```sh
mkdir -p /tmp/zcash-package
npm pack --pack-destination /tmp/zcash-package
```

`npm pack` runs the same complete build before creating the tarball. It includes
compiled JavaScript, declarations, codecs, wallet WASM, workers, proving assets,
integrity receipts, README/changelog and licenses. Caches, native source, tests
and build tools are excluded. No compiler or asset download runs during install.

From an application (the filename follows the checkout's package version):

```sh
npm install /tmp/zcash-package/jp4g-zcash.js-0.1.0-rc.4.tgz
```

## Check and preview the documentation

```sh
npm run docs:typecheck
npm run docs:build
npm run docs:dev
```

The last command serves the guide at `http://127.0.0.1:4173/`.
See [Maintain and publish](gitbook.md) for GitBook sync and site deployment.
