# Plan 0024 — Heavy Test Lane D: install / docs / cache / skills polish

**Date**: 2026-06-15
**Agent**: docs-cache verification (lane D)
**Scope**: Installed-plugin cache + repo docs verification. Read-only. No remote
`curl` install executed; no commits.
**Cache under test**: `/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.5`
**Source under test**: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`

---

## Verdict

**PASS with one genuine docs friction (F1) and two low observations (F2, F3).**

Every required check passed. The installed cache is byte-for-byte in sync with the
committed marketplace source, the new Plan 0024 flags are documented in the right
skills and are all backed by the dispatcher allowlist, the install docs carry a
one-command path plus explicit fallback, and the jobId vs Claude shortId/sessionId
distinction is consistent. The only real friction is stale "Claude Companion"
branding in the shipped plugin README (F1).

---

## Checklist results

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | `codex plugin list` shows `cc@cc-plugin-codex-local 0.3.5` | ✅ PASS | Marketplace `cc-plugin-codex-local` → `cc@cc-plugin-codex-local  installed, enabled  0.3.5  …/marketplace/plugins/cc` |
| 2 | `install.sh` executable + readable | ✅ PASS | Repo root `-rwxr-xr-x  install.sh` (1753 bytes) |
| 3 | README one-command install + explicit fallback | ✅ PASS | `README.md:38-50` |
| 4 | Marketplace README one-command install + explicit fallback | ✅ PASS | `marketplace/plugins/cc/README.md:17-30` |
| 5 | Cache skills mention new flags where appropriate | ✅ PASS | See "New-flag coverage" below |
| 6 | Docs distinguish plugin jobId vs Claude shortId/sessionId | ✅ PASS | `claude attach <shortId>/<sessionId>` everywhere; plugin skills take jobId |
| 7 | Cache in sync with committed source | ✅ PASS | `diff` clean for cc.mjs, all skills, README, plugin.json |
| 8 | `.gitignore` free of stale `claude-companion` paths | ✅ PASS | grep returns no matches |

---

## Detail / evidence

### 1. `codex plugin list` — PASS
The local marketplace block reports exactly the expected line:

```
Marketplace `cc-plugin-codex-local`
PLUGIN                    STATUS              VERSION  PATH
cc@cc-plugin-codex-local  installed, enabled  0.3.5    /Users/hongjunwu/Repositories/Git/cc-plugin-codex/marketplace/plugins/cc
```

Cache manifest `…/0.3.5/.codex-plugin/plugin.json` agrees: `"name": "cc"`,
`"version": "0.3.5"`.

### 2. `install.sh` — PASS
`/Users/hongjunwu/Repositories/Git/cc-plugin-codex/install.sh` is `-rwxr-xr-x`
(executable + world-readable). It is a thin bootstrap around the documented
marketplace commands, with a preflight that hard-fails on missing `codex` and
warns on missing `claude` / `node`. It targets the **remote** public
marketplace (`REPO_URL=…/wu-hongjun/cc-plugin-codex`, `PLUGIN_REF="cc@cc-plugin-codex"`),
which is correct for the curl-based end-user path.

> Note (expected, not a defect): `install.sh` is **not** present inside the plugin
> cache. That is by design — it is a repo-root bootstrap fetched over
> `raw.githubusercontent.com`, not part of the shipped plugin payload.

### 3 & 4. One-command install + explicit fallback — PASS
Both READMEs lead with the bootstrap one-liner and then give the underlying
marketplace commands as the explicit fallback:

- `README.md:40-42` — `curl -fsSL https://raw.githubusercontent.com/wu-hongjun/cc-plugin-codex/main/install.sh | bash`
- `README.md:44-50` — "Or run the underlying Codex marketplace commands directly:" (`marketplace add` / `plugin add` / `plugin list`)
- `marketplace/plugins/cc/README.md:20-22` — same curl one-liner
- `marketplace/plugins/cc/README.md:24-30` — same explicit fallback

