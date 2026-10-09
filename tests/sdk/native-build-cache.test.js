import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyNativeBuild } from '../../scripts/build-native-wallet.js';

test('native cache rejects changed artifacts, receipts, incomplete builds and stale revisions', t => {
  const root = mkdtempSync(join(tmpdir(), 'native-cache-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  const put = (name, bytes) => writeFileSync(join(root, name), bytes);
  const files = { 'native.wasm': sha('wasm') };
  const revision = 'a'.repeat(40);
  const receipt = { format: 'zcash-js-native-build/1', complete: true, revision,
    artifacts: files, primitiveArtifacts: files, codecs: {} };
  for (const name of ['bundle', 'primitive', 'lightwire', 'transparent-address']) {
    mkdirSync(join(root, name));
    put(`${name}/native.wasm`, 'wasm');
    if (name === 'bundle' || name === 'primitive') continue;
    const bytes = JSON.stringify({ status: 'built', artifacts: files });
    put(`${name}/receipt.json`, bytes);
    receipt.codecs[name] = sha(bytes);
  }
  const save = () => put('build.json', JSON.stringify(receipt));
  save(); verifyNativeBuild(root, revision);
  put('bundle/native.wasm', 'changed');
  assert.throws(() => verifyNativeBuild(root, revision), /native artifact checksum/);
  put('bundle/native.wasm', 'wasm');
  receipt.revision = '0'.repeat(40); save();
  assert.throws(() => verifyNativeBuild(root, revision), /stale native revision/);
  receipt.revision = revision; receipt.complete = false; save();
  assert.throws(() => verifyNativeBuild(root, revision), /incomplete native build/);
  receipt.complete = true; save();
  put('lightwire/receipt.json', '{}');
  assert.throws(() => verifyNativeBuild(root, revision), /native codec receipt/);
});
