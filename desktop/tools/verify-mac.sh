#!/bin/bash
# Use a dedicated macOS build host; notarization credentials belong to its Keychain.
set -euo pipefail
: "${NOTARY_PROFILE:?Provide the approved notarytool Keychain profile name}"
version=$(node -p 'require("./package.json").version')
for arch in x64 arm64; do
  dmg="dist/MauzCode-${version}-mac-${arch}.dmg"
  zip="dist/MauzCode-${version}-mac-${arch}.zip"
  appdir=dist/mac; expected=x86_64
  if [[ $arch == arm64 ]]; then appdir=dist/mac-arm64; expected=arm64; fi
  app="$appdir/MauzCode.app"
  lipo "$app/Contents/MacOS/MauzCode" -verify_arch "$expected"
  codesign --verify --deep --strict "$app"
  codesign -dv --verbose=4 "$app" 2>&1 | grep '^Authority=Developer ID Application:'
  xcrun stapler validate "$app"
  spctl --assess --type execute --verbose "$app"
  codesign --verify --strict "$dmg"
  xcrun notarytool submit "$dmg" --keychain-profile "$NOTARY_PROFILE" --wait
  xcrun stapler staple "$dmg"; xcrun stapler validate "$dmg"
  spctl --assess --type open --context context:primary-signature "$dmg"
  unzip -tq "$zip"
done
