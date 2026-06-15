# Subagent B: compact JSON and status-by-ID implementation guidance

Date: 2026-06-12

Scope:

- Investigated `packages/plugin-codex/scripts/cc.mjs`.
- Investigated `packages/plugin-codex/scripts/lib/format.mjs`.
- Checked dispatcher tests in `packages/plugin-codex/test/dispatcher.test.mjs`.
- No shared source files edited.

## Findings

### High: job success JSON exposes full internal JobRecord

The risky output paths are in `format.mjs`:

- `formatDelegate()` returns `{ ok: true, job }` for `--json` at `packages/plugin-codex/scripts/lib/format.mjs:107`.
- `formatStatus()` returns `{ ok: true, jobs: enrichedJobs }` and spreads full jobs at `packages/plugin-codex/scripts/lib/format.mjs:132`.
- `formatResult()` returns `{ ok: true, job, resultText }` at `packages/plugin-codex/scripts/lib/format.mjs:236`.
- `formatStop()` returns `{ ok: true, job }` at `packages/plugin-codex/scripts/lib/format.mjs:272`.

That full `job` includes `driver.capabilitiesSnapshot`. New delegate-style jobs persist that snapshot from `driver.probe()` at `packages/plugin-codex/scripts/cc.mjs:632`, specifically `capabilitiesSnapshot: caps` at `packages/plugin-codex/scripts/cc.mjs:635`.

The type makes this an unbounded diagnostic blob: `DriverContext.capabilitiesSnapshot: unknown` at `packages/runtime/src/types.ts:45`. The driver probe includes health probe details at `packages/driver-claude-code/src/probe.ts:49` through `packages/driver-claude-code/src/probe.ts:78`; the auth probe can include stdout/stderr-derived detail or evidence at `packages/runtime/src/doctor.ts:246` through `packages/runtime/src/doctor.ts:267`.

Impact: any successful `delegate --json`, `status --json`, `result --json`, or `stop --json` can copy diagnostic internals into automation logs. It is also the source of the large `status --json` payloads measured in the friction pass.

### Medium: no concise status-by-ID query

`cmdStatus()` deliberately rejects positionals at `packages/plugin-codex/scripts/cc.mjs:685` through `packages/plugin-codex/scripts/cc.mjs:702`. That was a good fix for accidental `status <jobId>` misuse, but it leaves no cheap "tell me this one job status" primitive.

Existing single-job commands already implement prefix resolution and workspace scoping:

- `result` resolves a prefix from `listJobs()` or `listJobsForWorkspace()` at `packages/plugin-codex/scripts/cc.mjs:745` through `packages/plugin-codex/scripts/cc.mjs:762`.
- `result` reconciles one job and falls back to `readJob()` at `packages/plugin-codex/scripts/cc.mjs:763` through `packages/plugin-codex/scripts/cc.mjs:772`.
- `stop` has the same prefix and `--all` pattern at `packages/plugin-codex/scripts/cc.mjs:924` through `packages/plugin-codex/scripts/cc.mjs:942`.
- `resolveJobIdPrefix()` is already available at `packages/plugin-codex/scripts/lib/args.mjs:132`.

## Recommended minimal implementation

Use an additive contract:

1. Keep existing `--json` behavior unchanged for this patch.
2. Add `--compact` as an opt-in boolean flag.
3. Add `status --job <jobId-or-prefix>` for one-job status.
4. Make `status --job ... --json` return the compact shape by default, because there is no legacy by-ID status JSON shape.
5. Leave full diagnostic JSON available through existing `--json` for now, then consider a later deprecation to make compact the default.

This avoids breaking current callers while giving Codex automation a safe, small output path immediately.

## Parser changes

Add `compact` to `BOOLEAN_FLAGS` in `packages/plugin-codex/scripts/lib/args.mjs:12`.

Reason: without this, `--compact` is treated by the generic parser as a value flag and consumes the next token at `packages/plugin-codex/scripts/lib/args.mjs:101`.

No parser change is required for `--job <id>` because generic value flags already work.

## Formatter changes

Add a private public-summary helper in `format.mjs`, near `classifyTurnKind()`:

