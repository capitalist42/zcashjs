import test from 'node:test';
import assert from 'node:assert/strict';
import {createLightClient,defineNetwork,encodeNetworkParameters,resolveBirthday} from '../../dist/src/index.js';
import {initialize} from '../../dist/src/runtime/lightwire-capsule.mjs';
import {revision,scalar,bytesField,concat,blockBytes,tipBytes} from '../clients/light-chain-reads-fixtures.js';
const text=(n,s)=>bytesField(n,new TextEncoder().encode(s));
const genesis=Uint8Array.from({length:32},(_,i)=>i);
const network=await defineNetwork({identity:'synthetic',genesisHash:Buffer.from(genesis).reverse().toString('hex'),parametersFormat:'zcash-js-network/1',parameters:new TextEncoder().encode('{"encoding":"main","Overwinter":10,"Sapling":20,"Blossom":30,"Heartwood":40,"Canopy":50,"Nu5":60,"Nu6":70,"Nu6_1":80,"Nu6_2":90,"Nu6_3":100}')});
test('light handshake uses block 1 ancestry and requires successful stream completion',async()=>{
  for(const mode of ['good','wrong-genesis','empty','trailing-error']){
    let streams=0,tips=0;
    const client=createLightClient({network,transport:{kind:'custom-lightwallet',sourceId:'synthetic',protocolRevision:revision,
      async unary({method}){
        if(method==='GetLightdInfo')return concat(text(4,'main'),scalar(5,20),text(6,'76b809bb'),scalar(7,20),text(18,'v0.5.0'));
        if(method==='GetLatestBlock'){tips++;return tipBytes(20);}
        throw Error('genesis tree is unsupported');
      },
      async *stream({method,request}){
        streams++;assert.equal(method,'GetBlockRange');assert.deepEqual([...request],[10,2,8,1,18,2,8,1]);
        if(mode==='empty')return;
        yield blockBytes(1,undefined,mode==='wrong-genesis'?new Uint8Array(32):genesis);
        if(mode==='trailing-error')throw Error('stream failed after block');
      }
    }});
    if(mode==='good'){assert.equal((await client.getTip()).height,20);await client.getTip();assert.equal(streams,1);assert.equal(tips,2);}
    else{await assert.rejects(client.getTip(),{code:mode==='wrong-genesis'?'NETWORK_MISMATCH':mode==='empty'?'PROTOCOL_MISMATCH':'TRANSPORT_ERROR'});assert.equal(tips,0);}
  }
});

test('network labels remain directional and aliased Regtest tree states support native birthdays', async () => {
  const wire = initialize();
  for (const encoding of ['main', 'test', 'regtest']) {
    const configured = await defineNetwork({ identity: 'label-matrix', genesisHash: network.genesisHash,
      ...encodeNetworkParameters({ encoding, Overwinter: 10, Sapling: 20, Blossom: 30,
        Heartwood: 40, Canopy: 50, Nu5: 60, Nu6: 70, Nu6_1: 80, Nu6_2: 90, Nu6_3: 100 }) });
    for (const label of ['main', 'test', 'regtest', 'unknown', 'TEST']) {
      let treeLabel = label, wrongGenesis = false, wrongBranch = false, wrongSapling = false;
      const treeDto = () => ({ network: treeLabel, height: '20', hash: '12'.repeat(32),
        time: 123456, sapling_tree: '000000', orchard_tree: '', ironwood_tree: '' });
      const client = createLightClient({ network: configured, transport: {
        kind: 'custom-lightwallet', sourceId: 'labels', protocolRevision: revision,
        async unary({ method }) {
          if (method === 'GetLightdInfo') return concat(text(4, label),
            scalar(5, wrongSapling ? 21 : 20), text(6, wrongBranch ? '00000000' : '76b809bb'),
            scalar(7, 20), text(18, 'v0.5.0'));
          if (method === 'GetTreeState') return wire.encodeTreeState(JSON.stringify(treeDto()));
          assert.equal(method, 'GetLatestBlock');
          return tipBytes(20);
        },
        async *stream() { yield blockBytes(1, undefined, wrongGenesis ? new Uint8Array(32) : genesis); },
      } });
      const accepted = label === encoding || encoding === 'regtest' && label === 'test';
      if (!accepted) {
        await assert.rejects(client.getTip(), { code: 'NETWORK_MISMATCH' });
        continue;
      }
      // The shared test label must not bypass any other handshake evidence.
      wrongGenesis = true;
      await assert.rejects(client.getTip(), { code: 'NETWORK_MISMATCH', message: /genesis/ });
      wrongGenesis = false; wrongBranch = true;
      await assert.rejects(client.getTip(), { code: 'NETWORK_MISMATCH', message: /branch ID/ });
      wrongBranch = false; wrongSapling = true;
      await assert.rejects(client.getTip(), { code: 'NETWORK_MISMATCH', message: /Sapling/ });
      wrongSapling = false;
      assert.equal((await client.getTip()).height, 20);
      assert.equal((await client.getServerInfo()).networkIdentity, configured.identity);
      const state = await client.getTreeState({ height: 20 });
      assert.equal(state.network, configured);
      assert.deepEqual(wire.decodeResponse('GetTreeState', state.encoded),
        wire.decodeResponse('GetTreeState', wire.encodeTreeState(JSON.stringify({ ...treeDto(), network: encoding }))));
      const birthday = await resolveBirthday({ light: client, firstScanHeight: 21 });
      assert.equal(birthday.network, configured);
      assert.deepEqual(birthday.priorTreeState, state.encoded);
      // A valid cached handshake must not admit incompatible later tree metadata.
      treeLabel = encoding === 'main' ? 'test' : 'main';
      await assert.rejects(client.getTreeState({ height: 20 }), { code: 'NETWORK_MISMATCH' });
    }
  }
});

