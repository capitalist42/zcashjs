import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, cp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

test('asset build verifies root notices and pins, removes stale output and rejects missing files', async t => {
  const root = await mkdtemp(join(tmpdir(), 'bundled-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  const put = async (name, bytes) => {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), bytes);
  };
  await put('scripts/bundled-assets.mjs', '');
  await cp(new URL('../../scripts/bundled-assets.mjs', import.meta.url), join(root, 'scripts/bundled-assets.mjs'));
  const worker = 'export const worker = true;', manifest = '{}';
  const inputs = JSON.stringify({ 'dist/src/runtime/wallet-worker.js': sha(worker) });
  const files = { 'wallet/manifest.json': manifest, 'wallet/worker-inputs.json': inputs,
    'licenses/NATIVE.txt': 'native notices', LICENSE: 'project license' };
  for (const [name, bytes] of Object.entries(files)) {
    await put(name.startsWith('wallet/') ? `src/runtime/assets/${name}` : name, bytes);
  }
  await put('src/runtime/assets/inventory.json', JSON.stringify(Object.fromEntries(Object.entries(files)
    .map(([name, bytes]) => [name, { byteLength: Buffer.byteLength(bytes), sha256: sha(bytes) }]))));
  const pin = `export const bundledArtifact = {manifestSha256:'${sha(manifest)}'};`;
  await put('src/runtime/bundled-assets.mjs', pin);
  await put('src/runtime/bundled-assets.d.mts', '');
  await put('dist/src/runtime/wallet-worker.js', worker);
  await put('dist/src/runtime/assets/wallet/licenses/NATIVE.txt', 'stale duplicate');
  await put('dist/src/runtime/assets/wallet/LICENSE', 'stale duplicate');
  const run = () => spawnSync(process.execPath, ['scripts/bundled-assets.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(run().status, 0);
  await assert.rejects(access(join(root, 'dist/src/runtime/assets/wallet/licenses')), { code: 'ENOENT' });
  await assert.rejects(access(join(root, 'dist/src/runtime/assets/wallet/LICENSE')), { code: 'ENOENT' });
  await put('licenses/NATIVE.txt', 'changed notice');
  let result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /licenses\/NATIVE.txt/);
  await put('licenses/NATIVE.txt', files['licenses/NATIVE.txt']);
  await put('dist/src/runtime/wallet-worker.js', worker + '\n// changed');
  result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /stale packaged worker/);
  await put('dist/src/runtime/wallet-worker.js', worker);
  await put('src/runtime/bundled-assets.mjs', "export const bundledArtifact = {manifestSha256:'wrong'};");
  result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /stale bundled manifest pin/);
  await put('src/runtime/bundled-assets.mjs', pin);
  await rm(join(root, 'src/runtime/assets/wallet/worker-inputs.json'));
  result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /ENOENT/);

  // Regeneration must reuse matching root notices, not silently drop new notices.
  const build = JSON.stringify({ workerInputsSha256: sha(inputs) });
  const runtime = { 'manifest.json': JSON.stringify({ mode: 'baseline', files: [],
    buildSha256: sha(build), dependencyGraphSha256: sha('{}') }),
    'build.json': build, 'dependency-graph.json': '{}', 'native-build.json': '{}',
    'worker-inputs.json': inputs, LICENSE: files.LICENSE,
    'licenses/NATIVE.txt': files['licenses/NATIVE.txt'], 'licenses/README.md': 'standalone instructions' };
  for (const [name, bytes] of Object.entries(runtime)) await put(`runtime/${name}`, bytes);
  await put('dist/src/wallet/proving-assets.js', 'export const saplingAssets = [];');
  await put('package.json', '{"type":"module"}');
  await rm(join(root, 'src/runtime/assets'), { recursive: true });
  const generate = () => spawnSync(process.execPath,
    ['scripts/bundled-assets.mjs', '--generate', 'runtime', 'proving'], { cwd: root, encoding: 'utf8' });
  await put('licenses/NATIVE.txt', 'different notice');
  result = generate(); assert.notEqual(result.status, 0); assert.match(result.stderr, /update root notice/);
  await put('licenses/NATIVE.txt', files['licenses/NATIVE.txt']);
  result = generate(); assert.equal(result.status, 0, result.stderr);
  const inventory = JSON.parse(await readFile(join(root, 'src/runtime/assets/inventory.json')));
  assert.equal(inventory['licenses/NATIVE.txt'].sha256, sha(files['licenses/NATIVE.txt']));
  assert.equal(inventory.LICENSE.sha256, sha(files.LICENSE));
  await assert.rejects(access(join(root, 'src/runtime/assets/wallet/licenses')), { code: 'ENOENT' });
});
