# Subagent D - Batch, Deep Research, Workflows Inspector

Test date: 2026-06-07
Workspace: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`
Dispatcher: `/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs`

## Summary Table Rows

| command | variation | status | notes |
| --- | --- | --- | --- |
| `$claude-batch` | 12a `batch --yes "List the entries..."` | pass | Start exit 0; job `job_mq48xlis_c9ffffbe`; reached `awaiting_followup`; result listed 14 skill directories and no changes. |
| `$claude-batch` | 12b `batch --yes "For each SKILL.md..."` | partial | Start exit 0; job `job_mq48xup7_d4459f24`; demonstrated real fan-out (`2 Explore agents`) but blocked on shell permission, then stopped/recovered as `orphaned`. |
| `$claude-batch` | 12c `batch --yes --json "Print MARKER-Bb then stop."` | pass | Start exit 0 with valid JSON `ok: true`; job `job_mq48y42k_7a776ce5`; result recovered `MARKER-Bb`; stopped/recovered as `orphaned` after stale `running`. |
| `$claude-deep-research` | 13a `deep-research --yes "What is 2 plus 2? Brief."` | pass | Start exit 0; job `job_mq492h6c_7b129538`; reached `awaiting_followup`; result `2 plus 2 = 4` and explicitly skipped fan-out as wasteful. |
| `$claude-deep-research` | 13b `deep-research --yes "What changed..."` | partial | Start exit 0; job `job_mq492p5o_197e2045`; workflow launched and fan-out/web searches occurred, but after 6+ minutes remained `needs_input`; stopped/recovered as `orphaned`, no final cited report. |
| `$claude-deep-research` | 13c `deep-research --yes --json "What is the capital of France?"` | partial | Start exit 0 with valid JSON `ok: true`; job `job_mq492yaw_82f9d2b9`; workflow launched and produced `Paris` in logs, but after 6+ minutes remained `needs_input`; stopped/recovered as `orphaned`. |
| `$claude-workflows` | 14a `workflows` | pass | Exit 0; listed 10 workflow sessions in this workspace. |
| `$claude-workflows` | 14b `workflows --all` | pass | Exit 0; listed workflow sessions cross-workspace, same 10 visible in this environment. |
| `$claude-workflows` | 14c `workflows <workflow jobId>` | pass with caveat | Exit 0 with mapped job ID `job_mq492p5g_0dad8a0e`; drill-in printed non-blank `Workflow session:` and `Name:`. Caveat: passing displayed short session ID `983cda25` failed. |

## 12. Batch Variations

### 12a list skills

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs batch --yes "List the entries of packages/plugin-codex/skills/ then stop. No changes."
```

Exit code: 0

Job ID: `job_mq48xlis_c9ffffbe`
Claude session: `eb3a9a94`
Terminal status: `awaiting_followup`

Key start excerpt:

```text
Claude job started
Job ID:         job_mq48xlis_c9ffffbe
Status:         running
This is a Claude Code batch request.
The runtime injects a "# Batch: Parallel Work Orchestration" system prompt.
```

Recovered result excerpt:

```text
Entries of `packages/plugin-codex/skills/` (14 total):
- claude-adversarial-review
- claude-batch
- claude-deep-research
- claude-delegate
- claude-followup
- claude-fork
- claude-goal
- claude-result
- claude-review
- claude-setup
- claude-status
- claude-stop
- claude-workflow
- claude-workflows
Stopping here as requested -- no changes made.
```

### 12b SKILL.md frontmatter fan-out

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs batch --yes "For each SKILL.md under packages/plugin-codex/skills/, in parallel, report its frontmatter name: field. Use subagents; make no edits."
```

Exit code: 0

Job ID: `job_mq48xup7_d4459f24`
Claude session: `04c6d689`
Observed status sequence: `running` -> `needs_input` -> stopped at `2026-06-07T20:46:06Z` -> recovered as `orphaned`

Key start excerpt:

```text
Claude job started
Job ID:         job_mq48xup7_d4459f24
Status:         running
This is a Claude Code batch request.
The runtime injects a "# Batch: Parallel Work Orchestration" system prompt.
```

Fan-out evidence:

```text
Running 2 Explore agents...
2 Explore agents finished
Read name field of 7 SKILL.md files
```

Recovered result excerpt after stop:

```text
Job:        job_mq48xup7_d4459f24
Status:     orphaned
This is a read-only task -- the batch skill's worktree/PR workflow is overkill for reading a YAML field, so I'll honor "parallel subagents, no edits" with lightweight read-only Explore agents and skip the worktree/PR machinery. Launching two in parallel, each covering half the files.
```

Stop invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs stop job_mq48xup7_d4459f24
```

