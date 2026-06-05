# Plan 0008 Stage 3 — Audit

Audited commit: 48dbb91
Audited on: 2026-06-05
Auditor: oh-my-claudecode:critic (Opus, fresh-context subagent)

## Verdict

**ready-for-polish** — Zero critical or high findings. Three medium findings (RELEASING.md stale wording, marketplace-releasing test SKILL_NAMES gap, --help flag descriptions omit workflow); two low/nit findings. All are Stage 4 polish material.

## Audit methodology

**Commands run** (all exit codes verified):

| Command | Exit | Key output |
|---|---|---|
| `git rev-parse HEAD` | 0 | `48dbb916053e6330299542861f665dff0c0bf8a2` |
| `git rev-parse plan-0004-pre-cutover` | 0 | `7d9b5f14e44cf49ca73371b78698b25f0cb9d8ff` |
| `git diff plan-0004-pre-cutover -- documentation/plan/0004-` | 0 | empty |
| `git diff plan-0004-pre-cutover -- tools/bench/` | 0 | empty |
| `git diff plan-0004-pre-cutover -- .github/` | 0 | empty |
| `git diff plan-0004-pre-cutover -- documentation/plan/0005-` | 0 | empty |
| `git diff plan-0004-pre-cutover -- packages/runtime/` | 0 | empty |
| `node tools/package-marketplace.mjs --check` | 0 | `20 derived files match source, 64 bundled-dep files match source, 3 synthesized package.json files match canonical shape, 1 marketplace-owned files present, no unexpected files.` |
| `node tools/smoke-marketplace.mjs --help` | 0 | Lists 9 skills; says "nine-skill discovery check" |
| `npm run lint` | 0 | clean |
| `npm run typecheck` | 0 | clean |
| `npm run format` | 0 | clean |
| `npm test` | 0 | 1286 tests (68+172+187+859), 0 fail |
| `npm run test:attach` | 0 | 28 tests, 0 fail |
| `npm run test:bench` | 0 | 258 tests, 0 fail |
| `node ... --help` | 0 | workflow row present |
| `node ... setup` | 0 | `ok workflows-supported`, `warn opus-4-8-supported` (2.1.154), `warn bg-exec-supported` (2.1.154) |
| `grep -c 'Cost savings...'` | 0 | `1` (byte-identical) |
| `diff -q plugin.json (source vs marketplace)` | 0 | identical |
| `diff SKILL.md (source vs marketplace)` | 0 | identical |
| `grep OQ4-forbidden-tokens marketplace/README.md` | 0 | zero hits |

## Contract compliance vs 1-plan.md

| Task | Verdict | Evidence |
|---|---|---|
| **T1** — OQ-C probe | PASS | Artifact at `artifacts/oq-c-probe-20260605.txt` (36 lines). Outcome B documented: `num_turns:1`, `output_tokens:6` — `ultracode:` is TUI-only on v2.1.153. |
| **T2** — SKILL.md | PASS | Frontmatter strictly `name` + `description`. Body contains approval-flow warning + `claude attach` reference. Token-cost warning mentions "16 concurrent agents and up to 1000 total". Rejects `--allow-edit`. No `--yes` auto. No `ultracode:` in user-facing prose. |
| **T3** — Dispatcher workflow subcommand | PASS | `_runDelegateCore` refactored as shared helper (L308). `cmdDelegate` is 3-line identity wrapper. `cmdWorkflow` prepends `ultracode: ` (L279). `--allow-edit` rejected. 7 dispatcher tests confirm all behaviors. |
| **T4** — Manifest registration | PASS | `plugin.json` `defaultPrompt` has exactly 9 entries. SKILL_NAMES extended with `claude-workflow`. Count assertions bumped to 9. 6 new skill-specific tests. |
| **T5** — README docs | PASS | Plugin + marketplace surfaces both have `### $claude-workflow` section with approval flow, token-cost warning, version floor 2.1.153. No `ultracode:` leakage. No OQ4 forbidden tokens. Cost paragraph byte-identical. |
| **T6** — Probe floor split | PASS | Three per-probe constants. Live output: `ok workflows-supported`, `warn opus-4-8-supported` citing 2.1.154, `warn bg-exec-supported` citing 2.1.154. 2 new tests assert divergent floors. |
| **T7** — Marketplace repackage | PASS | `--check` exit 0 with 20 derived files. SKILL.md byte-identical between source and marketplace. RELEASING.md L141/164/175 all say "20" (caveat F-1: separate "eight-skill" wording stale at L235). |
| **T8** — Local gates | PASS | All gates green: lint, typecheck, format, npm test (1286), test:attach (28), test:bench (258). Combined 1572. |

## Security and safety invariants

| Invariant | Status |
|---|---|
| OQ4 forbidden tokens | PASS (zero hits on marketplace README new prose) |
| `plan-0004-pre-cutover` at `7d9b5f1` | PRESERVED |
| Plan 0004 files unchanged | PRESERVED (empty diff) |
| Plan 0005 deferred | PRESERVED |
| Cost paragraph byte-identical | PRESERVED (`grep -c` returns 1) |
| Bench unchanged | PRESERVED |
| CI workflow unchanged | PRESERVED |
| Runtime source unchanged | PRESERVED |
| T9.5 cache-execution invariant | PRESERVED |

