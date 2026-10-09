import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, cp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

test('asset generation replaces stale output and verifies notices, worker inputs and manifest pins', async t => {
  const root = await mkdtemp(join(tmpdir(), 'bundled-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  const put = async (name, bytes) => {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), bytes);
  };
  await put('scripts/bundled-assets.mjs', '');
  await cp(new URL('../../scripts/bundled-assets.mjs', import.meta.url), join(root, 'scripts/bundled-assets.mjs'));
  await put('package.json', '{"type":"module"}');
  await put('src/runtime/bundled-assets.d.mts', '');
  await put('dist/src/wallet/proving-assets.js', 'export const saplingAssets = [];');
  const worker = 'export const worker = true;';
  const inputs = JSON.stringify({ 'dist/src/runtime/wallet-worker.js': sha(worker) });
  const build = JSON.stringify({ workerInputsSha256: sha(inputs) });
  const runtime = {
    'manifest.json': JSON.stringify({ mode: 'baseline', files: [],
      buildSha256: sha(build), dependencyGraphSha256: sha('{}') }),
    'build.json': build, 'dependency-graph.json': '{}', 'native-build.json': '{}',
    'worker-inputs.json': inputs, LICENSE: 'project license',
    'licenses/NATIVE.txt': 'native notices', 'licenses/README.md': 'standalone instructions',
  };
  for (const [name, bytes] of Object.entries(runtime)) await put(`runtime/${name}`, bytes);
  await put('LICENSE', runtime.LICENSE);
  await put('licenses/NATIVE.txt', 'wrong notices');
  await put('dist/src/runtime/wallet-worker.js', worker);
  await put('dist/src/runtime/assets/stale.txt', 'stale');
  const run = (...args) => spawnSync(process.execPath, ['scripts/bundled-assets.mjs', ...args], { cwd: root, encoding: 'utf8' });
  let result = run('--generate', 'runtime', 'proving');
  assert.notEqual(result.status, 0); assert.match(result.stderr, /update root notice/);
  await put('licenses/NATIVE.txt', runtime['licenses/NATIVE.txt']);
  result = run('--generate', 'runtime', 'proving');
  assert.equal(result.status, 0, result.stderr);
  await assert.rejects(access(join(root, 'dist/src/runtime/assets/stale.txt')), { code: 'ENOENT' });
  await assert.rejects(access(join(root, 'src/runtime/assets')), { code: 'ENOENT' });
  const inventory = JSON.parse(await readFile(join(root, 'dist/src/runtime/assets/inventory.json')));
  assert.equal(inventory['licenses/NATIVE.txt'].sha256, sha(runtime['licenses/NATIVE.txt']));
  assert.equal(inventory.LICENSE.sha256, sha(runtime.LICENSE));
  assert.equal(run().status, 0);

  await put('licenses/NATIVE.txt', 'changed notice');
  result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /licenses\/NATIVE.txt/);
  await put('licenses/NATIVE.txt', runtime['licenses/NATIVE.txt']);
  await put('dist/src/runtime/wallet-worker.js', worker + '\n// changed');
  result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /stale packaged worker/);
  await put('dist/src/runtime/wallet-worker.js', worker);
  const pinPath = 'dist/src/runtime/bundled-assets.mjs';
  const pin = await readFile(join(root, pinPath));
  await put(pinPath, "export const bundledArtifact = {manifestSha256:'wrong'};");
  result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /stale bundled manifest pin/);
  await put(pinPath, pin);
  await rm(join(root, 'dist/src/runtime/assets/wallet/worker-inputs.json'));
  result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /ENOENT/);
});
