# Codezera: bàn giao repo (đọc đầu tiên khi sang máy mới)

Codezera là bản fork của [Orca](https://github.com/stablyai/orca) (IDE Electron chạy agent AI trên worktree), dùng nội bộ CloudGO và phát hành ở `zerazyrus/codezera`. Fork thêm tính năng CloudGO (PMS, Ckit/gateway AI), công cụ quen thuộc từ VS Code (Git Graph, SFTP, snippet), giao diện tiếng Việt và thương hiệu riêng. Mỗi lần chạy workflow release, bot `codezera-bot` merge Orca `main` vào trước khi build.

- Quy tắc phát hành, version, identity, icon và **cách giữ merge upstream không conflict**: [`CODEZERA.md`](CODEZERA.md). File đó là nguồn chuẩn; tài liệu này không lặp lại.
- Quy tắc commit cho agent: `.omp/RULES.md` (của Codezera) và `AGENTS.md` (của Orca, không sửa).

## 1. Repo và nhánh

|                |                                                                  |
| -------------- | ---------------------------------------------------------------- |
| Thư mục        | `~/Projects/Labzera/codezera`                                    |
| Nhánh làm việc | `codezera` (không có `main` của mình)                            |
| `origin`       | `https://github.com/zerazyrus/codezera.git`                      |
| `upstream`     | `https://github.com/stablyai/orca.git` (chỉ fetch)               |
| Tác giả commit | `The Zera <zerazyrus@gmail.com>`                                 |
| Commit         | Tiếng Anh, dạng `feat(codezera): …`; tiêu đề thành release notes |

## 2. Dựng lại trên máy mới

```sh
# Công cụ
brew install node@24 gh git      # Node 24 là bắt buộc (engines.node)
corepack enable                  # pnpm theo packageManager trong package.json
gh auth login                    # tài khoản zerazyrus

# Danh tính git chỉ cho repo zerazyrus (giữ email công ty cho repo khác)
cat > ~/.gitconfig-zerazyrus <<'EOF'
[user]
	name = The Zera
	email = zerazyrus@gmail.com
EOF
git config --global includeIf."hasconfig:remote.*.url:https://github.com/zerazyrus/**".path ~/.gitconfig-zerazyrus
git config --global includeIf."hasconfig:remote.*.url:git@github.com:zerazyrus/**".path ~/.gitconfig-zerazyrus

# Clone (partial clone cho nhẹ; repo Orca rất lớn)
git clone --filter=blob:none -b codezera https://github.com/zerazyrus/codezera.git ~/Projects/Labzera/codezera
cd ~/Projects/Labzera/codezera
git remote add upstream https://github.com/stablyai/orca.git
git config remote.upstream.promisor true
git config remote.upstream.partialclonefilter blob:none
git fetch --no-tags upstream main
bash config/scripts/codezera-merge-setup.sh   # merge=ours cho file thương hiệu + bật rerere

# Dependencies
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
pnpm install
pnpm -C mobile install --frozen-lockfile        # cần cho build đóng gói
git config user.email                           # phải ra zerazyrus@gmail.com
```

Không đặt `user.*` trong `.git/config` của repo; danh tính đến từ `includeIf`.

## 3. Lệnh hằng ngày

| Việc                                | Lệnh                                                                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck                           | `pnpm tc` (`tc:node`, `tc:web`)                                                                                                                                                       |
| Test phần Codezera                  | `pnpm test src/main/codezera src/renderer/src/codezera src/cli/codezera src/shared/codezera --maxWorkers=2` (luôn qua `pnpm test`, vì config định nghĩa `CODEZERA_UPSTREAM_IDENTITY`) |
| Lint/format file đã sửa             | `pnpm exec oxlint <files>`, `pnpm exec oxfmt --check <files>`                                                                                                                         |
| Chạy bản dev (không chiếm màn hình) | `ORCA_BACKGROUND_LAUNCH=1 pnpm dev`; log in `Remote debugging on http://127.0.0.1:9481`                                                                                               |
| Dev với profile riêng               | thêm `ORCA_DEV_USER_DATA_PATH=/tmp/cz-profile`                                                                                                                                        |
| Đồng bộ Orca                        | `config/scripts/codezera-sync.sh status\|merge\|renames\|imports\|paths\|predict\|stale` (mục 6)                                                                                      |
| Build mac cục bộ                    | `CSC_IDENTITY_AUTO_DISCOVERY=false node config/scripts/codezera-package.mjs mac --arch arm64`                                                                                         |
| Bản Review (cài song song)          | thêm `--review`; Windows: `git push origin HEAD:review/<tên>` rồi tải artifact `codezera-review-win`                                                                                  |

Kiểm tra giao diện: dùng CDP (Playwright `chromium.connectOverCDP('http://127.0.0.1:9481')`), chụp ảnh renderer ẩn; không show/focus cửa sổ. Gọi IPC trực tiếp bằng `window.api.codezera.<feature>.<method>()`.

## 4. Tính năng Codezera và chỗ để code

Code Codezera nằm trong `src/main/codezera/`, `src/renderer/src/codezera/`, `src/shared/codezera/`, `src/cli/codezera/`. Orca chỉ được thêm một dòng hook (danh sách hook ở `CODEZERA.md`).

| Tính năng                   | Mô tả                                                                                                                                                                                                                                    | Code                                                                                                                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Thương hiệu, phát hành      | Tên/icon Codezera, appId riêng, tự cập nhật trên mac chưa ký, workflow release thủ công, release notes tự sinh                                                                                                                           | `config/electron-builder.codezera.cjs`, `src/shared/codezera-identity.ts`, `src/main/updater/*unsigned-mac*`, `.github/workflows/codezera-release.yml`, `config/scripts/codezera-package.mjs` |
| Lệnh `codezera`             | CLI riêng để không đụng `orca` của Orca (mac `/usr/local/bin/codezera`, Windows PATH)                                                                                                                                                    | `afterPack` trong `electron-builder.codezera.cjs`, `native/windows-cli-launcher`                                                                                                              |
| Nhập từ Orca                | Onboarding/Settings chép project và settings từ Orca                                                                                                                                                                                     | `*/codezera/orca-import/`                                                                                                                                                                     |
| Git Graph                   | Tab giống extension Git Graph của VS Code: lọc branch, diff commit, checkout/merge/stash, tìm commit, Repository Settings                                                                                                                | `*/codezera/git-graph/`; dữ liệu `userData/codezera/git-graph-repos.json`                                                                                                                     |
| Nhánh trên thanh trạng thái | Đổi nhánh, nút Sync (pull rồi push)                                                                                                                                                                                                      | `src/renderer/src/codezera/branch-status/`                                                                                                                                                    |
| Source Control              | Hiện tới 10.000 thay đổi như VS Code                                                                                                                                                                                                     | hook trong source control                                                                                                                                                                     |
| SFTP                        | Giống VS Code SFTP: đọc `.vscode/sftp.json`, cây server, upload/download, diff với remote, upload khi lưu, terminal SSH, upload root qua `sudo su`                                                                                       | `*/codezera/sftp/`; dữ liệu `userData/codezera/sftp-connections.json`                                                                                                                         |
| Snippets                    | Snippet người dùng (nhập một lần từ VS Code) trong Monaco, cả trong diff view                                                                                                                                                            | `*/codezera/snippets/`; dữ liệu `userData/codezera/snippets/`                                                                                                                                 |
| Thụt lề                     | Tabs/spaces, size, tự nhận từ nội dung                                                                                                                                                                                                   | `src/renderer/src/codezera/indentation/`                                                                                                                                                      |
| CloudGO PMS                 | Nguồn task PMS, Ticket Dashboard (tổng quan, chi tiết, báo cáo), log giờ trên thanh trạng thái, báo cáo ngày/tuần gửi quản lý (AI viết lại), agent làm ticket qua `codezera pms …` và skill bundled `orca-pms`                           | `*/codezera/pms/`, `src/cli/codezera/`, `skill-guides/orca-pms.md`; tài khoản `userData/codezera/pms-account.bin` (mã hoá safeStorage, **không mang sang máy khác được, đăng nhập lại**)      |
| Ckit (CloudGO AI gateway)   | Settings → Accounts: lệnh cài ckit + omp một bước (mac/Windows), nhập key gateway, quota 4h/ngày trên thanh trạng thái, báo và cập nhật ckit/omp, áp settings omp của team mỗi lần mở app, dọn provider 9router giả do `ckit setup` gieo | `src/main/codezera/ckit/`, `src/renderer/src/codezera/ckit/`, `src/renderer/src/codezera/status-bar/`                                                                                         |
| Tiếng Việt                  | Catalog `vi` cho desktop và mobile; màn PMS luôn tiếng Việt                                                                                                                                                                              | `src/renderer/src/i18n/locales/vi.json`, `mobile/src/i18n/locales/vi.json`, `pms-i18n.ts`                                                                                                     |
| Showcase                    | Ảnh và mô tả cho trang giới thiệu thezera.net                                                                                                                                                                                            | `showcase/` (schema ở `docs/platform.md` của repo thezera)                                                                                                                                    |

## 5. Ckit: những gì máy dev cần biết

- Cài ckit/omp trên máy mới: mở Codezera → Settings → Accounts → Ckit → bước 1 (bấm Enter trong terminal nhúng), bước 2 nhập key gateway `sk-…`.
- Lệnh bước 1 trên mac kiểm tra Command Line Tools trước (vì `git` của máy mới chỉ là vỏ); trên Windows cài thêm Git, uv, Bun, `codebase-memory-mcp` và chạy `ckit setup --full --no-profile` để lỗi winget với `gh` không làm dừng setup.
- File đụng tới: `~/.omp/agent/models.yml` (provider `cloudgo-cc`, `https://ai-gateway.cloudgo.vn/llm/claude/v1`), `~/.omp/agent/config.yml` (`modelRoles`, `TEAM_OMP_SETTINGS`), `~/.config/ckit/models.toml` (`advisor = false`). Mỗi lần ghi có bản `.codezera-bak`.
- Lỗi đã biết nằm ở ckit (repo `dante241/ckit_agent`, không phải Codezera): `install_core_pkg` coi winget "đã cài" là lỗi; `ensure_codebase_memory_mcp` chưa có nhánh Windows; `ckit setup` gieo `9router-cc/cx` với placeholder.

## 6. Merge Orca và phát hành

Workflow `codezera-release` tự merge `upstream/main` khi bấm chạy, nhưng chỉ build, không chạy `tc`, nên trước khi phát hành hãy merge và kiểm tra cục bộ:

1. `config/scripts/codezera-sync.sh status`: số commit chênh, file bẩn, version kế tiếp.
2. Có file bẩn của phiên khác thì merge trong worktree: `git worktree add /tmp/cz-merge origin/codezera -b merge-upstream-$(date +%m%d)`.
3. `config/scripts/codezera-sync.sh merge`. Lỗi `upload-pack: not our ref` / hàng nghìn file ` D`: `git restore .` rồi chạy lại (blob thiếu sẽ được tải ở lần sau).
4. Giải conflict theo `CODEZERA.md`: lấy bên Orca, gắn lại hook Codezera. `config/scripts/codezera-sync.sh renames` cho bảng đường dẫn cũ→mới.
5. File sinh tự động: `git checkout --theirs`, rồi `pnpm install --frozen-lockfile`, `pnpm generate:bundled-skill-guides`, `pnpm generate:skill-bundle-manifest`, `pnpm generate:rpc-params-catalog`, `pnpm sync:localization-protected-copy`.
6. Cổng: `codezera-sync.sh imports` (rỗng), `codezera-sync.sh paths` (ok), `pnpm tc`, test Codezera, smoke UI nếu đụng giao diện.
7. `git add -u && git commit --no-edit`, `git fetch origin codezera`, `git push origin HEAD:codezera` (không force).
8. `codezera-sync.sh predict` phải báo merge sạch; rồi vào GitHub **Actions → codezera-release → Run workflow** (token `gh` cục bộ bị 403 khi gọi workflow, phải bấm trên web).

Đã gặp khi merge:

- Orca dời file mà không conflict, làm vỡ import của Codezera (`imports` bắt được) hoặc vỡ đường dẫn script đóng gói (`paths` bắt được).
- Đổi tên API: `resolveTextGenerationParams` → `resolveCommitMessageSettings`, `barColor` → `usageBarClass`, `prepareDirectWorkItemSetup` tách thành prepare + `confirmDirectWorkItemSetup`.
- Thanh trạng thái: Orca tách usage sang `StatusBarUsageArea.tsx`; Codezera chỉ hook `<CodezeraStatusBarSegments />` trong `StatusBarSurface.tsx` và `useCkitTracksUsage()` trong `StatusBarUsageArea.tsx`.
- Pre-commit `max-lines` khi hook Codezera đẩy file Orca quá giới hạn: dời phần thân sang file Codezera (ví dụ `use-codezera-snippet-editor-path.ts`), Orca chỉ còn import + một dòng gọi.
- `pnpm check:changed` có các lỗi Codezera đã biết, không chặn release: chuỗi chưa dịch của ckit/PMS, `child_process` trong `codezera-unsigned-mac-update.ts`, ratchet `setInterval`/sync fs, `max-lines` disable ở `EditorFileTab.tsx`, `memo-translate` ở `git-graph-commit-row.tsx`, test `mobile-web-app` chạy bằng bun.

Secret repo: `CODEZERA_SYNC_TOKEN` (PAT fine-grained, Contents + Workflows read/write) đã đặt sẵn trên GitHub, không cần làm lại khi đổi máy.

## 7. Dữ liệu chỉ có trên máy (sao lưu trước khi reset)

| Đường dẫn                                                          | Là gì                                                                                                               | Ghi chú                                                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `~/Library/Application Support/codezera/`                          | Profile app đã cài: project, settings, `codezera/` (SFTP, snippets, Git Graph)                                      | Chép sang máy mới để giữ cấu hình; `pms-account.bin` sẽ không giải mã được, đăng nhập PMS lại  |
| `~/Library/Application Support/orca-dev/`                          | Profile của bản dev                                                                                                 | Tuỳ chọn                                                                                       |
| `~/.omp/agent/managed-skills/codezera-*`                           | Skill agent cho repo này (`codezera-orca-sync-release`, `codezera-orca-fork-maintenance`, `codezera-dev-cdp-smoke`) | Nội dung đã gom vào tài liệu này và `config/scripts/codezera-sync.sh`                          |
| `~/.omp/agent/{config.yml,models.yml,mcp.json}`, `~/.config/ckit/` | Cấu hình omp/ckit                                                                                                   | `models.yml` chứa key gateway: **không commit**, chỉ chép tay hoặc nhập lại key trong Codezera |
| `~/.gitconfig-zerazyrus`                                           | Danh tính commit                                                                                                    | Tạo lại theo mục 2                                                                             |
| `.git/rr-cache` trong repo                                         | Lời giải conflict đã ghi (rerere)                                                                                   | Mất cũng không sao                                                                             |
