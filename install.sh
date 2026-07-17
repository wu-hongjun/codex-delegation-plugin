#!/usr/bin/env bash
#
# codex-delegation-plugin bootstrap installer.
#
# This is a small wrapper around the documented Codex marketplace commands:
#
#   codex plugin marketplace add https://github.com/wu-hongjun/codex-delegation-plugin
#   codex plugin add "delegate@codex-delegation-plugin"
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/wu-hongjun/codex-delegation-plugin/main/install.sh | bash
#   ./install.sh

set -euo pipefail

REPO_URL="https://github.com/wu-hongjun/codex-delegation-plugin"
MARKETPLACE_NAME="codex-delegation-plugin"
PLUGIN_REF="delegate@codex-delegation-plugin"

say() { printf '%s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

command -v codex >/dev/null 2>&1 ||
  die "the Codex CLI ('codex') is not on PATH. Install Codex with plugin marketplace support, then re-run."

command -v claude >/dev/null 2>&1 ||
  warn "the Claude Code CLI ('claude') was not found on PATH. Install and authenticate it before delegating: claude auth login"

command -v node >/dev/null 2>&1 ||
  warn "Node.js was not found on PATH. The plugin requires Node.js 20 or later."

say "==> Adding the codex-delegation-plugin Git marketplace"
say "    codex plugin marketplace add ${REPO_URL}"
if ! codex plugin marketplace add "${REPO_URL}"; then
  warn "codex plugin marketplace add returned non-zero. If ${MARKETPLACE_NAME} is already registered, continuing is usually safe."
fi

say "==> Installing the Codex Delegation plugin"
say "    codex plugin add \"${PLUGIN_REF}\""
codex plugin add "${PLUGIN_REF}"

say "==> Installed plugins"
codex plugin list || true

cat <<EOF

Done. Open Codex inside any repository and run:

    \$claude-setup

To uninstall later:

    codex plugin remove "${PLUGIN_REF}"
    codex plugin marketplace remove "${MARKETPLACE_NAME}"
EOF
