// A staging directory is deliberately NOT dist/: logs, unpacked trees, builder YAML and blockmaps are private.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const notes = 'Public pilot prerelease. Platform verification and stable distribution are separate gates.\n';
function expected(version) {
  if (!/^\d+\.\d+\.\d+-pilot\.\d+$/.test(version)) throw Error('Expected pilot prerelease version');
  return ['win-x64.exe','mac-x64.dmg','mac-arm64.dmg','mac-x64.zip','mac-arm64.zip','linux-x64.AppImage'].map(x=>`MauzCode-${version}-${x}`).concat('desktop-manifest.json','desktop-manifest.sig','NOTES.txt');
}
function checkListing(version, names, publicNotes) {
  const list = expected(version);
  if (names.length !== list.length || !list.every(n=>names.includes(n))) throw Error('Incomplete or unexpected public inventory');
  if (publicNotes !== notes) throw Error('Only reviewed public notes allowed');
  return list;
}
async function verifyUpdates(dir, version, reviewedPin) {
  const {loadPin} = require('./package-policy.cjs');
  const {verifyManifest} = require('../update-manifest.cjs');
  const pin = loadPin(reviewedPin);
  const bytes = fs.readFileSync(path.join(dir,'desktop-manifest.json'));
  const sig = fs.readFileSync(path.join(dir,'desktop-manifest.sig'),'utf8');
  if (bytes.length > 16384 || !/^[A-Za-z0-9+/]{86}==\n?$/.test(sig)) throw Error('Unexpected manifest or signature format');
  const m = verifyManifest(bytes,sig,crypto.createPublicKey(pin.publicKey),pin.channel,version);
  if (Object.keys(m).sort().join() !== 'assets,channel,schema,version' || m.assets.length !== 4) throw Error('Unexpected manifest fields or incomplete target set');
  for (const asset of m.assets) {
    if (Object.keys(asset).sort().join() !== 'arch,filename,platform,sha512,size') throw Error('Unreviewed asset metadata');
    const os = {win32:'win',darwin:'mac',linux:'linux'}[asset.platform];
    const ext = {win32:'exe',darwin:'zip',linux:'AppImage'}[asset.platform];
    if (asset.filename !== `MauzCode-${version}-${os}-${asset.arch}.${ext}`) throw Error('Target/name mismatch');
  }
  await require('./verify-release.cjs').verifyRelease(version, dir, reviewedPin);
}
async function inventory(dir, version, reviewedPin) {
  const entries = fs.readdirSync(dir,{withFileTypes:true});
  if (!entries.every(e=>e.isFile())) throw Error('Only regular files may be staged');
  const declared = checkListing(version, entries.map(e=>e.name), fs.readFileSync(path.join(dir,'NOTES.txt'),'utf8'));
  await verifyUpdates(dir, version, reviewedPin);
  const rows = [];
  for (const name of declared) {
    const file = path.join(dir,name), bytes = fs.statSync(file).size;
    if (!bytes) throw Error('Empty release asset');
    const h = crypto.createHash('sha256');
    for await (const block of fs.createReadStream(file)) h.update(block);
    rows.push({name,bytes,sha256:h.digest('hex')});
  }
  return rows;
}
module.exports = {expected, notes, checkListing, inventory};
if (require.main === module) inventory(process.argv[2], process.argv[3], process.argv[4]).then(rows=>console.log(JSON.stringify(rows,null,2))).catch(e=>{console.error(e.message);process.exitCode=1});
