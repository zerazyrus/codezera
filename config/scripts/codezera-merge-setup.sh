#!/bin/bash
# Prepares a clone for `git merge upstream/main`: Codezera-owned brand files always keep our side.
# Lives in .git/info (not .gitattributes, an Orca file) so the rules never conflict themselves.
set -euo pipefail
git config merge.ours.driver true
git config rerere.enabled true
attributes="$(git rev-parse --git-path info/attributes)"
mkdir -p "$(dirname "$attributes")"
cat >"$attributes" <<'EOF'
resources/icon.png merge=ours
resources/icon-dev.png merge=ours
resources/logo.svg merge=ours
resources/app-icons/* merge=ours
resources/build/icon.icns merge=ours
resources/build/icon.ico merge=ours
resources/build/icon.png merge=ours
resources/icon-source/icon.icon/** merge=ours
EOF
