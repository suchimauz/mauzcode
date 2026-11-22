import {expect, test} from 'bun:test';
import {generateKeyPairSync, sign} from 'node:crypto';
import {EventEmitter} from 'node:events';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import * as path from 'node:path';
const {signRelease} = require('./tools/sign-release.cjs');
const {createUpdates} = require('./updates.cjs');
const version = '1.2.0-pilot.10', filename='MauzCode-x64.AppImage';
const repo='fixture/public-pilot', base=`https://github.com/${repo}/releases/download/v${version}/`;

// An offline repository of exact GitHub release paths; a local updater double consumes the real provider.
async function fixture(run: (f: any)=>Promise<void>) {
  const dir=await fs.mkdtemp(path.join(tmpdir(),'release-fixture-'));
  try {
    const keys=generateKeyPairSync('ed25519');
    const pin={repository:repo,channel:'pilot',publicKey:keys.publicKey.export({format:'pem',type:'spki'})};
    const artifact=path.join(dir,filename), keyfile=path.join(dir,'key.pem'), inventory=path.join(dir,'inventory.json');
    await fs.writeFile(artifact,'synthetic app image'); await fs.writeFile(keyfile,keys.privateKey.export({format:'pem',type:'pkcs8'}),{mode:0o600});
    await fs.writeFile(inventory,JSON.stringify([{filename,arch:'x64',platform:'linux'}]));
    await signRelease(version,'pilot',dir,inventory,keyfile);
    const pinFile=path.join(dir,'pin.json'); await fs.writeFile(pinFile,JSON.stringify(pin));
    await require('./tools/verify-release.cjs').verifyRelease(version,dir,pinFile);
    const api=`https://api.github.com/repos/${repo}/releases?per_page=30&page=1`;
    const releases=[{tag_name:`v${version}`,draft:false,prerelease:true,assets:[{browser_download_url:'https://wrong.invalid/'}]}];
    const files=new Map([[api,Buffer.from(JSON.stringify(releases))],[base+'desktop-manifest.json',await fs.readFile(path.join(dir,'desktop-manifest.json'))],[base+'desktop-manifest.sig',await fs.readFile(path.join(dir,'desktop-manifest.sig'))]]);
    const updater:any = new EventEmitter(); let installs=0, cleanup=0, current='1.2.0-pilot.9';
    let provider:any, updateInfo:any;
    updater.setFeedURL=({provider:type,updateProvider}:any)=>{expect(type).toBe('custom'); provider=new updateProvider();};
    updater.checkForUpdates=async()=>({isUpdateAvailable:true,updateInfo:updateInfo=await provider.getLatestVersion()});
    updater.downloadUpdate=async()=>{
      const [selection]=provider.resolveFiles(updateInfo); expect(selection.url.href).toBe(base+filename);
      return [artifact];
    };
    updater.quitAndInstall=()=>{installs++;};
    const deps:any={platform:'linux',arch:'x64',pin,updater,read:async(url:string)=>{const f=files.get(url); if(!f) throw Error('offline'); return f;}};
    const open=()=>createUpdates({app:{isPackaged:true,getVersion:()=>current},beforeInstall(){cleanup++;}},deps);
    const metadata=JSON.parse(files.get(base+'desktop-manifest.json')!.toString());
    function resign(){const bytes=Buffer.from(JSON.stringify(metadata)); files.set(base+'desktop-manifest.json',bytes); files.set(base+'desktop-manifest.sig',Buffer.from(sign(null,bytes,keys.privateKey).toString('base64')));}
    await run({open,updater,deps,files,artifact,api,metadata,resign,setCurrent:(v:string)=>{current=v;},counts:()=>[installs,cleanup]});
  } finally {await fs.rm(dir,{recursive:true,force:true});}
}
test('installed AppImageUpdater stages signed bytes without credentials or a quit handler',()=>fixture(async f=>{
  const {AppImageUpdater}=require('electron-updater');
  const dir=path.dirname(f.artifact), config=path.join(dir,'app-update.yml');
  await fs.writeFile(config,'updaterCacheDirName: fixture-cache\n');
  let quitHandlers=0, downloads=0;
  const updater=new AppImageUpdater(null,{version:'1.2.0-pilot.9',name:'fixture',isPackaged:true,whenReady:async()=>{},appUpdateConfigPath:config,userDataPath:dir,baseCachePath:dir,onQuit(){quitHandlers++;}});
  updater.logger=null; updater.requestHeaders={Authorization:'fixture-only'};
  updater.httpExecutor={download:async(url:URL,dest:string,options:any)=>{
    expect(url.href).toBe(base+filename); expect(options.headers).toEqual({accept:'*/*'});
    expect(options.sha512).toBe(f.metadata.assets[0].sha512); downloads++; await fs.copyFile(f.artifact,dest);
  }};
  f.deps.updater=updater;
  const previous=process.env.APPIMAGE; process.env.APPIMAGE=f.artifact;
  try {
    const {action}=f.open(); expect((await action('check')).state).toBe('available');
    expect((await action('download')).state).toBe('ready');
    expect(updater.installerPath).toBe(path.join(dir,'fixture-cache','pending',filename));
    expect((await action('later')).state).toBe('deferred'); expect([downloads,quitHandlers]).toEqual([1,0]);
  } finally { if(previous===undefined) delete process.env.APPIMAGE; else process.env.APPIMAGE=previous; }
}));
test('valid signed release: authenticated provider, explicit deferred install only',()=>fixture(async f=>{
  const {action}=f.open(); expect((await action('check')).state).toBe('available'); expect(f.updater.autoDownload).toBe(false);
  expect((await action('download')).state).toBe('ready'); expect((await action('later')).state).toBe('deferred');
  expect(f.updater.autoInstallOnAppQuit).toBe(false); expect(f.counts()).toEqual([0,0]);
  await action('restart'); await action('restart'); expect(f.counts()).toEqual([1,1]);
}));
for(const attack of ['replaced manifest','replaced signature','digest','length','identity','platform','arch','channel','signed downgrade','older release','offline','platform signature','modified after Later']) {
  test(`rejects ${attack}`,()=>fixture(async f=>{
    const a=f.metadata.assets[0];
    switch(attack) {
      case 'replaced manifest': f.files.set(base+'desktop-manifest.json', Buffer.from(JSON.stringify(f.metadata))); break;
      case 'replaced signature': f.files.set(base+'desktop-manifest.sig',Buffer.from('untrusted')); break;
      case 'digest': a.sha512=Buffer.alloc(64).toString('base64'); f.resign(); break;
      case 'length': a.size++; f.resign(); break;
      case 'identity': f.updater.downloadUpdate=async()=>[path.join(path.dirname(f.artifact),'other.AppImage')]; break;
      case 'platform': a.platform='darwin'; a.filename='test-x64.zip'; f.resign(); break;
      case 'arch': a.platform='darwin'; a.arch='arm64'; a.filename='test-arm64.zip'; f.deps.platform='darwin'; f.resign(); break;
      case 'channel': f.metadata.channel='stable'; f.resign(); break;
      case 'signed downgrade': f.metadata.version='1.1.0-pilot.1'; f.resign(); break;
      case 'older release': f.setCurrent('1.2.0-pilot.11'); break;
      case 'offline': f.files.delete(f.api); break;
      case 'platform signature': f.deps.verifyPlatform=async()=>{throw Error('invalid signer');}; break;
    }
    const {action,state}=f.open(); await action('check'); await action('download'); await action('later');
    if(attack==='modified after Later') { expect(state().state).toEqual('deferred'); await fs.appendFile(f.artifact,'tamper'); }
    await action('restart'); expect(f.counts()).toEqual([0,0]); expect(['error','current']).toContain(state().state);
  }));
}
test('unpackaged client, missing key: unavailable without contacting feed',()=>{
  for(const packed of [true,false]) expect(createUpdates({app:{isPackaged:packed}}, {pin:{repository:repo,channel:'pilot'}}).state().state).toBe('unavailable');
});