```js
function summarizeJob(job) {
  const latestTurnIndex = Array.isArray(job.turns) ? job.turns.length - 1 : -1;
  const latestTurn = latestTurnIndex >= 0 ? job.turns[latestTurnIndex] : undefined;
  const latestKind = classifyTurnKind(latestTurn);

  return {
    jobId: job.jobId,
    status: job.status,
    shortId: job.claude?.shortId ?? null,
    sessionName: job.claude?.sessionName ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...(job.reviewOf !== undefined ? { reviewOf: job.reviewOf } : {}),
    turnCount: Array.isArray(job.turns) ? job.turns.length : 0,
    latestTurn:
      latestTurnIndex >= 0
        ? {
            index: latestTurnIndex,
            status: latestTurn?.status ?? null,
            ...(latestKind !== undefined ? { kind: latestKind } : {}),
            startedAt: latestTurn?.startedAt ?? null,
            endedAt: latestTurn?.endedAt ?? null,
            hasResult: latestTurn?.result !== undefined,
            finalMessagePreview: latestTurn?.result?.finalMessagePreview ?? null,
          }
        : null,
    result: {
      hasResult: job.result !== undefined,
      finalMessagePreview: job.result?.finalMessagePreview ?? null,
      touchedFiles: Array.isArray(job.result?.touchedFiles) ? job.result.touchedFiles : [],
    },
  };
}
```

Important redaction rule: never spread `job` in compact mode. Do not include:

- `driver` or `driver.capabilitiesSnapshot`.
- `driver.capabilitiesSnapshot.health.probes[*].detail`.
- `driver.capabilitiesSnapshot.health.probes[*].evidence`.
- `codex.cwd`, `workspace.root`, or `claude.cwd` unless a future command explicitly asks for workspace paths.
- `prompt.sha256`, `prompt.summary`, `usageSnapshot`, `transcriptPath`, or raw probe output.

This specifically prevents auth/org probe evidence from appearing in compact JSON, because the compact formatter never reaches the probe tree.

Update formatter signatures in a backwards-compatible way:

```js
export function formatDelegate(job, json, opts = {}) { ... }
export function formatStatus(jobs, json, workspaceRoot, opts = {}) { ... }
export function formatResult(job, resultText, json, opts = {}) { ... }
export function formatStop(job, json, opts = {}) { ... }
```

Existing call sites can pass `{ compact: Boolean(flags.compact) }`. Existing tests keep working when `opts.compact` is absent.

## Suggested output shapes

### `delegate --json --compact`

```json
{
  "ok": true,
  "job": {
    "jobId": "job_example_12345678",
    "status": "running",
    "shortId": "abcd1234",
    "sessionName": "codex:example",
    "createdAt": "2026-06-12T00:00:00.000Z",
    "updatedAt": "2026-06-12T00:00:00.000Z",
    "turnCount": 1,
    "latestTurn": {
      "index": 0,
      "status": "running",
      "startedAt": "2026-06-12T00:00:00.000Z",
      "endedAt": null,
      "hasResult": false,
      "finalMessagePreview": null
    },
    "result": {
      "hasResult": false,
      "finalMessagePreview": null,
      "touchedFiles": []
    }
  }
}
```

### `status --json --compact`

```json
{
  "ok": true,
  "jobs": [
    {
      "jobId": "job_example_12345678",
      "status": "awaiting_followup",
      "shortId": "abcd1234",
      "sessionName": "codex:example",
      "createdAt": "2026-06-12T00:00:00.000Z",
      "updatedAt": "2026-06-12T00:01:00.000Z",
      "turnCount": 1,
      "latestTurn": {
        "index": 0,
        "status": "completed",
        "startedAt": "2026-06-12T00:00:00.000Z",
        "endedAt": "2026-06-12T00:01:00.000Z",
        "hasResult": true,
        "finalMessagePreview": "Done."
      },
      "result": {
        "hasResult": true,
        "finalMessagePreview": "Done.",
        "touchedFiles": []
      }
    }
  ]
}
```

### `status --job <id> --json`

