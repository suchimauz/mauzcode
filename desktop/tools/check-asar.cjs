// Run against the app.asar extracted from EVERY final installer/archive, not just dist/*-unpacked.
const path = require('node:path');
const {files, validatePin, loadPin} = require('./package-policy.cjs');
function checkEntries(entries) {
  const seen = new Set(entries.map(x=>x.replaceAll('\\','/').replace(/^\//,'')));
  for (const f of files) if (!seen.has(f)) throw Error(`Missing packaged file: ${f}`);
  for (const f of seen) {
    if (!f || f === 'assets' || files.includes(f) || f === 'node_modules') continue;
    if (!f.startsWith('node_modules/') || /(?:^|\/)(?:test|tests|__tests__|__fixtures__)(?:\/|$)|\.(?:map|ts)$|(?:^|\/)(?:\.env(?:\.|$)|\.git(?:hub)?(?:\/|$)|\.npmrc$|[^/]*\.(?:p12|pfx|pem|key)$)/i.test(f)) throw Error(`Unexpected packaged file: ${f}`);
  }
}
function inspect(file, reviewedPin) {
  const asar = require('@electron/asar'); // locked transitive dependency of electron-builder
  checkEntries(asar.listPackage(file));
  const pin = validatePin(JSON.parse(asar.extractFile(file,'update-pin.json')));
  const expected = loadPin(reviewedPin);
  for (const k of Object.keys(expected)) if (expected[k] !== pin[k]) throw Error('Embedded pin differs from reviewed pin');
  if (!asar.listPackage(file).some(f=>f.replaceAll('\\','/').endsWith('/node_modules/electron-updater/package.json'))) throw Error('Missing updater runtime');
}
if (require.main === module) inspect(path.resolve(process.argv[2]), path.resolve(process.argv[3]));
module.exports = {checkEntries, inspect};