Both also separate the GitHub install (`cc@cc-plugin-codex`) from the local
contributor checkout (`cc@cc-plugin-codex-local`) with dedicated upgrade/uninstall
blocks. Good.

### 5. New-flag coverage in cache skills — PASS
Plan 0024 added two flag families:

- **Review gates (T3):** `--blocking`, `--fail-on <gate>`.
- **Permission / startup parity (T1):** `--permission-mode`,
  `--dangerously-skip-permissions`, `--allow-dangerously-skip-permissions`, plus
  fresh-session passthrough flags (`--agent`, `--agents`, `--allowedTools`/
  `--allowed-tools`, `--disallowedTools`/`--disallowed-tools`, `--tools`,
  `--settings`, `--setting-sources`, `--strict-mcp-config`,
  `--append-system-prompt`, `--system-prompt`, `--plugin-dir`, `--add-dir`,
  `--mcp-config`, safe/bare/ide/chrome toggles).

Placement is correct and consistent:

- `--blocking` / `--fail-on` appear **only** in the two review skills —
  `claude-review` (`SKILL.md:22`) and `claude-adversarial-review`. Correct: these
  are review-subcommand-only flags.
- Permission + passthrough flags appear in all **seven** fresh-session launch
  skills: `claude-delegate`, `claude-fork`, `claude-batch`, `claude-goal`,
  `claude-deep-research`, `claude-workflow`, `claude-adversarial-review`. Each
  lists the full set under "Forward only these flags when the user explicitly
  requests them" (e.g. `claude-delegate/SKILL.md:23-28`,
  `claude-fork/SKILL.md:24-30`).
- The two non-launch skills correctly document these as inapplicable rather than
  omitting them: `claude-followup/SKILL.md:30-34` (ignored startup flags) and
  `claude-workflows/SKILL.md:26-27` ("not applicable; this skill is read-only").
- `claude-delegate/SKILL.md:47-51` and `claude-review/SKILL.md:23-25` both carry
  the explicit "do NOT inject automatically — operator choice" safety language for
  the bypass aliases.

**Doc↔code cross-check (no mismatch):** every flag the skills document is present
in the dispatcher allowlist in `scripts/lib/args.mjs` (`BOOLEAN_FLAGS` lines
13-34, `VALUE_FLAGS` lines 40-63, `REPEATABLE_FLAGS` line 37). Because Plan 0024
made `parseArgs` fail closed on unknown flags (`ensureKnownFlag`, lines 65-68), a
doc-only flag would be a real footgun — none was found. (Grepping for the literal
`--system-prompt` etc. yields false negatives because the allowlist stores keys
dash-less, e.g. `'system-prompt'` at line 59.)

### 6. jobId vs Claude shortId/sessionId — PASS
The distinction is applied consistently:

- **Claude attach** always uses the Claude id: `claude attach <shortId>` across
  the launch skills (`claude-fork/SKILL.md:48`, `claude-goal/SKILL.md:48`,
  `claude-batch/SKILL.md:58`, `claude-deep-research/SKILL.md:51`,
  `claude-workflow/SKILL.md:48`) and the marketplace README approval-flow blocks
  (`marketplace/plugins/cc/README.md:124,143,161,179,198`). `claude-status/SKILL.md:35,51`
  uses `claude attach <sessionId>` and explains the `Claude session: <sessionId>`
  line in status output is the input.
- **Plugin skills** correctly take the plugin jobId: `$claude-followup <jobId>`,
  `$claude-status --job <id>`, `$claude-workflows <jobId>`
  (`marketplace/plugins/cc/README.md:216`).
- No `claude attach <jobId>` anti-pattern anywhere. The only `attach.*job` grep
  hit (`packages/plugin-codex/README.md:942`) is `$claude-followup <jobId>` — a
  plugin skill that legitimately takes the jobId, not a `claude attach` misuse.

