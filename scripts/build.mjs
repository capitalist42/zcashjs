// Developer/package build: native compilation is cached; SDK output is always fresh.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildNative } from './build-native-wallet.mjs';

const root = resolve(import.meta.dirname, '..');
// Keep npm pack --json stdout machine-readable during its prepack hook.
const node = (script, ...args) => execFileSync(process.execPath, [script, ...args], { cwd: root, stdio: ['inherit', 2, 2] });

try {
  rmSync(join(root, 'dist'), { recursive: true, force: true });
  node('node_modules/typescript/bin/tsc', '-p', 'tsconfig.json');
  const native = buildNative();
  const proving = join(root, '.cache/proving');
  mkdirSync(proving, { recursive: true });
  const { saplingAssets } = await import('../dist/src/wallet/proving-assets.js');
  for (const asset of saplingAssets) {
    const path = join(proving, asset.assetId), partial = `${path}.part`;
    const verify = file => {
      const bytes = readFileSync(file);
      assert.equal(bytes.length, asset.byteLength, `proving asset size: ${file}`);
      for (const algorithm of ['sha256', 'blake2b512']) {
        assert.equal(createHash(algorithm).update(bytes).digest('hex'), asset[algorithm], `proving asset ${algorithm}: ${file}`);
      }
    };
    if (!existsSync(path)) {
      try {
        execFileSync('curl', ['--fail', '--location', '--retry', '3', '--output', partial,
          `https://download.z.cash/downloads/${asset.assetId}`], { stdio: 'inherit' });
        verify(partial);
        renameSync(partial, path);
      } finally { rmSync(partial, { force: true }); }
    }
    verify(path);
  }
  const build = join(root, 'build');
  mkdirSync(build, { recursive: true });
  const staging = mkdtempSync(join(build, 'package-'));
  try {
    const worker = join(staging, 'worker.mjs'), runtime = join(staging, 'runtime');
    node('scripts/build-wallet-worker.mjs', worker);
    node('scripts/package-native-wallet.mjs', native.output, native.source, worker, runtime);
    node('scripts/primitive-capsule.mjs', native.output);
    node('scripts/bundled-assets.mjs', '--generate', runtime, proving);
    node('scripts/bundled-assets.mjs');
  } finally { rmSync(staging, { recursive: true, force: true }); }
  console.error('SDK build complete: dist/');
} catch (error) {
  // Never leave an earlier or partially assembled distribution after a failed build.
  rmSync(join(root, 'dist'), { recursive: true, force: true });
  console.error(`SDK build failed: ${error.message}\nSee docs/api/building-locally.md for prerequisites and cache recovery.`);
  process.exitCode = 1;
}
