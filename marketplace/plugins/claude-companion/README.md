# Claude Companion

A Codex plugin that lets Codex delegate tasks to Claude Code background
sessions, with structured review and follow-up flows.

This is the cc-plugin-codex marketplace distribution copy. The development
source of truth lives at `packages/plugin-codex/` in the cc-plugin-codex
repository.

## Requirements

- Codex CLI with plugin marketplace support (tested on `codex-cli 0.136.0`).
- Claude Code installed and authenticated locally (`claude auth login`).
- Node.js available on `PATH` (Node 20 or later).

## Install

From inside a clone of the cc-plugin-codex repository, add the local
marketplace and install the plugin:

```bash
codex plugin marketplace add "<repo-root>/marketplace"
codex plugin add "claude-companion@cc-plugin-codex-local"
```

Replace `<repo-root>` with the absolute path to your cc-plugin-codex
checkout. For example, if you cloned to `~/code/cc-plugin-codex`, run:

```bash
codex plugin marketplace add "$HOME/code/cc-plugin-codex/marketplace"
codex plugin add "claude-companion@cc-plugin-codex-local"
```

## Verify

After install, list registered plugins and run the setup probe:

```bash
codex plugin list
```

Then open Codex inside any repository and run:

```
$claude-setup
```

`$claude-setup` checks Claude Code authentication, Codex version,
Node.js, and the background-session capabilities. Expected aggregate
status:

- `ok` — all dependencies ready
- `warn` — usable with caveats (e.g., daemon status unavailable)
- `fail` — something blocks delegation; follow the setup output

If `$claude-setup` reports `ok` or `warn`, the install is complete.

## Skills

After install, the plugin makes 8 skills available inside the Codex
TUI. Type the `$<name>` form at the Codex chat prompt.

- `$claude-setup` — probes the local environment (Claude Code auth,
  Codex version, Node.js, `node-pty` availability, background-session
  support). Returns `ok`, `warn`, or `fail` aggregate.
- `$claude-delegate` — starts a Claude Code background session with
  the provided prompt and returns a job id you can use with the other
  skills.
- `$claude-status` — reports the live state (working, needs-input,
  idle, completed, failed, stopped) of a job by id or unique prefix.
- `$claude-result` — prints the final message + tool-use summary for
  a completed job.
- `$claude-stop` — stops a running background session by id or
  unique prefix; also supports bulk forms like
  `--all-awaiting-followup`.
- `$claude-followup` — sends a follow-up instruction into an existing
  job using PTY attach.
- `$claude-review` — runs a same-session review of a Claude Code job.
- `$claude-adversarial-review` — runs a fresh-session adversarial
  review of a Claude Code job.

Each skill prints a usage message when invoked without the arguments
it needs (e.g., a job id). That usage message is normal behaviour —
it confirms the skill is registered and reachable. The full plugin
docs (including dispatcher subcommands and exit codes) are at
[`packages/plugin-codex/README.md`](../../../packages/plugin-codex/README.md)
in the cc-plugin-codex repository.

## Uninstall

Remove the installed plugin first, then remove the local marketplace
registration:

```bash
codex plugin remove "claude-companion@cc-plugin-codex-local"
codex plugin marketplace remove "cc-plugin-codex-local"
```

The first command removes the installed plugin from Codex. The second
removes the local marketplace registration. Running `codex plugin remove`
alone keeps the marketplace entry so you can re-install without re-adding
the marketplace.

Verify the uninstall:

```bash
codex plugin list
codex plugin marketplace list
```

After uninstall, `claude-companion@cc-plugin-codex-local` should no longer
appear in `codex plugin list`, and `cc-plugin-codex-local` should no longer
appear in `codex plugin marketplace list`.

What uninstall does **not** do:

- It does not delete this Git checkout. Your local cc-plugin-codex clone
  remains on disk; only the Codex plugin and marketplace registrations
  are removed.
