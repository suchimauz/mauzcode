import {expect, test} from 'bun:test';
import {generateKeyPairSync} from 'node:crypto';
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const {files, validatePin} = require('./tools/package-policy.cjs');
const {expected, checkListing, notes} = require('./tools/inventory.cjs');
const {checkEntries} = require('./tools/check-asar.cjs');
const v = '1.0.0-pilot.1';
test('pinned builder accepts the real pilot config and all packaged sources exist', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pilot-builder-'));
  try {
    mkdirSync(join(root, 'tools'));
    for (const f of ['builder.cjs', 'package-policy.cjs']) copyFileSync(join(__dirname, 'tools', f), join(root, 'tools', f));
    const {publicKey} = generateKeyPairSync('ed25519');
    writeFileSync(join(root, 'update-pin.json'), JSON.stringify({repository:'fixture/release-only',channel:'pilot',publisherName:'Fixture',publicKey:publicKey.export({type:'spki',format:'pem'})}));
    const config = require(join(root, 'tools/builder.cjs'));
    await require('app-builder-lib/out/util/config/config.js').validateConfiguration(config, {isEnabled:false});
    expect(config.win.target).toEqual([{target:'nsis',arch:['x64']}]);
    expect(config.mac.target).toEqual(['dmg','zip'].map(target=>({target,arch:['x64','arm64']})));
    expect(config.linux.target).toEqual([{target:'AppImage',arch:['x64']}]);
    expect(config.publish).toMatchObject({channel:'pilot',url:'https://github.com/fixture/release-only/releases/download/'});
    for (const f of files) expect(existsSync(join(f==='update-pin.json'?root:__dirname,f))).toBe(true);
  } finally {rmSync(root,{recursive:true,force:true});}
});
test('public staging dry run requires all six artifacts, signed sidecars and reviewed notes only', () => {
  const entries = expected(v); expect(checkListing(v, entries, notes)).toHaveLength(9);
  for (const bad of [entries.slice(1), [...entries,'builder-effective-config.yaml'], [...entries,'source.zip']]) expect(()=>checkListing(v,bad,notes)).toThrow();
  expect(()=>checkListing(v,entries,'Private host: internal.example')).toThrow(); expect(()=>expected('1.0.0')).toThrow();
});
test('package entries must be present and reviewed; extras or secret files fail', () => {
  checkEntries(files); for (const bad of [[...files,'tests.cjs'],files.slice(1),[...files,'node_modules/pkg/.npmrc']]) expect(()=>checkEntries(bad)).toThrow();
});
test('pin is public only, separate from source and limited to pilot', () => {
  const {publicKey,privateKey} = generateKeyPairSync('ed25519');
  const pin = {repository:'fixture/release-only',channel:'pilot',publisherName:'Fixture',publicKey:publicKey.export({type:'spki',format:'pem'})};
  expect(validatePin(pin)).toBe(pin);
  for (const bad of [{repository:'suchimauz/mauzcode'}, {channel:'stable'}, {token:'forbidden'}, {publicKey:privateKey.export({type:'pkcs8',format:'pem'})}]) expect(()=>validatePin({...pin,...bad})).toThrow();
});
