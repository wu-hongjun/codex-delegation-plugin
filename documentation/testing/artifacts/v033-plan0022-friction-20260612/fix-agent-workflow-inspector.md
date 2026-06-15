# Fix Guidance: Workflow Inspector and Gate Friction

Date: 2026-06-12
Agent: subagent D
Scope: read-only investigation plus implementation guidance. No shared source edited.

## Summary

Recommend one small behavior broadening and two clarity fixes:

1. Broaden `cc workflows` so it treats `/deep-research ` job records as workflow-inspectable sessions alongside `ultracode: ` dynamic workflow jobs.
2. Add command-specific help for at least `workflow`, `deep-research`, and `workflows`.
3. Make workflow/deep-research start output print an actual manual next step with the Claude session short ID, while explicitly preserving the no-auto-approval contract.

Do not script, infer, or bypass Claude Code's dynamic workflow approval dialog. The only safe next step is to tell the user to attach and choose in the TUI.

## Findings

### 1. Deep-research jobs are excluded by the inspector filter

Evidence:

- `workflows-inspector.mjs` defines a single discriminator, `ULTRACODE_PREFIX = 'ultracode: '`, at `packages/plugin-codex/scripts/lib/workflows-inspector.mjs:30`.
- `listWorkflows()` filters jobs through `_isWorkflowJob` at `packages/plugin-codex/scripts/lib/workflows-inspector.mjs:58-60`.
- `_isWorkflowJob()` only accepts `prompt.summary.startsWith('ultracode: ')` at `packages/plugin-codex/scripts/lib/workflows-inspector.mjs:132-135`.
- Drill-in rejects any matched job whose prompt does not begin with that prefix at `packages/plugin-codex/scripts/lib/workflows-inspector.mjs:99-102`.
- `cmdDeepResearch()` creates jobs by transforming the prompt to `/deep-research ${p}` at `packages/plugin-codex/scripts/cc.mjs:521-524`, so those jobs can never pass the inspector predicate.
- The friction run confirmed the user-visible failure: `cc workflows job_mqayfxhe_89e94bde --json` rejected a deep-research job even though its logs showed Claude Code's dynamic workflow approval screen (`documentation/testing/artifacts/v033-plan0022-friction-20260612/friction-summary.md:130-145`; detailed log excerpt at `documentation/testing/artifacts/v033-plan0022-friction-20260612/agent-fanout-ergonomics.md:266-270`).

Minimal implementation:

- Replace the single prefix predicate with a tiny classifier:

```js
const WORKFLOW_PROMPT_KINDS = [
  { kind: 'dynamic_workflow', prefix: 'ultracode: ' },
  { kind: 'deep_research', prefix: '/deep-research ' },
];

function _workflowKind(job) {
  const summary = job?.prompt?.summary;
  if (typeof summary !== 'string') return null;
  return WORKFLOW_PROMPT_KINDS.find((k) => summary.startsWith(k.prefix))?.kind ?? null;
}

function _isWorkflowJob(job) {
  return _workflowKind(job) !== null;
}
```

- Add `kind: _workflowKind(job)` or `sourceCommand` to `_toWorkflowSession()` and `inspectWorkflow()` output. This makes the broadened list self-explanatory and helps automation distinguish `workflow` from `deep-research`.
- Update the rejection text at `packages/plugin-codex/scripts/lib/workflows-inspector.mjs:99-102` to say the job is not workflow-inspectable and list the accepted prompt prefixes.
- Update human list output in `cmdWorkflows()` at `packages/plugin-codex/scripts/cc.mjs:2278-2282` to include the kind column, or at minimum rename the empty/list wording from "workflow sessions started via $claude-workflow" to "workflow-like sessions started via $claude-workflow or $claude-deep-research".

Compatibility risk:

- `cc workflows` will list more jobs than before. That is the intended fix, but scripts assuming only `ultracode:` rows may need to filter by the new `kind`.
- Existing JSON consumers should tolerate an added `kind` field. Avoid renaming existing fields (`sessions`, `jobId`, `sessionId`, `shortId`, `promptSummary`) in this pass.

### 2. Subcommand help is globally short-circuited

Evidence:

- `parseArgs()` treats `--help` as a boolean flag wherever it appears before `--` (`packages/plugin-codex/scripts/lib/args.mjs:11-19`, `packages/plugin-codex/scripts/lib/args.mjs:56-85`).
- The dispatcher exits before command routing whenever `flags.help` is set (`packages/plugin-codex/scripts/cc.mjs:179-184`).
- Therefore `cc workflow --help`, `cc deep-research --help`, and `cc workflows --help` all print the global help from `printUsage()` (`packages/plugin-codex/scripts/cc.mjs:2289-2329`).
- The friction summary records this as low-severity usability friction at `documentation/testing/artifacts/v033-plan0022-friction-20260612/friction-summary.md:175-187`.