```json
{
  "ok": true,
  "job": {
    "jobId": "job_example_12345678",
    "status": "awaiting_followup",
    "shortId": "abcd1234",
    "sessionName": "codex:example",
    "createdAt": "2026-06-12T00:00:00.000Z",
    "updatedAt": "2026-06-12T00:01:00.000Z",
    "turnCount": 1,
    "latestTurn": {
      "index": 0,
      "status": "completed",
      "startedAt": "2026-06-12T00:00:00.000Z",
      "endedAt": "2026-06-12T00:01:00.000Z",
      "hasResult": true,
      "finalMessagePreview": "Done."
    },
    "result": {
      "hasResult": true,
      "finalMessagePreview": "Done.",
      "touchedFiles": []
    }
  }
}
```

`status --job <id>` human output can be a single-row status block, not the full result:

```text
Claude job
Job ID:         job_example_12345678
Status:         awaiting_followup
Claude session: abcd1234
Name:           codex:example
Result:         Done.
```

### `result <id> --json --compact`

```json
{
  "ok": true,
  "job": {
    "jobId": "job_example_12345678",
    "status": "completed",
    "shortId": "abcd1234",
    "sessionName": "codex:example",
    "createdAt": "2026-06-12T00:00:00.000Z",
    "updatedAt": "2026-06-12T00:01:00.000Z",
    "turnCount": 1,
    "latestTurn": {
      "index": 0,
      "status": "completed",
      "startedAt": "2026-06-12T00:00:00.000Z",
      "endedAt": "2026-06-12T00:01:00.000Z",
      "hasResult": true,
      "finalMessagePreview": "Done."
    },
    "result": {
      "hasResult": true,
      "finalMessagePreview": "Done.",
      "touchedFiles": []
    }
  },
  "resultText": "Done."
}
```

## `cmdStatus()` changes

Keep the existing positional rejection at `packages/plugin-codex/scripts/cc.mjs:690`. Add a separate `--job` branch before list mode:

```js
const jobPrefix = typeof flags.job === 'string' ? flags.job : '';
if (jobPrefix) {
  const workspace = process.cwd();
  const showAll = Boolean(flags.all);
  const listed = showAll ? await listJobs() : await listJobsForWorkspace(workspace);
  const resolved = resolveJobIdPrefix(listed.jobs.map((j) => j.jobId), jobPrefix);
  // same not-found/ambiguous handling as result/stop
  // reconcile one job, falling back to readJob()
  process.stdout.write(formatStatusJob(job, json, { compact: json || Boolean(flags.compact) }) + '\n');
  return;
}
```

Implementation notes:

- Use the same error wording as `result` and `stop` for ambiguous and missing prefixes.
- Reconcile only the selected job. Do not iterate the whole workspace.
- Respect `--all` exactly like `result`, meaning cross-workspace lookup only happens when `--all` is present.
- If both `--job` and a positional are present, reject with exit 2. That avoids ambiguous `cc status --job a b`.
- Update help at `packages/plugin-codex/scripts/cc.mjs:2302` and `packages/plugin-codex/scripts/cc.mjs:2323`.

Suggested help text:

```text
  status [--all] [--json] [--compact]      List jobs for current workspace
  status --job <jobId-or-prefix> [--all]   Show concise status for one job
```

## Compatibility risks

Changing existing `--json` output directly is risky.

Known tests currently rely on parts of the full `status --json` shape:

- The basic status JSON test expects `{ ok: true, jobs: [...] }` at `packages/plugin-codex/test/dispatcher.test.mjs:467`.
- Plan 0022 terminal history checks inspect `parsed.jobs[*].status` at `packages/plugin-codex/test/dispatcher.test.mjs:538`.
- Review annotation tests document that status JSON spreads jobs and enriches `turns` at `packages/plugin-codex/test/dispatcher.test.mjs:5528`.
- Tests assert `reviewOf` on full job objects at `packages/plugin-codex/test/dispatcher.test.mjs:5684`.
- Tests assert enriched turn `kind` fields at `packages/plugin-codex/test/dispatcher.test.mjs:5760` and `packages/plugin-codex/test/dispatcher.test.mjs:5800`.

