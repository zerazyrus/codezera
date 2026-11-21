#!/usr/bin/env bash
# Codezera ← Orca upstream sync helper. Run from the codezera repo root (or a worktree of it).
#   status   read-only: fork vs origin/upstream counts, dirty files
#   merge    ff to origin/codezera, then promisor-safe merge of upstream/main
#   renames  old→new path map for files upstream moved since the merge base (/tmp/cz-renames.tsv)
#   imports  Codezera-owned files importing a path that no longer exists (fast pre-tc scan)
#   paths    every repo path referenced by Codezera packaging/release files must exist
#   predict  dry-run merge of the latest upstream/main into HEAD (what the CI merge step will hit)
#   stale    untracked files left behind when upstream moved gitignored generated outputs
set -euo pipefail
if [ -d /opt/homebrew/opt/node@24/bin ]; then export PATH=/opt/homebrew/opt/node@24/bin:$PATH; fi
cmd=${1:-status}
git rev-parse --show-toplevel >/dev/null
cd "$(git rev-parse --show-toplevel)"

fetch() { git fetch -q origin codezera && git fetch -q --no-tags upstream main; }

case $cmd in
status)
  fetch
  echo "branch: $(git branch --show-current)  email: $(git config user.email)"
  echo "behind origin/codezera: $(git rev-list --count HEAD..origin/codezera)  ahead: $(git rev-list --count origin/codezera..HEAD)"
  echo "new upstream commits:   $(git rev-list --count HEAD..upstream/main)"
  echo "dirty (tracked):        $(git status --short --untracked-files=no | wc -l | tr -d ' ')"
  echo "latest tag: $(git tag --sort=-creatordate -l 'v*' | head -1)  next version: $(node config/scripts/codezera-package.mjs version 2>/dev/null || echo '?')"
  ;;
merge)
  [ -z "$(git status --short --untracked-files=no)" ] || { echo "dirty tracked files: merge in a worktree (CODEZERA-HANDOFF.md)"; exit 1; }
  fetch
  git merge -q --ff-only origin/codezera
  bash config/scripts/codezera-merge-setup.sh
  # Partial clone: without this git asks origin for upstream-only blobs → "upload-pack: not our ref".
  if git -c remote.origin.promisor=false merge --no-edit upstream/main; then
    echo "MERGED clean"
  elif [ -f "$(git rev-parse --git-path MERGE_HEAD)" ]; then
    echo "CONFLICTS:"; git diff --name-only --diff-filter=U
  else
    echo "merge aborted before starting (missing blobs?). Run: git restore . && $0 merge"; exit 1
  fi
  ;;
renames)
  # Mid-merge HEAD is still the pre-merge commit; compare against what is being merged.
  head=upstream/main; [ -f "$(git rev-parse --git-path MERGE_HEAD)" ] && head=MERGE_HEAD
  base=$(git merge-base HEAD "$head")
  git -c diff.renameLimit=0 diff -M --name-status --diff-filter=R "$base" "$head" | awk '{print $2"\t"$3}' >/tmp/cz-renames.tsv
  echo "$(wc -l </tmp/cz-renames.tsv | tr -d ' ') renames → /tmp/cz-renames.tsv (grep the old path)"
  ;;
imports)
  # Codezera-owned files plus Orca files hooking Codezera (upstream moves those without a conflict).
  # Relative imports only; '@/…' renderer aliases resolve to src/renderer/src.
  { git ls-files 'src/**' | grep -i codezera; git grep -il codezera -- 'src/**'; } | grep -E '\.(ts|tsx)$' \
    | grep -vE '\.generated\.ts$|bundled-skill-guides\.ts$' | sort -u | while read -r f; do
    dir=$(dirname "$f")
    { grep -oE "from '[^']+'|import\('[^']+'\)" "$f" || true; } | sed -E "s/^from '|^import\('|'\)?$//g" | while read -r spec; do
      case $spec in
        ./*|../*) p="$dir/$spec" ;;
        @/*) p="src/renderer/src/${spec#@/}" ;;
        *) continue ;;
      esac
      p=${p%%\?*}; p=${p%.js}; ok=
      for c in "$p" "$p.ts" "$p.tsx" "$p.d.ts" "$p/index.ts" "$p/index.tsx"; do [ -f "$c" ] && { ok=1; break; }; done
      [ -n "$ok" ] || echo "$f → $spec"
    done
  done | sort -u
  ;;
paths)
  miss=0
  for f in config/scripts/codezera-package.mjs .github/workflows/codezera-release.yml \
           config/scripts/codezera-merge-setup.sh config/electron-builder.codezera.cjs; do
    [ -f "$f" ] || continue
    for p in $(grep -oE "(config|scripts|resources|src|build|native)/[A-Za-z0-9_./-]+\.(mjs|cjs|js|ts|sh|json|yml|plist|png|icns|ico|svg)\b" "$f" | sort -u); do
      [ -e "$p" ] || { echo "MISSING in $f: $p"; miss=1; }
    done
  done
  [ $miss = 0 ] && echo "packaging paths ok"
  ;;
predict)
  fetch
  echo "upstream commits not in HEAD: $(git rev-list --count HEAD..upstream/main)"
  if git -c remote.origin.promisor=false merge-tree --write-tree --name-only HEAD upstream/main >/tmp/cz-mt.txt 2>&1; then
    echo "CI merge will be clean (tc can still break on moved imports: merge + tc to be sure)"
  else
    echo "CI merge WILL CONFLICT:"; sed -n '2,/^$/p' /tmp/cz-mt.txt
  fi
  ;;
stale)
  git status --short --untracked-files=all | awk '/^\?\?/ && /\.generated\./{print $2}'
  ;;
*) sed -n 2,10p "$0"; exit 1 ;;
esac