Minimal implementation:

- Change the early help branch to dispatch help by command:

```js
if (flags.help) {
  printUsage(command);
  process.exit(0);
}
if (!command) {
  printUsage();
  process.exit(2);
}
```

- Keep global help for `cc --help`.
- Add a `printUsage(command)` switch or a `COMMAND_HELP` map. Start with command-specific entries for:
  - `workflow`: flags, privacy acknowledgement, dynamic workflow approval gate, no auto-approval, attach command shape.
  - `deep-research`: flags, possible dynamic workflow approval gate on current Claude Code, WebSearch/cost note, attach command shape.
  - `workflows`: read-only behavior, `--all`, `--json`, included job kinds.
- Preserve `cc workflow -- --help` as prompt text. The existing parser already does that because tokens after `--` become positional.

Compatibility risk:

- `cc unknown --help` currently exits 0 with global help because the early branch wins. If changing that behavior is too risky, keep unknown-command help as global help for now and only specialize known commands.
- Tests that only assert global help contains a command should still pass. Add stricter tests for command-specific snippets rather than removing old global help tests.

### 3. Gate output uses placeholders and under-describes deep-research approval

Evidence:

- `cmdWorkflow()` appends static text saying `claude attach <jobId>` at `packages/plugin-codex/scripts/cc.mjs:418-428`.
- `cmdDeepResearch()` appends static text saying attach via a literal placeholder and claims only "watch progress" (`packages/plugin-codex/scripts/cc.mjs:524-531`).
- `_runDelegateCore()` prints the standard job block, then appends the static `extraOutput` string (`packages/plugin-codex/scripts/cc.mjs:662-668`), so the extra text cannot include the actual job or session identifiers.
- The standard job formatter already prints the real plugin job ID and Claude session short ID (`packages/plugin-codex/scripts/lib/format.mjs:112-123`).
- The follow-up permission path uses the Claude short ID in manual attach guidance (`packages/plugin-codex/scripts/cc.mjs:1094`, `packages/plugin-codex/scripts/cc.mjs:1151-1162`), which is the better precedent for `claude attach`.
- Docs are stale: README says deep-research requires no interactive approval at `packages/plugin-codex/README.md:289-293`, while v0.33 testing observed `Run a dynamic workflow?` and `Yes, run it` in logs (`documentation/testing/artifacts/v033-ticket-20260612/13-deep-research.md:277-288`).

Minimal implementation:

- Let `_runDelegateCore()` accept `extraOutput` as either a string or a function of the finalized job:

```js
const renderedExtra =
  typeof extraOutput === 'function' ? extraOutput(finalJob) : extraOutput;
if (renderedExtra !== null && !json) {
  process.stdout.write(renderedExtra + '\n');
}
```

- For `workflow`, render:

```text
Approval required before workflow subagents start.
Run: claude attach <shortId>
Then choose Yes, View raw script, or No in Claude Code.
Note: --yes only acknowledges the plugin privacy prompt; it does not approve this workflow gate.
```

- For `deep-research`, render:

```text
Next step: watch or approve in Claude Code if prompted.
Run: claude attach <shortId>
Current Claude Code versions may present a dynamic workflow approval gate for /deep-research.
Note: --yes only acknowledges the plugin privacy prompt; it does not approve Claude Code workflow gates.
```

- Prefer `<shortId>` from `finalJob.claude.shortId`. Keep the plugin `jobId` in the standard job block for `$claude-status`, `$claude-result`, and `$claude-stop`.
- Optional low-risk JSON improvement: add an extra top-level `nextStep` object to `formatDelegate()` JSON for `workflow` and `deep-research`, for example:

```json
{
  "ok": true,
  "job": {},
  "nextStep": {
    "approvalRequired": true,
    "attachCommand": "claude attach 5385bd82",
    "autoApproved": false
  }
}
```

Use `approvalRequired: true` for `workflow`; use `approvalMayBeRequired: true` or `approvalRequired: "maybe"` for `deep-research` unless the runtime can reliably detect the gate. Avoid claiming a gate is present from startup alone.

Compatibility risk:

- Human output wording changes are low risk.
- Adding JSON fields is usually backward-compatible, but do not move `job` or change the `ok` shape because existing callers parse `{ ok, job }`.
- Do not replace `$claude-result <jobId>` guidance with `claude attach <shortId>`; they serve different purposes.

## Docs to Update

