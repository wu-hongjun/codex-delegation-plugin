# Release checklist

> Drafted incrementally by Plan 0006. T11 completes the full release
> checklist; T6 contributes the install section.

## Install procedure (Plan 0006 T6)

End users install the cc-plugin-codex plugin via the committed
`marketplace/` layout at the repo root:

```bash
codex plugin marketplace add "<repo-root>/marketplace"
codex plugin add "claude-companion@cc-plugin-codex-local"
codex plugin list
```

Verify with `$claude-setup` inside a Codex session. See
[`marketplace/plugins/claude-companion/README.md`](../marketplace/plugins/claude-companion/README.md)
for the user-facing install + troubleshooting guide.

## Uninstall procedure (Plan 0006 T8)

```bash
codex plugin remove "claude-companion@cc-plugin-codex-local"
codex plugin marketplace remove "cc-plugin-codex-local"
```

The first command removes the installed plugin from Codex. The second
removes the local marketplace registration.

### Uninstall verification

Use an isolated `CODEX_HOME` (`CODEX_HOME=$(mktemp -d)` + a `trap` to
remove it on exit) and run install → list → uninstall → list again.
Confirm absence after uninstall:

```bash
# Install
codex plugin marketplace add "<repo-root>/marketplace"
codex plugin add "claude-companion@cc-plugin-codex-local"

# Pre-state (should list claude-companion@cc-plugin-codex-local + the marketplace)
codex plugin list
codex plugin marketplace list

# Uninstall
codex plugin remove "claude-companion@cc-plugin-codex-local"
codex plugin marketplace remove "cc-plugin-codex-local"

# Post-state (should NOT list either)
codex plugin list
codex plugin marketplace list
```

The post-uninstall `codex plugin list` and `codex plugin marketplace list`
output must not contain `claude-companion@cc-plugin-codex-local` or
`cc-plugin-codex-local`, respectively. See
[`marketplace/plugins/claude-companion/README.md`](../marketplace/plugins/claude-companion/README.md)
for the user-facing uninstall section, which also documents what
uninstall does not touch (Git checkout, companion-home job records).

## Upgrade procedure (Plan 0006 T7)

Codex 0.136.0 does not expose an in-place `codex plugin upgrade` or
`codex plugin update` command. The upgrade procedure is to remove the
installed plugin and re-add it from the same marketplace pointer.

Same-path upgrade (after pulling new commits in cc-plugin-codex):

```bash
codex plugin remove "claude-companion@cc-plugin-codex-local"
codex plugin add "claude-companion@cc-plugin-codex-local"
codex plugin list
```

Marketplace-path-refresh upgrade (after moving or re-cloning the repo):

```bash
codex plugin remove "claude-companion@cc-plugin-codex-local"
codex plugin marketplace remove "cc-plugin-codex-local"
codex plugin marketplace add "<repo-root>/marketplace"
codex plugin add "claude-companion@cc-plugin-codex-local"
codex plugin list
```

After either flow, `codex plugin list` should report
`claude-companion@cc-plugin-codex-local` with the current version
(`0.2.0` as of Plan 0006 T3), `installed, enabled`. See
[`marketplace/plugins/claude-companion/README.md`](../marketplace/plugins/claude-companion/README.md)
for the user-facing upgrade section.

## Packaging verification (Plan 0006 T4 + T5)

Before tagging a release, run:

```bash
node tools/package-marketplace.mjs --check
```

The script enforces:

- Source ↔ marketplace byte-identity for all derived files
  (`marketplace/MANIFEST.md` allowlist).
- No excluded categories appear under
  `marketplace/plugins/claude-companion/` (`marketplace/EXCLUSIONS.md`
  defense-in-depth).
- The marketplace root manifest at
  `marketplace/.agents/plugins/marketplace.json` parses and has the
  expected `name`.

## Smoke Test (Plan 0006 T9)

Run this from a clean or isolated Codex profile (the automated
preflight handles the isolation for you).

### Automated preflight

```bash
node tools/package-marketplace.mjs --check
node tools/smoke-marketplace.mjs --marketplace-root "<repo-root>/marketplace"
```

The helper script verifies:

- `codex --version` is reachable on `PATH`.
- `codex plugin marketplace add` succeeds against the local marketplace
  root.
- `codex plugin add "claude-companion@cc-plugin-codex-local"` succeeds.
- `codex plugin list` reports the plugin as `installed, enabled` at
  version `0.2.0`.
- Cleanup (`codex plugin remove` + `codex plugin marketplace remove`)
  succeeds.

It runs inside an isolated `CODEX_HOME` (created with `mkdtemp` under
the OS tempdir) and removes that directory on exit unless invoked with
`--keep-home`. It never writes the real `~/.codex` and is not invoked
by CI; CI relies on the static checks in
`packages/plugin-codex/test/marketplace-smoke.test.mjs` plus the rest
of the unit-test matrix. The helper exits 0 only when every automated
check passes.

### Manual skill discovery

Codex 0.136.0 does not expose a documented non-interactive
skill-invocation interface, so the eight-skill discovery check must be
run manually inside the Codex TUI. With the smoke helper's isolated
`CODEX_HOME` preserved (`--keep-home`), open Codex and verify each
skill is recognized:

- `$claude-setup`
- `$claude-delegate`
- `$claude-status`
- `$claude-result`
- `$claude-stop`
- `$claude-followup`
- `$claude-review`
- `$claude-adversarial-review`

Pass criteria:

- `$claude-setup` is the gate skill: it must return an `ok` or `warn`
  aggregate status, not an unknown-skill error.
- The other seven skills must not return `unknown skill` or
  `unrecognized skill` when invoked or shown in Codex skill discovery.
- A skill that requires a job-id may stop at its expected
  usage-or-error message. That still counts as recognized for smoke
  purposes; the smoke test only proves discovery, not full behavior.

Record the outcome of each skill in the release artifact under
`documentation/plan/0006-...-marketplace-packaging-distribution/artifacts/`.

## Other release-checklist steps

To be expanded by Plan 0006 T10 (version bump procedure) and T11
(final checklist assembly).
