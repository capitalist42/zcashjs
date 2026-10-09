import {fixture,unknownAddress} from './viewing-fixture.js';
export async function viewingChecks(api) {
  const check=(ok,label)=>{if(!ok)throw Error(label);};
  const reject=async(promise,code,message)=>{
    try{await promise;throw Error('unexpected success');}catch(error){
      check(api.isZcashError(error)&&error.code===code,`${code}: ${error.code}`);
      if(message)check(message.test(error.message),`diagnostic: ${error.message}`);
      for(const secret of [fixture.ufvk,fixture.uivk,fixture.address,unknownAddress,'private-input'])
        check(!`${error.message} ${error.stack} ${JSON.stringify(error)}`.includes(secret),'sanitized viewing error');
    }
  };
  const definition=encoding=>({identity:`viewing-${encoding}`,genesisHash:'03'.repeat(32),parametersFormat:'zcash-js-network/1',parameters:new TextEncoder().encode(fixture.parameters.replace('regtest',encoding))});
  const network=await api.defineNetwork(definition('regtest'));
  const args={network,format:'ufvk',encoded:fixture.ufvk,enabledPools:['transparent','sapling','ironwood']};
  await reject(api.accountFromViewingKey({...args,signal:AbortSignal.abort()}),'ABORTED');
  const shadow=new AbortController();let reads=0;
  Object.defineProperty(shadow.signal,'aborted',{get(){reads++;return true;}});
  await reject(api.accountFromViewingKey({...args,signal:shadow.signal}),'INVALID_ARGUMENT');check(reads===0,'viewing signal accessor not invoked');
  const full=await api.accountFromViewingKey(args);let incoming,imported,restricted;
  try {
    check(await api.viewing.export({account:full,format:'ufvk',acknowledge:'discloses-viewing-authority'})===fixture.ufvk,'UFVK roundtrip');
    incoming=await api.viewing.toIncoming({account:full});
    const encoded=await api.viewing.export({account:incoming,format:'uivk',acknowledge:'discloses-viewing-authority'});
    check(encoded===fixture.uivk,'native incoming reduction');
    imported=await api.accountFromViewingKey({...args,format:'uivk',encoded});
    await reject(api.viewing.export({account:incoming,format:'ufvk',acknowledge:'discloses-viewing-authority'}),'FULL_VIEWING_KEY_REQUIRED',/requires full viewing authority/);
    const found=await api.addresses.find({account:full,start:api.diversifierIndex(0n),maxAttempts:100});
    const exact=await api.addresses.derive({account:full,index:found.index});
    check(exact.address===found.address&&exact.address===fixture.address,'exact derivation and bounded find');
    let invalid;
    for(let i=0n;i<100n;i++){try{await api.addresses.derive({account:full,index:api.diversifierIndex(i)});}catch(e){if(e.code!=='INVALID_DIVERSIFIER')throw e;invalid=i;break;}}
    check(invalid!==undefined,'fixture invalid diversifier');
    await reject(api.addresses.derive({account:full,index:invalid}),'INVALID_DIVERSIFIER',/use addresses.find/);
    await reject(api.addresses.find({account:full,start:api.diversifierIndex(invalid),maxAttempts:1}),'ADDRESS_SEARCH_LIMIT',/within maxAttempts/);
    check((await api.addresses.find({account:full,start:api.diversifierIndex(invalid),maxAttempts:100})).index>invalid,'bounded search advances');
    const decoded=await api.addresses.decode({network,address:exact.address});
    const context=api.getConsensusContext({network,targetHeight:20});
    const selected=await api.addresses.selectReceiver({address:{...decoded},pool:'sapling',context});
    await reject(api.addresses.selectReceiver({address:decoded,pool:'sapling',context:{...context,branchId:0}}),'NETWORK_MISMATCH',/network, height and branch/);
    check(selected.type==='sapling'&&selected.bytes.length===43,'native receiver routing');
    // Pinned zcash_protocol BranchId::Nu6_3; synthetic activation height 100.
    for(const [pool,type,length] of [['transparent','p2pkh',20],['ironwood','orchard',43]]) {
      const receiver=await api.addresses.selectReceiver({address:decoded,pool,context:{network,targetHeight:100,branchId:0x37a5165b}});
      check(receiver.type===type&&receiver.bytes.length===length,`${pool} native receiver routing`);
    }
    selected.bytes.fill(0);
    check((await api.addresses.selectReceiver({address:decoded,pool:'sapling',context})).bytes.some(b=>b!==0),'owned receiver bytes');
    await reject(api.addresses.selectReceiver({address:decoded,pool:'ironwood',context}),'UNSUPPORTED_POOL',/disabled or unavailable/);
    const main=await api.defineNetwork(definition('main'));
    await reject(api.accountFromViewingKey({...args,network:main}),'NETWORK_MISMATCH',/viewing key network/);
    for(const address of ['private-input',fixture.address])
      await reject(api.addresses.decode({network:main,address}),'INVALID_ARGUMENT',/malformed, unsupported or encoded for a different network/);
    await reject(api.accountFromViewingKey({...args,encoded:'private-input'}),'INVALID_ARGUMENT',/key, format, index and request options/);
    restricted=await api.accountFromViewingKey({...args,enabledPools:['sapling']});
    await reject(api.addresses.derive({account:restricted,index:0n,request:{format:'transparent'}}),'UNSUPPORTED_POOL',/disabled or unavailable/);
    const transparent=await api.addresses.derive({account:full,index:0n,request:{format:'transparent'}});
    const transparentAddress=await api.addresses.decode({network,address:transparent.address});
    await reject(api.addresses.selectReceiver({address:transparentAddress,pool:'sapling',context}),'RECEIVER_UNAVAILABLE',/lacks a required receiver component/);
    await reject(api.addresses.find({account:full,start:0n,maxAttempts:10001}),'RESOURCE_LIMIT',/reduce input size or search attempts/);
    await reject(api.addresses.derive({account:full,index:2147483648n,request:{format:'transparent'}}),'DISCOVERY_RANGE_UNSAFE',/safe discovery range/);
    await reject(api.addresses.selectReceiver({address:decoded,pool:'sapling',context:{...context,network:main}}),'NETWORK_MISMATCH');
    const unknown=await api.addresses.decode({network:main,address:unknownAddress});
    check(unknown.unknownTypecodes.includes(65532),'unknown receiver preserved');
    await reject(api.addresses.selectReceiver({address:unknown,pool:'legacyOrchard',context:{...context,network:main}}),'INVALID_ARGUMENT');
    await reject(api.addresses.derive({account:full,index:found.index,signal:AbortSignal.abort()}),'ABORTED');
    await full.viewing.dispose();await full.viewing.dispose();
    await reject(api.addresses.derive({account:full,index:found.index}),'CLOSED');
    check((await api.addresses.derive({account:incoming,index:found.index})).address===exact.address,'incoming survives full disposal');
    await incoming.viewing.dispose();
    check((await api.addresses.derive({account:imported,index:found.index})).address===exact.address,'imported UIVK independent');
    return {operations:7,independentAuthorities:3,cancelled:2,unknownReceivers:true};
  }finally{await full.viewing.dispose();await incoming?.viewing.dispose();await imported?.viewing.dispose();await restricted?.viewing.dispose();}
}
