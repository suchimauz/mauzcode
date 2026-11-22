'use strict';
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const {insist, validVersion, compare, verifyManifest, identity} = require('./update-manifest.cjs');
const {verifyPlatform} = require('./update-platform.cjs');

// Node fetch has no Electron session or cookie jar. Never forward credentials across redirects.
async function readPublic(url, limit) {
  const signal = AbortSignal.timeout(30000);
  for (let n = 0; n < 5; n++) {
    const u = new URL(url);
    insist(u.protocol === 'https:' && !u.username && !u.password && !u.port && ['api.github.com','github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(u.hostname));
    const res = await fetch(u, {credentials:'omit', redirect:'manual', signal});
    if ([301,302,303,307,308].includes(res.status)) {
      await res.body?.cancel(); insist(res.headers.has('location')); url = new URL(res.headers.get('location'), u); continue;
    }
    if (!res.ok) { await res.body?.cancel(); throw new Error('Feed unavailable'); }
    let size = 0; const chunks = [];
    for await (const chunk of res.body) { size += chunk.length; insist(size <= limit); chunks.push(chunk); }
    return Buffer.concat(chunks);
  }
  throw new Error('Too many redirects');
}
async function discover(pin, key, installed, platform, arch, read) {
  const root = `https://github.com/${pin.repository}/releases/download/`;
  // Search release records (GitHub /latest omits prereleases). Do not trust release asset URLs or YAML.
  const candidates = new Set();
  for (let page=1; ; page++) {
    insist(page <= 10);
    const releases = JSON.parse(await read(`https://api.github.com/repos/${pin.repository}/releases?per_page=30&page=${page}`, 4*1024*1024));
    insist(Array.isArray(releases));
    for (const r of releases) {
      if (r.draft !== false || r.prerelease !== (pin.channel==='pilot') || typeof r.tag_name !== 'string' || !r.tag_name.startsWith('v')) continue;
      const version = r.tag_name.slice(1);
      try { validVersion(version,pin.channel); } catch { continue; }
      if (compare(version,installed)>0) candidates.add(version);
    }
    if (releases.length<30) break;
  }
  for (const version of [...candidates].sort((a,b)=>compare(b,a))) {
    const base = `${root}v${version}/`;
    const [bytes,sig] = await Promise.all([read(base+'desktop-manifest.json',16384),read(base+'desktop-manifest.sig',256)]);
    const manifest = verifyManifest(bytes,sig.toString('utf8'),key,pin.channel,version);
    const asset = manifest.assets.find(a=>a.platform===platform && a.arch===arch);
    if (asset) return {version,asset,url:new URL(base+asset.filename)};
  }
  return null;
}
function providerFor(release) {
  const {asset,url,version} = release;
  const info = Object.freeze({url:asset.filename,sha512:asset.sha512,size:asset.size});
  const data = Object.freeze({version,files:Object.freeze([info]),path:info.url,sha512:info.sha512,releaseDate:'1970-01-01T00:00:00.000Z'});
  return class VerifiedProvider {
    setRequestHeaders() {} // discard staging ID; all metadata is already authenticated
    getLatestVersion() { return Promise.resolve(data); }
    resolveFiles(input) { insist(input === data); return [{url:new URL(url),info}]; }
  };
}
function createUpdates({app, changed=()=>{}, beforeInstall=()=>{}}, deps={}) {
  let status={state:'idle'}, busy=false, installing=false, release, staged, updater, pin, key;
  const platform=deps.platform||process.platform, arch=deps.arch||process.arch;
  function set(state, message) { status={state,...(release?{version:release.version}:{}),...(message?{message}:{})}; changed({...status}); }
  try {
    insist(app.isPackaged); pin=deps.pin || JSON.parse(fs.readFileSync(path.join(__dirname,'update-pin.json'),'utf8'));
    insist(typeof pin.repository === 'string' && /^[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9][a-z0-9._-]{0,99}$/i.test(pin.repository));
    insist(['pilot','stable'].includes(pin.channel));
    key=crypto.createPublicKey(pin.publicKey); insist(key.asymmetricKeyType==='ed25519');
    insist((platform==='darwin' && ['arm64','x64'].includes(arch)) || (['win32','linux'].includes(platform)&& arch==='x64'));
    if(platform==='win32') insist(typeof pin.publisherName==='string' && pin.publisherName.trim());
    if(platform==='linux' && !deps.updater) { insist(process.env.APPIMAGE && !process.env.SNAP); fs.accessSync(process.env.APPIMAGE, fs.constants.W_OK); fs.accessSync(path.dirname(process.env.APPIMAGE),fs.constants.W_OK); }
    updater=deps.updater || require('electron-updater').autoUpdater;
    updater.requestHeaders=null; // Never inherit credentials from a previously configured updater.
    updater.autoDownload=false; updater.autoInstallOnAppQuit=false; updater.allowDowngrade=false;
    updater.allowPrerelease=pin.channel==='pilot'; updater.disableDifferentialDownload=true; updater.disableWebInstaller=true;
    updater.on('error',()=>{ installing=false; staged=null; set('error','Update failed.'); });
  } catch {status={state:'unavailable',message:'Updates are unavailable for this installation.'};}
  async function verifyStaged(file) {
    insist(path.basename(file) === release.asset.filename);
    const actual=await identity(file); insist(actual.sha512===release.asset.sha512 && actual.size===release.asset.size);
    await (deps.verifyPlatform || verifyPlatform)(file,platform,pin.publisherName);
  }
  async function action(cmd) {
    if(busy || installing || status.state==='unavailable') return {...status};
    busy=true;
    try {
      if(cmd==='check' && ['idle','available','current','error'].includes(status.state)) {
        staged=null; release=null; set('checking');
        release=await discover(pin,key,app.getVersion(),platform,arch,deps.read || readPublic);
        if(!release) set('current');
        else {
          updater.setFeedURL({provider:'custom',updateProvider:providerFor(release)});
          const result=await updater.checkForUpdates(); insist(result && result.isUpdateAvailable && result.updateInfo.version===release.version); set('available');
        }
      } else if(cmd==='download' && status.state==='available') {
        set('downloading'); const files=await updater.downloadUpdate();
        insist(files.length===1); await verifyStaged(files[0]); staged=files[0]; set('ready');
      } else if(cmd==='later' && status.state==='ready') set('deferred');
      else if(cmd==='restart' && ['deferred','ready'].includes(status.state)) {
        insist(staged); await verifyStaged(staged); installing=true; await beforeInstall(); updater.quitAndInstall(false,true);
      }
    } catch { installing=false; staged=null; set('error','Could not obtain or verify the update.'); }
    finally { busy=false; }
    return {...status};
  }
  return {state:()=>({...status}),action};
}
module.exports={createUpdates};