- `packages/plugin-codex/README.md:132-138`: replace `claude attach <jobId>` with `claude attach <shortId>` or wording tied to the printed "Claude session" value.
- `packages/plugin-codex/README.md:289-293`: remove the claim that deep-research has no interactive approval dialog. Say it can present a Claude Code dynamic workflow approval gate depending on version/task shape.
- `packages/plugin-codex/README.md:376-392`: describe `cc workflows` as covering `$claude-workflow` and `$claude-deep-research` workflow-like background jobs if the implementation is broadened. Also remove the stale "claude agents --json" storage wording if touched.
- `packages/plugin-codex/skills/claude-workflow/SKILL.md:34-44`: use the printed Claude session short ID in attach guidance.
- `packages/plugin-codex/skills/claude-deep-research/SKILL.md:34-45`: replace "No interactive approval dialog is required" with "may present a dynamic workflow approval gate; attach and choose manually if prompted."
- `packages/plugin-codex/skills/claude-workflows/SKILL.md:31-45`: update behavior and scope notes from `claude agents --json` / `$claude-workflow` only to job-store-backed workflow and deep-research inspection.

Marketplace copies under `marketplace/plugins/cc/` should be regenerated or updated through the existing marketplace packaging flow after source docs/scripts change.

## Tests to Add or Update

Add these tests without requiring a real Claude binary; use the existing mock/job-store patterns.

### `packages/plugin-codex/test/workflows-inspector.test.mjs`

- `workflows: includes deep-research jobs whose prompt.summary starts with "/deep-research "`
  - Arrange one `ultracode: ` job, one `/deep-research ` job, and one ordinary delegate job.
  - Assert list output includes the first two and excludes the ordinary job.

- `workflows --json: emits kind for dynamic workflow and deep-research sessions`
  - Assert JSON rows include `kind: "dynamic_workflow"` and `kind: "deep_research"` or equivalent stable names.

- `workflows <jobId>: drill-in succeeds for deep-research workflow jobs`
  - Use `makeJobRecord()` with `promptSummary: '/deep-research test question'`.
  - Assert exit 0 and detail includes the session ID/name.

- Update `workflows <jobId>: drill-in rejects non-workflow jobs` at `packages/plugin-codex/test/workflows-inspector.test.mjs:362-376` so the expected error mentions "workflow-inspectable" or both accepted prefixes, not only `ultracode`.

### `packages/plugin-codex/test/dispatcher.test.mjs`

- `workflow --help prints command-specific approval help`
  - Assert output starts with `Usage: cc workflow`, mentions `--yes`, `claude attach`, and "does not approve".

- `deep-research --help prints command-specific gate help`
  - Assert output starts with `Usage: cc deep-research`, mentions WebSearch, `claude attach`, and possible dynamic workflow approval.

- `workflows --help prints read-only inspector help`
  - Assert output starts with `Usage: cc workflows`, mentions `--all`, `--json`, read-only, and deep-research inclusion.

- Update `workflow --yes -- "test prompt" (happy path)` around `packages/plugin-codex/test/dispatcher.test.mjs:6593-6611`:
  - Assert the attach command uses the actual mock Claude short ID from the standard output, not literal `<jobId>`.
  - Assert output says `--yes` does not approve the workflow gate.

- Update `deep-research --yes -- "test question" (happy path)` around `packages/plugin-codex/test/dispatcher.test.mjs:7127-7145`:
  - Assert the attach command uses the actual mock Claude short ID.
  - Assert output mentions possible dynamic workflow approval and no auto-approval.

- If adding JSON next-step metadata:
  - `workflow --json includes nextStep attachCommand and autoApproved false`
  - `deep-research --json includes nextStep approvalMayBeRequired and attachCommand`

### `packages/plugin-codex/test/readme.test.mjs`

- `README deep-research approval docs mention possible dynamic workflow approval gate`
  - Guard against reintroducing the stale "no interactive approval dialog is required" claim.

- `README workflows docs include deep-research inspectable jobs`
  - Assert the `$claude-workflows` section mentions `$claude-deep-research`.

- `README attach docs use Claude session shortId wording`
  - Avoid the ambiguous `claude attach <jobId>` placeholder.

### `packages/plugin-codex/test/skills-manifest.test.mjs`

- `claude-deep-research/SKILL.md does not claim no interactive approval dialog is required`
- `claude-deep-research/SKILL.md tells users to attach if Claude Code presents a workflow gate`
- `claude-workflows/SKILL.md documents deep-research sessions as inspectable`
- `claude-workflow/SKILL.md uses Claude session shortId attach wording`

## Verification Commands

Targeted:

```sh
npm run build
node --test packages/plugin-codex/test/workflows-inspector.test.mjs
node --test packages/plugin-codex/test/dispatcher.test.mjs
node --test packages/plugin-codex/test/readme.test.mjs
node --test packages/plugin-codex/test/skills-manifest.test.mjs
```

Full plugin suite:

```sh
npm run test:plugin
```

Run marketplace layout checks if marketplace copies are regenerated.
