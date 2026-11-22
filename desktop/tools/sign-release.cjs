'use strict';
// Offline signing step. Read the private key from a protected file outside the release directory.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {insist, identity, validate, validateAsset} = require('../update-manifest.cjs');
async function signRelease(version, channel, directory, inventory, keyFile) {
  const key = crypto.createPrivateKey(await fs.readFile(keyFile)); insist(key.asymmetricKeyType === 'ed25519');
  const assets = [];
  for (const {filename, platform, arch} of JSON.parse(await fs.readFile(inventory, 'utf8'))) {
    const asset = {filename, platform, arch}; validateAsset(asset);
    assets.push({...asset, ...await identity(path.join(directory, filename))});
  }
  const bytes = Buffer.from(JSON.stringify(validate({schema: 1, channel, version, assets}), null, 2) + '\n');
  const signature = crypto.sign(null, bytes, key).toString('base64');
  await fs.writeFile(path.join(directory, 'desktop-manifest.json'), bytes);
  await fs.writeFile(path.join(directory, 'desktop-manifest.sig'), signature + '\n');
}
if (require.main === module) signRelease(...process.argv.slice(2)).catch(() => { console.error('Signing failed: check release inventory and key.'); process.exitCode = 1; });
module.exports = {signRelease};