Stop exit code: 0

### 12c JSON marker

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs batch --yes --json "Print MARKER-Bb then stop."
```

Exit code: 0

Job ID: `job_mq48y42k_7a776ce5`
Claude session: `e24f2170`
Observed status sequence: `running` -> stale `running` despite log marker -> stopped at `2026-06-07T20:46:06Z` -> recovered as `orphaned`

Key JSON excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mq48y42k_7a776ce5",
    "status": "running",
    "codex": {
      "pluginVersion": "0.3.0"
    },
    "prompt": {
      "summary": "/batch Print MARKER-Bb then stop."
    }
  }
}
```

Recovered result excerpt:

```text
Job:        job_mq48y42k_7a776ce5
Status:     orphaned
MARKER-Bb
```

Stop invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs stop job_mq48y42k_7a776ce5
```

Stop exit code: 0

## 13. Deep Research Variations

### 13a cheap arithmetic

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs deep-research --yes "What is 2 plus 2? Brief."
```

Exit code: 0

Job ID: `job_mq492h6c_7b129538`
Claude session: `c6d696e7`
Terminal status: `awaiting_followup`

Recovered result excerpt:

```text
2 plus 2 = **4**.

(Skipping the deep-research workflow here -- that harness fans out parallel web searches and adversarial verification agents, which would be wasteful for a settled arithmetic fact.)
```

### 13b Node.js permission model v20/v22

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs deep-research --yes "What changed in the Node.js permission model between v20 and v22? Cite sources."
```

Exit code: 0

Job ID: `job_mq492p5o_197e2045`
Claude session: `d6dbb2be`
Workflow run ID: `wf_196d749a-5c0`
Workflow transcript dir: `/Users/hongjunwu/.claude/projects/-Users-hongjunwu-Repositories-Git-cc-plugin-codex/d6dbb2be-4c60-4180-92fd-509a74fce13c/subagents/workflows/wf_196d749a-5c0`
Observed status sequence: `running` -> `needs_input`; after attach approvals the workflow ran; after 6+ minutes main thread requested timeout; stopped at `2026-06-07T20:51:30Z`; recovered as `orphaned`.

Key start excerpt:

```text
Claude job started
Job ID:         job_mq492p5o_197e2045
Status:         running
This is a Claude Code deep-research request.
The /deep-research runtime fans out parallel web searches, fetches sources,
adversarially verifies claims, and synthesizes a cited report.
```

Workflow launch evidence from transcript:

```text
Workflow launched in background. Task ID: wswykaia0
Summary: Deep research harness -- fan-out web searches, fetch sources, adversarially verify claims, synthesize a cited report.
Run ID: wf_196d749a-5c0
```

Real multi-agent / multi-source evidence:

```text
Scope result decomposed the question into 6 search angles, including:
- broad/primary
- changelog/release-history
- API/flag-surface
- security/threat-model
- limitations/bypasses
- practitioner/migration
```

The workflow journal contained many agent transcripts and web-search result sets. Examples:

```text
Node.js 20.0.0 Release (nodejs.org) -- experimental Permission Model introduced.
Node.js v22.x Permissions docs (nodejs.org) -- Permission Model docs and flag surface.
Node.js v20.x Permissions docs (nodejs.org) -- v20 baseline.
node/doc/api/permissions.md (github.com/nodejs/node) -- limitations and known risks.
Node.js January 21, 2025 Security Releases (nodejs.org) -- permission-model CVEs/fixes.
```

Recovered result after stop:

```text
Job:        job_mq492p5o_197e2045
Status:     orphaned
The deep-research workflow is now running in the background. It will:
1. Scope -- decompose your question into 5 search angles
2. Search -- run 5 parallel web searches
3. Fetch -- dedup URLs, pull the top ~15 sources, extract falsifiable claims
4. Verify -- adversarially fact-check each claim
5. Synthesize -- merge, rank by confidence, and produce a cited report
```

Stop invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs stop job_mq492p5o_197e2045
```

Stop exit code: 0

Result: partial. The required fan-out/web-search behavior occurred, but the final cited report did not complete before timeout.