## Marketplace packaging correctness

- 20 derived files: PASS
- Byte-identity new `skills/claude-workflow/SKILL.md`: PASS
- Byte-identity `plugin.json`: PASS
- MANIFEST.md "20 files" + new bullet: PASS
- smoke-marketplace.mjs lists 9 skills: PASS

## Test adequacy

- 2-implement.md claims 1572 combined (1286 + 28 + 258): **verified exactly**
- Plan target was +10-15; actual delta is +41 plugin tests
- Overshoot justified per `feedback_test_count_overshoot`: each new test asserts a distinct contract (24+ new assertions touching different contracts; no redundancy found per-describe)
- Test gap surfaced in F-2 (marketplace-releasing.test.mjs)

## Findings

### F-1  RELEASING.md skill-count wording stale: "eight-skill" and "other seven"

- Severity: **medium**
- Area: docs
- Evidence: `documentation/RELEASING.md:235` says `the eight-skill discovery check must be`; L254 says `The other seven skills must not return`. But the skill list at L240-248 has 9 entries (includes `$claude-workflow`).
- Impact: A maintainer following the release checklist sees contradictory counts — the list says 9 but the prose says 8/7. May cause confusion during release verification.
- Suggested disposition: **fix-in-stage-4** — update L235 to "nine-skill" and L254 to "other eight skills".

### F-2  `marketplace-releasing.test.mjs` SKILL_NAMES missing `claude-workflow`

- Severity: **medium**
- Area: tests
- Evidence: `packages/plugin-codex/test/marketplace-releasing.test.mjs:36-45` — `SKILL_NAMES` array has 8 entries; `claude-workflow` is absent. The iteration at L211 (`for (const name of SKILL_NAMES)`) does not verify `$claude-workflow` coverage in RELEASING.md. Test comments at L206/L209 also say "all 8 skills" instead of "all 9 skills".
- Impact: If a future plan removes `$claude-workflow` from RELEASING.md, this test would not catch it. False sense of complete coverage.
- Suggested disposition: **fix-in-stage-4** — add `'claude-workflow'` to SKILL_NAMES and update comments to say "9 skills".

### F-3  `--help` flag descriptions omit `workflow` from applicability parentheticals

- Severity: **medium**
- Area: docs/UX
- Evidence: `packages/plugin-codex/scripts/claude-companion.mjs:1961-1969` — `--yes` says `(delegate/followup/review/adversarial-review)` (no `workflow`); `--name` says `(delegate only)` (no `workflow`); `--model` says `(delegate, adversarial-review)` (no `workflow`); `--effort`, `--permission-mode` same. `--add-dir` and `--mcp-config` say `(delegate only)`. `--allow-edit` says `(delegate, followup)` without mentioning that workflow REJECTS it.
- Impact: A developer invoking the dispatcher directly via `--help` would not know that `--yes`, `--name`, `--model`, `--effort`, `--permission-mode`, `--add-dir`, `--mcp-config` work with `workflow`. Additionally, `--allow-edit` rejection by `workflow` is not mentioned.
- Suggested disposition: **fix-in-stage-4** — add `workflow` to each applicable flag's parenthetical; add `workflow` to `--allow-edit` rejection list.

### F-4  `docs-split.test.mjs` stale comments: "all 8 skills"

- Severity: **nit**
- Area: tests (comments only)
- Evidence: `packages/plugin-codex/test/docs-split.test.mjs:158` says `// T12-3: Skills section lists all 8 skills with $-prefix`; L159 says `it('Skills section enumerates all 8 skill names...')`. The `SKILL_NAMES` array at L60-69 correctly has 9 entries and the assertion logic iterates all 9. Only the comments and test description strings are stale.
- Impact: None functionally; test logic is correct.
- Suggested disposition: **fix-in-stage-4** — update comments and test description strings to say "9 skills".

### F-5  `--help` workflow command line mentions "ultracode"

- Severity: **nit**
- Area: docs/UX
- Evidence: `packages/plugin-codex/scripts/claude-companion.mjs:1949` — `workflow [flags] -- <prompt>              Start a Claude Code dynamic workflow (triggers ultracode planning)`. The term `ultracode` is an implementation detail.
- Impact: Minor information leakage of an implementation detail. Not harmful.
- Suggested disposition: **accept-as-is** — `--help` is developer-facing CLI help, and knowing about `ultracode` is arguably useful context for debugging the dispatcher directly.

## Out-of-scope deferrals

1. **`claude -p` workflow path (G1-async)**: T1 OQ-C probe confirms not viable. Backlog item can be closed as "not feasible with current CLI."
2. **Opus 4.8 probe floor**: `opus-4-8-supported` at `2.1.154` may be wrong on v2.1.153 but is not empirically verified. Deferred.
3. **`--help` flag grouping / per-subcommand help**: a per-subcommand help system would be structural improvement; out of scope.

## Approval gate

**Stage 4 can begin.** Three medium findings (F-1, F-2, F-3) are straightforward Stage 4 polish fixes — each is a wording update with no logic changes. One nit (F-4) is cosmetic. F-5 accept-as-is. No critical or high findings. All gates green. All safety invariants preserved.
