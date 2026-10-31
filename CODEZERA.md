# Codezera releases

Codezera ships from `zerazyrus/codezera` (branch `codezera`), merged daily from `stablyai/orca` `main`.

## Pipeline (`.github/workflows/codezera-release.yml`)

06:00 ICT daily, or **Actions → codezera-release → Run workflow** (`force` rebuilds even without changes).

1. Disables inherited Orca workflows (they target Orca's runners and secrets).
2. Merges `upstream/main`. A conflict opens an issue and stops; resolve locally (`git fetch upstream main && git merge upstream/main`) and push.
3. Skips when `HEAD` equals the newest `v*` tag.
4. Builds mac (arm64 + x64 dmg/zip) and Windows (NSIS) into one draft, then publishes it as Latest after checking every asset.

Requires repo secret `CODEZERA_SYNC_TOKEN`: a fine-grained PAT on this repo with **Contents: read/write** and **Workflows: read/write** (upstream merges change `.github/workflows`, which `GITHUB_TOKEN` cannot push).

## Release notes

Generated from commit subjects by `node config/scripts/codezera-package.mjs notes`:

- **Codezera**: commits since the previous `v*` tag that are not in Orca, so write user-readable subjects (`feat(codezera): Git Graph hiện stash`).
- **Orca**: commits merged from upstream since the previous release, with PR links (collapsed list + compare link).
- To add context, edit the release on GitHub after it publishes. Later runs never rewrite old notes.

## Version

Orca `a.b.c`, Codezera build `n` → `a.b.(c*100+n)`, e.g. Orca 1.4.214 → 1.4.21401, 1.4.21402… Plain semver, so the stable updater orders builds across Orca bumps. Computed from origin tags by `node config/scripts/codezera-package.mjs version`.

## Identity (kept out of Orca's files to avoid merge conflicts)

- `config/electron-builder.codezera.cjs`: appId `net.thezera.codezera`, product `Codezera`, userData `~/Library/Application Support/codezera`, artifact names, publish target. Builds never touch an installed Orca.
- `src/shared/codezera-identity.ts`: release repo + packaged app name. Vitest defines `CODEZERA_UPSTREAM_IDENTITY`, so Orca's own tests still assert Orca values.
- `ORCA_BUILD_SOURCE_COMMIT` pins skill installs to the merged Orca commit (fork commits don't exist upstream).

## Icons

Sources: `resources/icon-source/codezera/*.svg` (Z + terminal cursor from the zera mark). Outputs keep Orca's filenames so no code or builder config changes:

- `icon-source/icon.icon` (Assets/logo.svg = `glyph.svg`) → `bash resources/icon-source/generate.sh` → `build/icon.{icns,ico,png}`, `icon.png`.
- `rsvg-convert -w 256 icon-dev.svg -o resources/icon-dev.png`; `alt-gradient.svg` → `app-icons/orca-blue.png`, `alt-stripes.svg` → `app-icons/orca-watercolor.png` (`-w 1024`); `logo-mono.svg` → `resources/logo.svg` (white; UI inverts in light mode).
- Upstream icon changes conflict on these files: keep ours (`git checkout --ours <file>`).

## Unsigned macOS

- First install: `xattr -cr /Applications/Codezera.app`.
- Squirrel.Mac rejects ad-hoc signatures, so `src/main/updater/updater-unsigned-mac.ts` handles download/install on unsigned builds. It downloads the zip from the release (sha512 from `latest-mac.yml`), and a detached script swaps the bundle after quit, restoring the old one on failure. Signed builds use Orca's updater unchanged.
- Windows: unsigned NSIS; `verifyUpdateCodeSignature: false`, so electron-updater accepts unsigned updates.

## Local build

```sh
CSC_IDENTITY_AUTO_DISCOVERY=false node config/scripts/codezera-package.mjs mac --arch arm64 [--version X] [--skip-build]
```

Output: `dist/`. Needs `pnpm install` and `pnpm -C mobile install --frozen-lockfile`.

**Review builds** (`--review`) produce `Codezera Review.app` for testing unreleased changes beside the installed release:

- Own bundle id `net.thezera.codezera.review` and userData `~/Library/Application Support/codezera-review`, so projects, settings and the single-instance lock never touch the release app.
- Version `99.<yyyymmdd>.<hhmm>`: above every release, so the updater never replaces it. Never published.

## Download links (thezera.net/apps/codezera)

`https://github.com/zerazyrus/codezera/releases/latest/download/` + `codezera-macos-arm64.dmg` | `codezera-macos-x64.dmg` | `codezera-windows-setup.exe`
