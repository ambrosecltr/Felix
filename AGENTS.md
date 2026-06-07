# Felix Agent Notes

## Release Publishing

Felix is distributed outside the Mac App Store with Developer ID signing, Apple notarization, and `electron-updater` metadata hosted on GitHub Releases.

Never commit or print Apple credentials. Keep these local or in protected CI secrets only:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `APPLE_API_KEY`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `APPLE_KEYCHAIN_PROFILE`

Manual release flow:

1. Confirm the latest GitHub Release/tag and choose the next semver version. Bump both `package.json` and `apps/desktop/package.json` to that version before packaging.
2. Confirm the local Developer ID Application identity and notarytool profile:

```bash
security find-identity -p codesigning -v
xcrun notarytool history --keychain-profile FelixNotary --team-id PFWC6XGUU8
```

3. Remove stale local release artifacts so old versions cannot be uploaded by mistake:

```bash
rm -rf apps/desktop/release
```

4. Run the normal quality gates:

```bash
bun run typecheck
bun run build
bun run test
```

5. Build the signed and app-notarized macOS artifacts:

```bash
APPLE_KEYCHAIN_PROFILE=FelixNotary APPLE_TEAM_ID=PFWC6XGUU8 bun run package:desktop
```

6. Validate the signed and stapled app bundle:

```bash
codesign -dvvv --entitlements :- apps/desktop/release/mac-arm64/Felix.app
codesign --verify --deep --strict --verbose=2 apps/desktop/release/mac-arm64/Felix.app
spctl --assess --verbose --type exec apps/desktop/release/mac-arm64/Felix.app
xcrun stapler validate apps/desktop/release/mac-arm64/Felix.app
```

7. Sign, notarize, and staple the final DMG as well. Electron Builder notarizes the app bundle before creating the DMG, but the DMG itself must be signed and receive its own ticket before public distribution:

```bash
codesign --sign "Developer ID Application: Ambrose Coulter (PFWC6XGUU8)" \
  --force \
  --timestamp \
  apps/desktop/release/Felix-<version>-arm64.dmg
xcrun notarytool submit apps/desktop/release/Felix-<version>-arm64.dmg \
  --keychain-profile FelixNotary \
  --team-id PFWC6XGUU8 \
  --wait
xcrun stapler staple apps/desktop/release/Felix-<version>-arm64.dmg
xcrun stapler validate apps/desktop/release/Felix-<version>-arm64.dmg
spctl --assess --verbose --type open --context context:primary-signature apps/desktop/release/Felix-<version>-arm64.dmg
```

8. After signing/stapling the DMG, regenerate the DMG blockmap and update the DMG `sha512`/`size` entry in `latest-mac.yml`. Signing and stapling change the DMG bytes, so do not upload the pre-staple DMG blockmap or stale `latest-mac.yml` DMG metadata.

```bash
APP_BUILDER="$(find node_modules/.bun -path '*/app-builder-bin/mac/app-builder_arm64' -type f | head -n 1)"
"$APP_BUILDER" blockmap \
  --input apps/desktop/release/Felix-<version>-arm64.dmg \
  --output apps/desktop/release/Felix-<version>-arm64.dmg.blockmap \
  --compression gzip
```

9. Verify final release metadata and DMG contents:

```bash
node -e 'const {createHash}=require("node:crypto"); const {readFileSync,statSync}=require("node:fs"); for (const n of ["Felix-<version>-arm64.zip","Felix-<version>-arm64.dmg"]) { const p=`apps/desktop/release/${n}`; console.log(n, statSync(p).size, createHash("sha512").update(readFileSync(p)).digest("base64")); }'
hdiutil verify apps/desktop/release/Felix-<version>-arm64.dmg
```

10. Create a GitHub Release for the matching tag, for example `v0.0.4`.
11. Upload every generated update artifact:

- `Felix-<version>-arm64.dmg`
- `Felix-<version>-arm64.dmg.blockmap`
- `Felix-<version>-arm64.zip`
- `Felix-<version>-arm64.zip.blockmap`
- `latest-mac.yml`

Before publishing, inspect `latest-mac.yml` and confirm it references the same version and ZIP artifact. The release must be published, not left as a draft. Stable Felix builds should use stable GitHub releases, not prereleases, unless the app version and updater channel strategy are intentionally changed.

Use `bun run package:desktop:unsigned` only for local packaging checks. Unsigned builds are not valid public releases and should not be uploaded for users.