### 7. Cache ↔ source sync — PASS
`diff` is clean between `…/cache/…/0.3.5/` and `marketplace/plugins/cc/`:

```
cc.mjs IN SYNC
skills IN SYNC
README IN SYNC
plugin.json IN SYNC
```

The installed cache fully reflects the committed Plan 0024 work (commit `20a285a`
"Improve Claude parity controls"); no reinstall needed to pick up the new flags.

### 8. `.gitignore` — PASS
No `claude-companion` references remain (Plan 0024 T4 replaced the stale bundled
negations with `cc` paths).

---

## Frictions

### F1 — Stale "Claude Companion" product name in the shipped plugin README — **Medium (user-facing)**

The README that ships inside the plugin payload (and is therefore the README in
the installed cache, since cache == source) still leads with the old product name
and references it twice more in the uninstall section:

- `marketplace/plugins/cc/README.md:1` → `# Claude Companion`
- `marketplace/plugins/cc/README.md:270` → "It does not delete existing **Claude Companion** job records or transcripts"
- `marketplace/plugins/cc/README.md:276` → "To clear **Claude Companion** job records, …"
- Mirrored verbatim in the cache: `…/0.3.5/README.md:1` → `# Claude Companion`

Everywhere else the project is `cc` / `cc-plugin-codex`, the manifest is
`"name": "cc"` with description "Delegate tasks from Codex to Claude Code
background sessions", and `codex plugin list` shows `cc@…`. The H1 of the
installed README is the first thing a user reads after install, so the mismatch is
confusing ("did I install the right plugin?").

**Suggested fix**
- Retitle the H1 to match the plugin identity, e.g.
  `# cc — delegate Codex tasks to Claude Code` (mirror the `plugin.json`
  description).
- Replace the two "Claude Companion job records" phrases with neutral wording such
  as "Claude Code job records / plugin job records".
- Apply to the source under `packages/plugin-codex/README.md` (if the H1 is shared)
  → regenerate with `node tools/package-marketplace.mjs --write` → reinstall the
  cache so the user-facing copy updates.

> Scope note: squarely within "install/docs polish"; low code risk (doc-only).

### F2 — Version not bumped for the new user-visible flags — **Low (observation)**

Plan 0024 (commit `20a285a`) added user-facing flags (`--blocking`, `--fail-on`,
the permission aliases, and the passthrough set) on top of the v0.3.5 release
(commit `508170e`) **without** a version change — `plugin.json` and
`codex plugin list` both still read `0.3.5`. This is consistent with the plan's
stated scope ("No npm package publication in this plan") and with this lane's
expectation that the cache reads `0.3.5`, so it is **not a defect**. But for
upgrade signaling, a user who refreshes the marketplace sees no version delta to
indicate the new capability surface landed.

**Suggested fix (optional, next release):** bump to `0.3.6` when these flags ship
as a tagged release so `codex plugin list` reflects the expanded flag surface;
note the new flags in the release notes.

### F3 — Marketplace README "Requirements" pins an exact Codex version — **Low (observation)**

`marketplace/plugins/cc/README.md:12` says "tested on `codex-cli 0.136.0`" while
the troubleshooting section (`:332`) says "0.135.0 or later; 0.136.0 is the tested
version". These are mutually consistent, but the top-of-README "Requirements"
phrasing reads as a hard pin. Minor; consider aligning the Requirements line to
"0.135.0+ (0.136.0 tested)" to match the troubleshooting wording. No action
required.

---

## What was NOT done (per task constraints)
- Did **not** run the remote `curl … | bash` install.
- Did **not** commit anything. This report is the only file written.
- Did **not** modify any source, docs, skills, or cache.

---

## Artifact location note
The isolation guard for this background job blocked writing into the shared
checkout, so this report was written inside the worktree
`.claude/worktrees/plan0024-docs-cache-report` at
`documentation/testing/artifacts/20260615-plan0024-installed-polish/agent-docs-cache.md`.
Copy it back into the main checkout at the same relative path to collect it.
