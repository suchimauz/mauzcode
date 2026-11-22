const path = require('node:path');
const {files, loadPin} = require('./package-policy.cjs');
const pin = loadPin(path.join(__dirname, '../update-pin.json'));
module.exports = {
  appId: 'dev.mauzcodecode.desktop', productName: 'MauzCode', directories: {output: 'dist'},
  asar: true, files: [...files, '!**/node_modules/**/{test,tests,__tests__,__fixtures__,.github}/**', '!**/node_modules/**/*.{ts,map,pfx,p12,key,pem}', '!**/node_modules/**/{.env*,.npmrc}'],
  afterPack: context => {
    const resources = context.electronPlatformName === 'darwin' ? path.join(context.appOutDir, 'MauzCode.app/Contents/Resources') : path.join(context.appOutDir, 'resources');
    require('./check-asar.cjs').inspect(path.join(resources,'app.asar'), path.join(__dirname,'../update-pin.json'));
  },
  // Stub used by electron-updater to locate packaged configuration; no public upload provider.
  publish: {provider: 'generic', url: `https://github.com/${pin.repository}/releases/download/`, channel: pin.channel},
  win: {artifactName:'MauzCode-${version}-win-${arch}.${ext}', target: [{target:'nsis',arch:['x64']}], icon:'assets/icon.ico', signtoolOptions:{publisherName:pin.publisherName}, forceCodeSigning:true},
  nsis: {oneClick:false, allowToChangeInstallationDirectory:true},
  mac: {artifactName:'MauzCode-${version}-mac-${arch}.${ext}', target:[{target:'dmg',arch:['x64','arm64']},{target:'zip',arch:['x64','arm64']}], icon:'assets/icon.icns', category:'public.app-category.productivity', forceCodeSigning:true,
    hardenedRuntime:true, notarize:true, entitlements:'tools/entitlements.mac.plist', entitlementsInherit:'tools/entitlements.mac.plist', extendInfo:{NSMicrophoneUsageDescription:'Use your microphone for dictation when you allow it for the connected server.'}},
  dmg: {sign:true}, linux:{artifactName:'MauzCode-${version}-linux-${arch}.${ext}', target:[{target:'AppImage',arch:['x64']}],icon:'assets/icon.png',category:'Network'}
};