### 13c JSON capital of France

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs deep-research --yes --json "What is the capital of France?"
```

Exit code: 0

Job ID: `job_mq492yaw_82f9d2b9`
Claude session: `68c90ddb`
Workflow run ID: `wf_54ea5a87-cc4`
Workflow transcript dir: `/Users/hongjunwu/.claude/projects/-Users-hongjunwu-Repositories-Git-cc-plugin-codex/68c90ddb-2c81-4c22-8f89-113e2bb07c4d/subagents/workflows/wf_54ea5a87-cc4`
Observed status sequence: `running` -> `needs_input`; after attach approvals the workflow ran; after 6+ minutes main thread requested timeout; stopped at `2026-06-07T20:51:30Z`; recovered as `orphaned`.

Key JSON excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mq492yaw_82f9d2b9",
    "status": "running",
    "codex": {
      "pluginVersion": "0.3.0"
    },
    "prompt": {
      "summary": "/deep-research What is the capital of France?"
    }
  }
}
```

Workflow launch evidence:

```text
Workflow launched in background. Task ID: w0g2t7je7
Run ID: wf_54ea5a87-cc4
```

Recovered result after stop:

```text
Job:        job_mq492yaw_82f9d2b9
Status:     orphaned
The deep-research workflow is running in the background. I'll be notified when it completes.

Note: the answer here is trivially **Paris** -- this question doesn't really need a multi-source fact-checked report.
```

Workflow journal evidence included search/result agents citing Britannica, Wikipedia, Council of Europe, and historical-capital sources. Result: partial. JSON dispatcher output passed, but final workflow synthesis did not complete before timeout.

Stop invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs stop job_mq492yaw_82f9d2b9
```

Stop exit code: 0

## 14. Workflows Inspector Variations

### 14a list workspace workflows

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs workflows
```

Exit code: 0

Key output excerpt:

```text
Workflow sessions (10):
  2b741235  orphaned    codex:cc-plugin-codex:mq1eq7jq
  46153ea7  orphaned    codex:cc-plugin-codex:mq34smmc
  24637634  orphaned    codex:cc-plugin-codex:mq34uaeq
  ee8a35d3  running     codex:cc-plugin-codex:mq36ptd0
  ...
  983cda25  needs_input  codex:cc-plugin-codex:mq492mep

Run `cc workflows <sessionId>` to drill into a session.
```

### 14b list all workflows

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs workflows --all
```

Exit code: 0

Key output excerpt:

```text
Workflow sessions (10):
  2b741235  orphaned    codex:cc-plugin-codex:mq1eq7jq
  ...
  983cda25  needs_input  codex:cc-plugin-codex:mq492mep
```

### 14c drill-in

Initial displayed short ID attempt:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs workflows 983cda25
```

Exit code: 1

Output:

```text
[workflows] Error: No job found matching jobId "983cda25"
```

Mapping command:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs status --all --json | jq '.jobs[] | select((.claude.shortId // "") == "983cda25" or (.claude.sessionId // "" | startswith("983cda25")) or (.jobId // "" | contains("983cda25"))) | {jobId,status,shortId:.claude.shortId,sessionId:.claude.sessionId,name:.claude.sessionName,cwd:.claude.cwd}'
```

Mapped job:

```json
{
  "jobId": "job_mq492p5g_0dad8a0e",
  "status": "running",
  "shortId": "983cda25",
  "sessionId": "983cda25-a210-4647-b1d7-87cfe2b4dc64",
  "name": "codex:cc-plugin-codex:mq492mep",
  "cwd": "/Users/hongjunwu/Repositories/Git/cc-plugin-codex"
}
```

Successful drill-in invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs workflows job_mq492p5g_0dad8a0e
```

Exit code: 0

Key output excerpt:

```text
Workflow session: 983cda25-a210-4647-b1d7-87cfe2b4dc64
  Name:      codex:cc-plugin-codex:mq492mep
  Status:    running
  CWD:       /Users/hongjunwu/Repositories/Git/cc-plugin-codex
  StartedAt: 2026-06-07T20:44:18.004Z
```

Post-stop recheck also exited 0 and still printed non-blank fields:

```text
Workflow session: 983cda25-a210-4647-b1d7-87cfe2b4dc64
  Name:      codex:cc-plugin-codex:mq492mep
  Status:    orphaned
```

Conclusion: the v0.3.0 blank-detail fix is confirmed for the job-ID drill-in path. Caveat: the list output says `cc workflows <sessionId>`, but the implementation expects a workflow job ID or job-ID prefix; passing the displayed short session ID fails.

## Final Session/Worktree Notes

- `claude agents --json` showed no active records for stopped Subagent D sessions `d6dbb2be` or `68c90ddb` after cleanup.
- No commits were made.
- I wrote this merge-ready artifact instead of editing `documentation/testing/findings-20260607-v030-deep.md` to avoid concurrent edits from the main thread.