- It does not delete existing Claude Companion job records or transcripts
  under your configured companion home. Those are owned by your local
  Claude Code installation, not by the Codex plugin registry, and persist
  after uninstall.

To remove the Git checkout itself, delete the directory manually. To clear
Claude Companion job records, refer to your Claude Code session-management
documentation; uninstalling this plugin does not touch them.

After uninstall, the empty cache breadcrumb directory
`<CODEX_HOME>/plugins/cache/cc-plugin-codex-local/` may remain on
disk. This is normal Codex 0.136.0 behaviour — `codex plugin remove`
empties the per-version cache contents but does not prune the parent
directories. The empty breadcrumbs have no user-visible effect and
do not block reinstall.

## Smoke test

Before release, run the smoke checklist in
[`documentation/RELEASING.md`](../../../documentation/RELEASING.md).
It verifies the local marketplace install and all 8 skill names
(`$claude-setup`, `$claude-delegate`, `$claude-status`, `$claude-result`,
`$claude-stop`, `$claude-followup`, `$claude-review`,
`$claude-adversarial-review`) under an isolated `CODEX_HOME`.

## Troubleshooting

### `codex plugin list` fails with "marketplace root does not contain a supported manifest"

This usually means a previously-added marketplace points at a path that
no longer exists (e.g., a deleted temp directory from an earlier smoke
test). Identify the stale entry from the error message and remove it:

```bash
codex plugin marketplace remove "<stale-marketplace-name>"
```

Then re-add the cc-plugin-codex marketplace with the install commands
above.

### `$claude-setup` is not recognized

Confirm the plugin install succeeded:

```bash
codex plugin list
```

If `claude-companion@cc-plugin-codex-local` does not appear, repeat the
install commands. If `codex plugin list` itself fails, address the
stale-entry issue first.

### `$claude-setup` reports `warn` or `fail`

Read the detailed probe output. Common causes:

- Claude Code not authenticated — run `claude auth login`.
- Claude CLI not on `PATH` — verify `which claude` works.
- Codex too old — upgrade Codex to a version with plugin marketplace
  support (`codex-cli 0.135.0` or later; 0.136.0 is the tested version).

### Skill invocation fails with `ERR_MODULE_NOT_FOUND`

If the dispatcher reports
`Cannot find package '@cc-plugin-codex/runtime'` or similar when a
skill is invoked, the packaged runtime dependencies are missing from
the installed plugin cache. This is a packaging defect, not a
configuration problem on your machine.

End-user remediation: re-install the plugin from a fresh clone of
the cc-plugin-codex repo. If the defect persists on a fresh clone,
report it via the cc-plugin-codex issue tracker — the maintainer
will need to re-run `node tools/package-marketplace.mjs --write` and
re-publish the marketplace tree (see
[`documentation/RELEASING.md`](../../../documentation/RELEASING.md)).

## Upgrade

Codex 0.136.0 does not expose an in-place `codex plugin upgrade` or
`codex plugin update` command. The upgrade procedure is to remove the
installed plugin and re-add it from the same marketplace pointer.

(Codex does expose `codex plugin marketplace upgrade`, but that
subcommand only refreshes Git marketplace snapshots and is not used
for the local cc-plugin-codex marketplace.)

After pulling new commits in the cc-plugin-codex repo, if the
marketplace path has not changed, run:

```bash
codex plugin remove "claude-companion@cc-plugin-codex-local"
codex plugin add "claude-companion@cc-plugin-codex-local"
```

If you moved or re-cloned the repository, refresh the marketplace
pointer first:

```bash
codex plugin remove "claude-companion@cc-plugin-codex-local"
codex plugin marketplace remove "cc-plugin-codex-local"
codex plugin marketplace add "<repo-root>/marketplace"
codex plugin add "claude-companion@cc-plugin-codex-local"
```

Verify the upgrade:

```bash
codex plugin list
```

You should see `claude-companion@cc-plugin-codex-local` with version
`0.2.0` (the current plugin version), reported as `installed, enabled`.
