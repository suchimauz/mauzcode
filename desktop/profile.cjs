'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { serverURL } = require('./security.cjs');

// Do not change: the original desktop builds keyed persistent Chromium sessions this way.
const partitionFor = origin => 'persist:mauzcode-' + createHash('sha256').update(origin).digest('hex');
function openProfile(directory) {
  function read(file) {
    try { return JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  // A tiny synchronous commit avoids yielding between the final candidate/generation
  // check, the atomic replacement and promotion. No credentials leave Chromium.
  function write(file, value) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const target = path.join(directory, file), temporary = `${target}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
      fs.renameSync(temporary, target);
    } finally { try { fs.unlinkSync(temporary); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
  }
  let prefs;
  try { prefs = read('native-preferences.json') || {}; } catch { prefs = {}; }
  return {
    saved() { const config = read('server.json'); return config ? serverURL(config.url) : ''; },
    save(url) { write('server.json', { url: serverURL(url) }); },
    get(origin, key) { return prefs[origin]?.[key] === true; },
    set(origin, key, value) {
      if (new URL(serverURL(origin)).origin !== origin || !['microphone', 'notifications'].includes(key) || typeof value !== 'boolean') throw Error('Invalid native preference');
      const next = { ...prefs, [origin]: { ...prefs[origin], [key]: value } };
      write('native-preferences.json', next); prefs = next;
    },
    /** Theme ('light'|'dark') last reported by the server page of this origin, or '' when unknown. Not a permission. */
    theme(origin) { const value = prefs[origin]?.theme; return value === 'light' || value === 'dark' ? value : ''; },
    /** Remember the server-selected theme for this origin; returns false when unchanged. */
    setTheme(origin, value) {
      if (new URL(serverURL(origin)).origin !== origin || !['light', 'dark'].includes(value)) throw Error('Invalid theme');
      if (prefs[origin]?.theme === value) return false;
      const next = { ...prefs, [origin]: { ...prefs[origin], theme: value } };
      write('native-preferences.json', next); prefs = next; return true;
    }
  };
}
module.exports = { partitionFor, openProfile };