Some existing tests for `delegate --json` and `result --json` are loose enough to keep passing if the job object is summarized, but external callers may not be. For example, `delegate --json` tests only require `parsed.ok` and `parsed.job.jobId` at `packages/plugin-codex/test/dispatcher.test.mjs:363`; `result --json` tests only require result content somewhere in the JSON at `packages/plugin-codex/test/dispatcher.test.mjs:633`.

Recommendation: do not make `--json` compact by default in a patch release. Add `--compact`, update skills/docs to use it, and consider a later release that introduces `--debug-json` or `--full-json` before flipping the default.

## Targeted tests

Add these to `packages/plugin-codex/test/dispatcher.test.mjs` near the existing status/delegate/result JSON tests:

- `delegate --json --compact returns a public job summary`
  - Run `delegate --json --compact --yes -- "hello"`.
  - Assert `parsed.ok === true`.
  - Assert `parsed.job.jobId`, `status`, `shortId`, `turnCount`, `latestTurn`.
  - Assert `!("driver" in parsed.job)`, `!("codex" in parsed.job)`, `!("workspace" in parsed.job)`, `!("prompt" in parsed.job)`.

- `status --json --compact omits diagnostic capability snapshots`
  - Write a synthetic job whose `driver.capabilitiesSnapshot` contains sentinel strings such as `SECRET_AUTH_EMAIL` and `SECRET_ORG_ID`.
  - Run `status --json --compact`.
  - Assert the output JSON string does not contain either sentinel.
  - Assert compact job fields still include `jobId`, `status`, `shortId`, and `latestTurn.status`.

- `result --json --compact includes resultText but not full JobRecord`
  - Use `writeSyntheticCompletedJob()`.
  - Run `result <jobId> --json --compact`.
  - Assert `resultText` equals the fixture content.
  - Assert no `driver`, `capabilitiesSnapshot`, `prompt.sha256`, or `transcriptPath` appears.

- `status --job --json returns one compact job without listing the workspace`
  - Create two synthetic jobs in the same workspace.
  - Run `status --job <firstJobId> --json`.
  - Assert top-level shape is `{ ok: true, job: ... }`, not `{ jobs: [...] }`.
  - Assert only the selected job ID appears.

- `status --job resolves unique prefixes and reports ambiguous prefixes`
  - Mirror the `result` prefix tests around `packages/plugin-codex/test/dispatcher.test.mjs:660`.
  - Use two jobs with a shared prefix.
  - Assert exact or unique prefix succeeds.
  - Assert ambiguous prefix exits non-zero and includes candidate IDs.

- `status --job respects workspace scoping and --all`
  - Mirror cross-workspace result tests around `packages/plugin-codex/test/dispatcher.test.mjs:866`.
  - Without `--all`, a job from another workspace should not resolve.
  - With `--all`, it should resolve and return one compact job.

- `status positional rejection remains in place`
  - Keep the existing Plan 0020 tests at `packages/plugin-codex/test/dispatcher.test.mjs:515`.
  - Add a sibling test that `status --job <id> extra` exits 2.

- `--compact is a boolean flag`
  - Run `status --json --compact`.
  - Run `status --json --compact --all` in a fixture with one current and one other-workspace job.
  - Assert `--compact` did not consume `--all`.

Optional unit-level formatter tests can import `FORMAT_LIB`, already defined at `packages/plugin-codex/test/dispatcher.test.mjs:53`, but the dispatcher tests are higher value because they cover parser behavior, status lookup, reconciliation fallback, and JSON shape together.

## Follow-up hardening

After the additive fix lands, consider sanitizing new persisted job records too:

- Store a small public capability summary instead of raw `caps` in `driver.capabilitiesSnapshot`.
- Preserve full probe diagnostics only in `cc setup` / doctor output or a local debug artifact.
- If full setup JSON remains diagnostic, document that it can include auth/account probe details and should not be pasted into public issues unredacted.

That is more invasive than the compact-output patch because it changes stored job records and full `--json` output. Treat it as a separate compatibility decision.
