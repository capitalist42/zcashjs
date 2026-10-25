// Live testnet check: NU7 branch handshake, then a new in-memory wallet and receive address.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sdk = await import(pathToFileURL(resolve(root, 'dist/src/index.js')));
const endpoint = process.env.TESTNET_ENDPOINT ?? 'https://testnet.zec.rocks:443';
const NU7_BRANCH = 0x77190ad9;
const NU7_HEIGHT = 4465026;
const light = await sdk.createLightClient(endpoint, { network: 'testnet' });
const tip = await light.getTip();
const context = sdk.getConsensusContext({ network: light.network, targetHeight: tip.height });
assert.equal(context.branchId, NU7_BRANCH, 'testnet tip is not being read under the NU7 branch');
assert.ok(tip.height >= NU7_HEIGHT, `testnet tip ${tip.height} is before NU7 activation ${NU7_HEIGHT}`);
const info = await light.getServerInfo();
// Birthday is the prior NU7 block, so account import checks a post-activation tree state.
const birthday = await sdk.resolveBirthday({ light, firstScanHeight: tip.height });
const wallet = await sdk.createWalletClient(endpoint, {
  network: 'testnet',
  storage: { kind: 'memory' },
  recovery: { mode: 'offline' },
});
const mnemonic = new TextEncoder().encode(
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
);
try {
  const imported = await wallet.accounts.import({ mnemonic, accountIndex: 0, birthday });
  const { address } = await wallet.addresses.next({
    accountId: imported.account.id,
    request: { format: 'unified', transparent: 'omit', sapling: 'omit', ironwood: 'require' },
  });
  const decoded = await sdk.addresses.decode({ network: light.network, address });
  assert.deepEqual(decoded.knownReceivers, ['orchard']);
  assert.deepEqual(decoded.unknownTypecodes, []);
  console.log(JSON.stringify({
    endpoint,
    server: info.version,
    tip: tip.height,
    branchId: context.branchId.toString(16).padStart(8, '0'),
    accountId: imported.account.id,
    address,
  }, null, 2));
} finally {
  mnemonic.fill(0);
  await wallet.close();
}
// Endpoint clients keep the gRPC channel open; this one-shot check has finished.
process.exit(0);
