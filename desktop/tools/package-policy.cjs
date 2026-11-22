const fs = require('node:fs');
const crypto = require('node:crypto');

// Reviewed first-party files only. New runtime entry points require a matching review here.
const files = ['main.cjs', 'preload.cjs', 'security.cjs', 'navigation.cjs', 'lifecycle.cjs', 'connection.cjs', 'profile.cjs', 'shell-menu.cjs', 'window-chrome.cjs', 'window-bridge.cjs', 'context-menu.cjs', 'notifications.cjs', 'remote-preload.cjs', 'native-access.cjs', 'updates.cjs', 'update-platform.cjs', 'update-manifest.cjs', 'renderer.js', 'index.html', 'styles.css', 'assets/tray.png', 'assets/trayTemplate.png', 'assets/trayTemplate@2x.png', 'assets/icon.png', 'update-pin.json', 'package.json'];
function validatePin(pin) {
  if (!pin || Object.keys(pin).sort().join() !== 'channel,publicKey,publisherName,repository' ||
      !/^[a-z\d](?:[a-z\d-]{0,38})\/[a-z\d][a-z\d._-]{0,99}$/i.test(pin.repository) ||
      /^suchimauz\/mauzcode(?:\.git)?$/i.test(pin.repository) || /\.git$/i.test(pin.repository) ||
      pin.channel !== 'pilot' || typeof pin.publisherName !== 'string' || !/^[\p{L}\p{N}][\p{L}\p{N} .,&'()-]{0,119}$/u.test(pin.publisherName) ||
      typeof pin.publicKey !== 'string' || !/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+-----END PUBLIC KEY-----\s*$/.test(pin.publicKey) || crypto.createPublicKey(pin.publicKey).asymmetricKeyType !== 'ed25519') throw Error('Invalid pilot pin; reviewed release-only repository, pilot channel, signer CN and public Ed25519 SPKI required');
  return pin;
}
function loadPin(path) {
  if (!fs.lstatSync(path).isFile()) throw Error('Pin must be a regular file');
  return validatePin(JSON.parse(fs.readFileSync(path, 'utf8')));
}
module.exports = { files, validatePin, loadPin };
