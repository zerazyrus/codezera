# Codezera releases

Codezera ships from `zerazyrus/codezera` (branch `codezera`), merged daily from `stablyai/orca` `main`.

## Pipeline (`.github/workflows/codezera-release.yml`)

06:00 ICT daily, or **Actions → codezera-release → Run workflow** (`force` rebuilds even without changes).

1. Disables inherited Orca workflows (they target Orca's runners and secrets).
2. Merges `upstream/main` after `config/scripts/codezera-merge-setup.sh` (brand files keep ours, see below). A conflict opens an issue and stops; resolve locally and push.
3. Skips when `HEAD` equals the newest `v*` tag.
4. Builds mac (arm64 + x64 dmg/zip) and Windows (NSIS) into one draft, then publishes it as Latest after checking every asset.

Requires repo secret `CODEZERA_SYNC_TOKEN`: a fine-grained PAT on this repo with **Contents: read/write** and **Workflows: read/write** (upstream merges change `.github/workflows`, which `GITHUB_TOKEN` cannot push).

## Release notes

Generated from commit subjects by `node config/scripts/codezera-package.mjs notes`:

- **Codezera**: commits since the previous `v*` tag that are not in Orca. Write subjects in English only, user-readable (`feat(codezera): show stashes in Git Graph`).
- **Orca**: commits merged from upstream since the previous release, with PR links (collapsed list + compare link).
- To add context, edit the release on GitHub after it publishes. Later runs never rewrite old notes.

## Version

Orca release `a.b.c`, Codezera build `n` → `a.b.(c*100+n)`, e.g. Orca 1.4.245 → 1.4.24501, 1.4.24502… `a.b.c` is the newest stable Orca tag whose source commit is already merged (Orca tags detached release commits and rarely bumps `main`'s `package.json`, so that lags; it is only the fallback). Plain semver, so the stable updater orders builds across Orca releases. Computed by `node config/scripts/codezera-package.mjs version` (needs the `upstream` remote).

## Identity (kept out of Orca's files to avoid merge conflicts)

- `config/electron-builder.codezera.cjs`: appId `net.thezera.codezera`, product `Codezera`, userData `~/Library/Application Support/codezera`, artifact names, publish target. Builds never touch an installed Orca.
- `src/shared/codezera-identity.ts`: release repo + packaged app name. Vitest defines `CODEZERA_UPSTREAM_IDENTITY`, so Orca's own tests still assert Orca values.
- `ORCA_BUILD_SOURCE_COMMIT` pins skill installs to the merged Orca commit (fork commits don't exist upstream).

## Icons

Sources: `resources/icon-source/codezera/*.svg` (Z + terminal cursor from the zera mark). Outputs keep Orca's filenames so no code or builder config changes:

- `icon-source/icon.icon` (Assets/logo.svg = `glyph.svg`) → `bash resources/icon-source/generate.sh` → `build/icon.{icns,ico,png}`, `icon.png`.
- `rsvg-convert -w 256 icon-dev.svg -o resources/icon-dev.png`; `alt-gradient.svg` → `app-icons/orca-blue.png`, `alt-stripes.svg` → `app-icons/orca-watercolor.png` (`-w 1024`); `logo-mono.svg` → `resources/logo.svg` (white; UI inverts in light mode).
- macOS menu bar: `tray-template.svg` (black glyph, macOS tints it) → `rsvg-convert -h 13|26` then pad to 22×14 / 44×28 into `resources/tray/orca-menu-barTemplate{,@2x}.png`. Tray labels swap "Orca" for `PACKAGED_APP_NAME` after translation, so every locale is covered without editing Orca's keys.
- Upstream icon changes resolve to ours automatically via `codezera-merge-setup.sh` (`merge=ours` in `.git/info/attributes`). Run it once per local clone too.

## Keeping upstream merges conflict-free

A conflict only happens where Codezera and Orca edit the same lines of an Orca file. Rules:

- New behavior goes in Codezera-owned files (`src/**/codezera/`, `*codezera*`); Orca files only get a one-line hook (import + call/render). Never reformat, reorder or "clean up" Orca code.
- In a hook, prefer adding a new line or branch beside Orca's lines over editing them (e.g. an extra `: file.mode === 'codezera-panel' ? GitGraph` arm).
- UI strings: add keys under `codezera.*` in `en.json`; never edit Orca's keys. Brand names come from `src/shared/codezera-identity.ts`.
- CSS: append overrides next to the rule they extend; never edit Orca's declarations.
- Before an Orca file passes its `max-lines` cap, add `/* eslint-disable max-lines -- Why: … */` instead of splitting Orca's file.
- Hooks shared by every Codezera feature, so a new feature adds no new Orca lines: IPC `src/main/codezera/codezera-handlers.ts` (called from `src/main/startup/main-window-core-services.ts` right after `registerCoreHandlers(...)` as `registerCodezeraHandlers(store, {…agent env resolvers})`, not from `register-core-handlers.ts`, which sits at Orca's max-lines cap; the resolvers let Codezera run the Source Control AI agent, e.g. PMS report rewrite), preload `src/preload/api/codezera-bridge.ts`, Settings → Accounts `src/renderer/src/codezera/codezera-accounts-sections.tsx`. A new right-sidebar tab id needs one line in each of `ui-chrome-types.ts`, `client-ui-params.ts` (`STATIC_RIGHT_SIDEBAR_TABS`), `ui-selection-normalization.ts`, `right-sidebar-route.ts` and `right-sidebar-panel-content.tsx` (currently `sftp`).
- PMS is a task source without being an Orca `TaskProvider` (that union fans out to ~30 files): `IntegrationsPane.tsx` renders `PmsIntegrationCard`, `task-page/SourceBar.tsx` renders `PmsTaskSourceButton` after Orca's chips, `sidebar/SidebarTaskNavButton.tsx` renders `PmsSidebarShortcut` after Orca's shortcut icons, `status-bar/StatusBarSurface.tsx` renders `PmsStatusSegment` (today's hours + quick log/open/report popover) after the branch segment, `task-page/use-task-page-global-effects.ts` skips its leave-page Esc while `isCodezeraOverlayOpen()` (a `data-codezera-overlay` drawer is open), and `task-page/Frame.tsx` returns `useCodezeraTaskPage(model)` first, which swaps in the PMS view while that chip is on (`src/renderer/src/codezera/pms/`).
- Vietnamese UI (`vi`): the catalog `src/renderer/src/i18n/locales/vi.json` is Codezera-owned. Registering it adds one `vi` line to each Orca list: `shared/ui-language.ts` (const, union, native name, value set), `shared/ui-locale.ts` (`SUPPORTED_UI_LOCALES`), `renderer/src/i18n/i18n.ts` (import + url map), `main/i18n/main-i18n.ts` (loader) and `renderer/src/i18n/supported-languages.ts` (import + choice). On conflict keep Orca's list and re-append the `vi` entry. New Orca keys show in English until added to `vi.json`; `pnpm verify:localization-catalogs` lists them as missing and fails on `vi.json` keys Orca removed.
- Mobile `vi`: `mobile/app.json` (locales map + iOS/Android lists), `mobile/locales/vi.json` (iOS permission strings), `mobile/src/i18n/plural-rules-polyfill.ts`, `mobile/src/i18n/locale-catalog-imports.ts`, and the empty-for-now `mobile/src/i18n/locales/vi.json` (strings fall back to English). The extra catalog chunk needs `MOBILE_WEB_APP_BUNDLE_MAX_CATALOG_CHUNKS` in `config/scripts/build/mobile-web-app/verify-mobile-web-app-bundle.mjs` to stay one above Orca's value; on conflict take Orca's number and add 1.
- PMS surfaces always read Vietnamese: `src/renderer/src/codezera/pms/pms-i18n.ts` exports a `translate` pinned to `vi` (kept under that name so the catalog scanner still extracts `codezera.pms.*` keys); each PMS root component calls `usePmsCatalog()` so the `vi` catalog loads even when the app language is English. PMS files import `translate` from `./pms-i18n`, never `@/i18n/i18n`.
- PMS picklists use `pms-picker.tsx` (Popover + Command, accent-insensitive search) instead of Orca's `Select`; new PMS pickers should reuse it. The agent workflow appended to every PMS-started prompt lives in `pms-workflow.ts` (default distilled from the `/pms` skill, user override in localStorage `codezera.pms.agentWorkflow`, edited under Settings → Integrations → CloudGO PMS).
- Locally: `git config rerere.enabled true` (set by the setup script) replays a resolution you already made if the same conflict recurs.
- Resolving: take Orca's side, then re-apply Codezera's hook where Orca moved the code (see the upstream commit's diff), then `pnpm tc:web` before pushing.
- Union-type conflicts (editor `mode`, `EDITOR_VIEW_MODES`, `ModeIcon` arms, monaco setup steps): keep both sides — Orca's new members plus Codezera's `codezera-panel` lines. Orca's own Git Graph tab (`mode: 'git-graph'`, view-only) coexists with Codezera's Git Graph panel (`codezera-panel`, with checkout/merge/stash actions).
- Orca moves renderer modules often (e.g. `@/store/selectors` → `@/store/workspaces/selection/use-selected-worktree`); fix Codezera imports by finding the symbol's new home in the upstream commit that deleted the old file. Orca's new English keys also need `vi.json` entries or `verify:localization-catalogs` fails.

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
- Windows review installer: push to any `review/**` branch (`git push origin HEAD:review/<name>`). `codezera-review-win` builds `codezera-review-windows-setup.exe` as a 14-day run artifact; fetch it with `gh run download <run-id> -R zerazyrus/codezera`.
- Ckit update notice (`src/renderer/src/codezera/ckit/CkitToolUpdateCard.tsx`, mounted in `AppNotificationCards.tsx`): on launch and every 6 h, compares installed ckit with the latest `dante241/ckit_agent` release and runs `omp update --check`; "Update now" runs `ckit up` then `omp update`. "Later" hides that release until a newer one ships.
- Ckit team settings (`TEAM_OMP_SETTINGS` in `src/main/codezera/ckit/ckit-setup.ts`): applied to `~/.omp/agent/config.yml` on every launch, after "Update now" and on saving the gateway key, so a new release carries team config changes to existing installs. A key is set only when absent or still on the seeded value (`replaces`); hand edits stay. The same pass runs `ckit harness model advisor off` unless `~/.config/ckit/models.toml` already has top-level `advisor = false`.

## Download links (thezera.net/apps/codezera)

`https://github.com/zerazyrus/codezera/releases/latest/download/` + `codezera-macos-arm64.dmg` | `codezera-macos-x64.dmg` | `codezera-windows-setup.exe`