test('handshake diagnostics identify mismatched evidence without exposing server values', async () => {
  const regtest = await defineNetwork({
    identity: 'diagnostics', genesisHash: network.genesisHash,
    ...encodeNetworkParameters({ encoding: 'regtest', Overwinter: 10, Sapling: 20,
      Blossom: 30, Heartwood: 40, Canopy: 50, Nu5: 60, Nu6: 70,
      Nu6_1: 80, Nu6_2: 90, Nu6_3: 100 }),
  });
  for (const [mode, message] of [
    ['chain', /chain name.*encoding/],
    ['private-chain', /chain name.*encoding/],
    ['sapling', /Sapling activation height/],
    ['branch', /consensus branch ID.*reported block height/],
    ['protocol', /protocol revision.*v0\.5\.0/],
    ['genesis', /genesis/],
  ]) {
    let repaired = false, tips = 0;
    const client = createLightClient({ network: regtest, transport: {
      kind: 'custom-lightwallet', sourceId: 'SECRET-source', protocolRevision: revision,
      async unary({ method }) {
        if (method === 'GetLightdInfo') {
          return concat(text(1, 'SECRET-version'), text(2, 'SECRET-vendor'),
            text(4, !repaired && mode === 'chain' ? 'main'
              : !repaired && mode === 'private-chain' ? 'SECRET-chain' : 'regtest'),
            scalar(5, !repaired && mode === 'sapling' ? 21 : 20),
            text(6, !repaired && mode === 'branch' ? '00000000' : '76b809bb'), scalar(7, 20),
            text(18, !repaired && mode === 'protocol' ? 'SECRET-protocol' : 'v0.5.0'));
        }
        assert.equal(method, 'GetLatestBlock');
        tips++;
        return tipBytes(20);
      },
      async *stream() {
        yield blockBytes(1, undefined, !repaired && mode === 'genesis' ? new Uint8Array(32) : genesis);
      },
    } });
    await assert.rejects(client.getTip(), error => {
      assert.equal(error.code, mode === 'protocol' ? 'PROTOCOL_MISMATCH' : 'NETWORK_MISMATCH');
      assert.equal(error.recovery, 'configure');
      assert.match(error.message, message);
      assert.doesNotMatch(error.message + JSON.stringify(error), /SECRET/);
      return true;
    });
    assert.equal(tips, 0, 'mismatched evidence must block the requested query');
    repaired = true;
    assert.equal((await client.getTip()).height, 20, 'failed handshake must retry after metadata is corrected');
    assert.equal(tips, 1);
  }
});
