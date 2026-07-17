# Real Codex acceptance test

Use this recipe to validate a packaged `delegate` plugin in a real Codex process. It covers installation,
all 24 skill names, one live Claude Code job, and one live Antigravity job. Historical test findings
under `documentation/testing/` are evidence from earlier releases, not current instructions.

## 1. Record the environment

Run from the repository root:

```bash
node --version
codex --version
claude --version || true
agy --version || true
node -e "console.log(require('./packages/plugin-delegate/.codex-plugin/plugin.json').version)"
git rev-parse HEAD
git status --short
```

Supported release environments use macOS or Linux, Node.js 20 or 22, and Codex CLI 0.136.0 or
later. The most recent live smoke used Codex 0.144.5, Claude Code 2.1.211, and `agy` 1.1.3. Treat
those as recorded test versions rather than hard minimums for either provider. At least one provider
CLI must be installed and authenticated; a full release acceptance pass tests both.

## 2. Run deterministic gates

First run the static gates, which do not invoke a provider model:

```bash
node tools/package-marketplace.mjs --check
npm run lint
npm run typecheck
npm run format
npm test
npm run test:attach
npm run test:bench
```

Then run the marketplace smoke:

```bash
node tools/smoke-marketplace.mjs --marketplace-root "$(pwd)/marketplace"
```

The marketplace smoke uses an isolated temporary `CODEX_HOME`, installs the packaged plugin,
executes its dispatcher from Codex's cache, and cleans up. Its `$claude-setup` cache-execution check
includes the configured Claude model-access probe, so it requires authenticated Claude Code and may
consume provider usage. `$agy-setup` itself remains a no-model-call probe.

## 3. Install the plugin

For a public-release test:

```bash
codex plugin marketplace add https://github.com/wu-hongjun/codex-delegation-plugin
codex plugin add "delegate@codex-delegation-plugin"
codex plugin list
```

For contributor testing from the current checkout instead:

```bash
codex plugin marketplace add "$(pwd)/marketplace"
codex plugin add "delegate@codex-delegation-plugin-local"
codex plugin list
```

Use only one install target for a test run. `codex plugin list` must show `delegate` as installed and
enabled at the version reported by the source manifest. Restart Codex after installing or upgrading
so its generated skill catalog does not retain versioned paths from an older cache entry.

## 4. Verify skill discovery

Open Codex, type `$`, and confirm these 24 skills appear:

```text
$claude-setup
$claude-doctor
$claude-delegate
$claude-status
$claude-wait
$claude-result
$claude-stop
$claude-followup
$claude-review
$claude-adversarial-review
$claude-workflow
$claude-goal
$claude-fork
$claude-batch
$claude-deep-research
$claude-workflows
$claude-skills
$claude-upgrade
$agy-setup
$agy-delegate
$agy-status
$agy-wait
$agy-result
$agy-stop
```

Fresh-process setup invocation can also be checked from a shell:

```bash
codex exec --ephemeral '$claude-setup'
codex exec --ephemeral '$agy-setup'
```

An unavailable provider may produce a clear setup failure, but the skill itself must be recognized.
If skill paths point to an older version, restart Codex before treating it as an install defect.

## 5. Privacy and permissions

The first delegation for each provider and workspace requires a privacy acknowledgement. Claude Code
and Antigravity acknowledgements are separate. Use `--yes` only for an intentional non-interactive
test; do not remove user profile data to force a first-run state.

Permission bypass is never an ordinary default. For a trusted unattended test, request the provider's
bypass flag explicitly. Antigravity's `--sandbox` limits terminal execution but does not approve a
command. Prefer a narrow Antigravity `permissions.allow` rule when the test needs shell access.

## 6. Claude Code golden path

Start with read-only probes:

```text
$claude-setup
$claude-doctor
$claude-skills
```

`$claude-setup` must return aggregate `ok` or a usable `warn`; a `fail` should identify the blocking
probe. `$claude-doctor` should separate CLI auth, model access, browser readiness, workspace, and
permission intent.

Start a bounded job and retain the returned `job_<id>`:

