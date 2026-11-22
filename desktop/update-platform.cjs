'use strict';
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const run = require('node:util').promisify(require('node:child_process').execFile);
const {insist} = require('./update-manifest.cjs');

async function verifyPlatform(file, platform, publisherName) {
  if (platform === 'linux') return; // The signed manifest is the AppImage trust anchor.
  if (platform === 'win32') {
    // Fixed PowerShell command, no interpolation of the filename or signer into code.
    const ps = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const script = "$ErrorActionPreference='Stop'; $s=Get-AuthenticodeSignature -LiteralPath $env:UPDATE_FILE; if ($s.Status -ne 'Valid' -or $s.SignerCertificate.GetNameInfo('SimpleName',$false) -cne $env:UPDATE_PUBLISHER) { exit 1 }";
    insist(publisherName); await run(ps, ['-NoProfile','-NonInteractive','-Command',script], {env:{...process.env, UPDATE_FILE:file, UPDATE_PUBLISHER:publisherName}, timeout:90000, windowsHide:true}); return;
  }
  insist(platform === 'darwin');
  // Do not start Squirrel before consent: it may apply its staged update on ordinary quit.
  // Enforce the running app's signing requirement against the authenticated ZIP first.
  const current = path.resolve(path.dirname(process.execPath), '../..');
  const opts = {encoding:'utf8', timeout:180000, maxBuffer:131072};
  const {stderr,stdout} = await run('/usr/bin/codesign', ['-d','-r-',current], opts);
  const requirement = (stderr+'\n'+stdout).match(/^designated => (.+)$/m)?.[1];
  insist(requirement && requirement.includes('anchor apple generic') && requirement.includes('certificate leaf[subject.OU]'));
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'mauzcode-verify-'));
  try {
    await run('/usr/bin/ditto', ['-x','-k', file,temp], opts);
    const apps = (await fs.readdir(temp,{withFileTypes:true})).filter(e=>e.name.endsWith('.app'));
    insist(apps.length===1 && apps[0].isDirectory());
    const bundle = path.join(temp, apps[0].name);
    await run('/usr/bin/codesign',['--verify','--deep','--strict','-R',requirement,bundle], opts);
    await run('/usr/sbin/spctl',['--assess','--type','execute',bundle], opts);
  } finally { await fs.rm(temp,{recursive:true,force:true}); }
}
module.exports = {verifyPlatform};
