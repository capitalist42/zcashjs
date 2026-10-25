import type { BuiltinNetwork, NetworkDefinition } from './types.js';
import { blockHash } from './primitives.js';
import { failure } from './errors.js';

const MAINNET_GENESIS = '00040fe8ec8471911baa1db1266ea15dd06b4a8a5c453883c000b031973dce08';
const TESTNET_GENESIS = '05a60a92d99d85997cce3b87616c089f6124d7342af37106edc76126334a2c38';

// ZIP 259. zcash_protocol 0.10.6 only exposes NU7 behind an unstable cfg, and that
// placeholder branch is 0xffffffff rather than the deployed id. The native document
// therefore still ends at NU6.3; these heights select the real branch for the two
// chain identities without accepting an unknown key in zcash-js-network/1.
export const NU6_3_BRANCH_ID = 0x37a5165b;
export const NU7_BRANCH_ID = 0x77190ad9;
export const NU7_ACTIVATION = {
  [MAINNET_GENESIS]: { encoding: 'main', height: 3543405 },
  [TESTNET_GENESIS]: { encoding: 'test', height: 4465026 },
} as const;

// Activation schedules through NU6.3: locked zcash_protocol 0.10.6, consensus.rs Main/TestNetwork.
// Genesis hashes: zcash/zcash src/chainparams.cpp CMainParams/CTestNetParams.
// Update with the bundled native protocol; never learn consensus rules from an endpoint.
export function networkPreset(name: BuiltinNetwork): NetworkDefinition {
  if (name !== 'mainnet' && name !== 'testnet') {
    throw failure('INVALID_ARGUMENT', 'validation', 'correct-input',
      'Network preset must be mainnet or testnet; custom networks require a full definition.');
  }
  const main = name === 'mainnet';
  return {
    identity: main ? 'zcash-mainnet' : 'zcash-testnet',
    genesisHash: blockHash(main ? MAINNET_GENESIS : TESTNET_GENESIS),
    parametersFormat: 'zcash-js-network/1',
    parameters: new TextEncoder().encode(JSON.stringify(main
      ? {
          encoding: 'main',
          Overwinter: 347500,
          Sapling: 419200,
          Blossom: 653600,
          Heartwood: 903000,
          Canopy: 1046400,
          Nu5: 1687104,
          Nu6: 2726400,
          Nu6_1: 3146400,
          Nu6_2: 3364600,
          Nu6_3: 3428143,
        }
      : {
          encoding: 'test',
          Overwinter: 207500,
          Sapling: 280000,
          Blossom: 584000,
          Heartwood: 903800,
          Canopy: 1028500,
          Nu5: 1842420,
          Nu6: 2976000,
          Nu6_1: 3536500,
          Nu6_2: 4052000,
          Nu6_3: 4134000,
        })),
  };
}
