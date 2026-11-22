'use strict';
// Independent pre-publication gate: verify exact bytes on disk using the separately reviewed build pin.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {verifyManifest, identity, insist} = require('../update-manifest.cjs');
async function verifyRelease(version, directory, pinFile) {
  const {channel, publicKey} = JSON.parse(await fs.readFile(pinFile, 'utf8'));
  const manifest = verifyManifest(await fs.readFile(path.join(directory, 'desktop-manifest.json')), await fs.readFile(path.join(directory, 'desktop-manifest.sig'), 'utf8'), crypto.createPublicKey(publicKey), channel, version);
  for (const asset of manifest.assets) {
    const {size, sha512} = await identity(path.join(directory, asset.filename));
    insist(size === asset.size && sha512 === asset.sha512);
  }
}
if (require.main === module) verifyRelease(...process.argv.slice(2)).catch(() => { console.error('Release verification failed.'); process.exitCode = 1; });
module.exports = {verifyRelease};
