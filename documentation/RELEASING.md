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

## Uninstall procedure

```bash
codex plugin remove "claude-companion@cc-plugin-codex-local"
codex plugin marketplace remove "cc-plugin-codex-local"
```

## Upgrade procedure

Pending Plan 0006 T7. Codex 0.136.0 does not provide a
`codex plugin upgrade` command; the upgrade path is
`codex plugin remove` + `codex plugin add` against the updated
marketplace tree.

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

## Other release-checklist steps

To be expanded by Plan 0006 T8 (uninstall verification), T9 (smoke
test), T10 (version bump procedure), and T11 (final checklist
assembly).
