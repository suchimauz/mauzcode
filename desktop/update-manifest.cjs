'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const {pipeline} = require('node:stream/promises');

function insist(condition) { if (!condition) throw new Error('Invalid release verification data'); }
function versionParts(version) {
  const n = '(0|[1-9][0-9]{0,8})';
  const m = typeof version === 'string' && version.match(new RegExp(`^${n}\\.${n}\\.${n}(?:-pilot\\.${n})?$`));
  insist(m); return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? Infinity : Number(m[4])];
}
function compare(a, b) {
  const x = versionParts(a), y = versionParts(b);
  for (let i = 0; i < x.length; ++i) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}
function validVersion(version, channel) {
  versionParts(version);
  insist(channel === (version.includes('-pilot.') ? 'pilot' : 'stable'));
}
function validateAsset({filename, platform, arch}) {
  const ext = {linux: '.AppImage', darwin: '.zip', win32: '.exe'}[platform];
  insist(typeof ext === 'string' && (arch === 'x64' || (platform === 'darwin' && arch === 'arm64')));
  insist(typeof filename === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(filename) && filename.endsWith(ext));
  if (platform === 'darwin') insist(filename.includes('arm64') === (arch === 'arm64'));
}
function validate(manifest) {
  insist(manifest.schema === 1); validVersion(manifest.version, manifest.channel);
  insist(Array.isArray(manifest.assets) && manifest.assets.length > 0 && manifest.assets.length <= 4);
  const names = new Set(), targets = new Set();
  for (const a of manifest.assets) {
    validateAsset(a);
    insist(Number.isSafeInteger(a.size) && a.size > 0 && a.size <= 2 ** 31 && typeof a.sha512 === 'string' && /^[A-Za-z0-9+/]{85}[AQgw]==$/.test(a.sha512));
    const target = `${a.platform}/${a.arch}`;
    insist(!names.has(a.filename.toLowerCase()) && !targets.has(target)); names.add(a.filename.toLowerCase()); targets.add(target);
  }
  return manifest;
}
function verifyManifest(bytes, signature, key, channel, version) {
  const raw = Buffer.from(signature.trim(), 'base64');
  insist(raw.length === 64 && raw.toString('base64') === signature.trim());
  insist(key.asymmetricKeyType === 'ed25519' && crypto.verify(null, bytes, key, raw));
  const m = validate(JSON.parse(bytes.toString('utf8'))); insist(m.channel === channel && m.version === version); return m;
}
async function identity(file) {
  const stat = await fs.promises.lstat(file); insist(stat.isFile());
  const hash = crypto.createHash('sha512'); await pipeline(fs.createReadStream(file), hash);
  return {size: stat.size, sha512: hash.digest('base64')};
}
module.exports = {insist, validVersion, compare, validateAsset, validate, verifyManifest, identity};