```text
$claude-delegate "Inspect this repository's README files and report one documentation inconsistency. Do not edit files."
$claude-wait <jobId> --json --compact --timeout 5m
$claude-status --job <jobId> --json --compact
$claude-result <jobId>
```

A completed turn normally reaches `awaiting_followup`, then displays as `completed` after its
follow-up window. `needs_input`, `failed`, `stopped`, and `orphaned` require operator action rather
than indefinite polling. A wait timeout does not stop a healthy job; inspect its returned recovery
actions and use `$claude-result <jobId> --partial` when useful.

Exercise same-session continuation, then clean up:

```text
$claude-followup <jobId> -- "Return only the affected file path."
$claude-wait <jobId> --timeout 5m
$claude-result <jobId>
$claude-stop <jobId>
```

For a release that changes review behavior, also run `$claude-review <jobId>` and
`$claude-adversarial-review <jobId>`. Run workflow, goal, fork, batch, and deep-research live tests
only when their implementation changed or the release specifically needs those expensive paths;
their dispatcher and manifest contracts remain covered by the deterministic suite.

## 7. Antigravity golden path

First verify the binary and print-mode surface without a model call:

```text
$agy-setup
```

Start a bounded, read-only planning job and retain the returned `job_<id>`:

```text
$agy-delegate --mode plan -- "Inspect this repository's README files and report one documentation inconsistency. Do not edit files."
$agy-wait <jobId> --json --compact --timeout 5m
$agy-status --job <jobId> --json --compact
$agy-result <jobId>
```

The job should retain `provider: "agy"`, settle as `completed`, and return captured stdout. Use
`$agy-result <jobId> --partial` after a failed, stopped, orphaned, or still-running job when partial
output matters.

Antigravity print mode is single-turn: there is no `$agy-followup`, and the plugin does not use the
workspace-global `agy --continue` state. Start another `$agy-delegate` for another instruction.

To test cancellation, start a deliberately long job, stop it promptly, and inspect the stored state:

```text
$agy-stop <jobId>
$agy-status --job <jobId> --json --compact
$agy-result <jobId> --partial
```

## 8. Edge cases

Probe these when the release touches shared lifecycle behavior:

1. Start two jobs quickly and verify each receives a distinct ID.
2. Confirm default status is workspace-scoped and `--all` crosses workspaces only when requested.
3. Resolve jobs by a unique ID prefix and verify an ambiguous prefix fails clearly.
4. Confirm `--json --compact` output parses as JSON for status, wait, result, and stop.
5. Verify a short wait timeout reports recovery actions without terminating the job.
6. Verify Claude and Antigravity privacy acknowledgement records are provider-scoped.
7. Verify permission-blocked jobs report an actionable failure instead of hanging indefinitely.

Do not delete `~/.codex`, `~/.claude`, or `~/.gemini` data for an edge-case test. Use a temporary
workspace, an isolated `CODEX_HOME`, or the test suite's mock binaries.

## 9. Report findings

Create `documentation/testing/findings-YYYYMMDD.md` with:

- commit, plugin version, OS, Node, Codex, Claude Code, and `agy` versions
- install target: public Git marketplace or local checkout
- one row per tested flow with `pass`, `partial`, or `fail`
- exact command, job ID, final stored status, and relevant output or error
- severity for defects: blocker, high, medium, or low
- deterministic gate results and the GitHub Actions run URL for a release candidate

Do not include provider credentials, private prompts, full repository contents, or unredacted local
paths that should not be committed.

## 10. Uninstall or restore

Remove the target used by the test:

```bash
# Public install
codex plugin remove "delegate@codex-delegation-plugin"
codex plugin marketplace remove "codex-delegation-plugin"

# Local contributor install
codex plugin remove "delegate@codex-delegation-plugin-local"
codex plugin marketplace remove "codex-delegation-plugin-local"
```

Uninstall removes Codex's plugin registration and marketplace pointer. It intentionally leaves
provider transcripts and `~/.codex/codex-delegation-plugin/` job records intact.
