# Lane 15 Edge Cases - CC Plugin v0.3.3

Generated: 2026-06-12T03:16:53Z  
Dispatcher: `node marketplace/plugins/cc/scripts/cc.mjs`  
Plugin version: `0.3.3`  
Claude Code: `2.1.174 (Claude Code)`  
Ticket file was not edited. No commit was made.

## Summary

| Edge case | Result |
| --- | --- |
| 1. `--allow-edit` rejected on non-applicable subcommands | PARTIAL |
| 2. Empty and whitespace-only delegate prompts | PASS |
| 3. Non-TTY delegate with stdin | PASS |
| 4. Workspace isolation | PASS |
| 5. `--json` parseability across bg-flow skills | PASS |
| 6. Privacy disclosure / persisted ack | PASS |

## 1. `--allow-edit` Rejections - PARTIAL

Fixture job for review commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --json --name lane15-allow-edit-fixture -- 'Reply exactly L15_ALLOW_EDIT_FIXTURE and stop.'
```

Exit `0`; job `job_mqacz101_ff815b66`; cleanup command later returned exit `0` and JSON with `"status": "stopped"`.

Commands tested:

```sh
node marketplace/plugins/cc/scripts/cc.mjs workflow --allow-edit -- 'lane15 allow edit workflow'
# exit 2
# stderr: [workflow] Error: --allow-edit is not applicable to $claude-workflow.

node marketplace/plugins/cc/scripts/cc.mjs goal --allow-edit -- 'lane15 allow edit goal'
# exit 2
# stderr: [goal] Error: --allow-edit is not applicable to $claude-goal.

node marketplace/plugins/cc/scripts/cc.mjs fork --allow-edit -- 'lane15 allow edit fork'
# exit 2
# stderr: [fork] Error: --allow-edit is not applicable to $claude-fork.

node marketplace/plugins/cc/scripts/cc.mjs batch --allow-edit -- 'lane15 allow edit batch'
# exit 2
# stderr: [batch] Error: --allow-edit is not applicable to $claude-batch.

node marketplace/plugins/cc/scripts/cc.mjs deep-research --allow-edit -- 'lane15 allow edit deep research'
# exit 2
# stderr: [deep-research] Error: --allow-edit is not applicable to $claude-deep-research.

node marketplace/plugins/cc/scripts/cc.mjs review job_mqacz101_ff815b66 --allow-edit
# exit 2
# stderr: [review] Error: --allow-edit is not applicable to review skills. Reviews are read-only.

node marketplace/plugins/cc/scripts/cc.mjs adversarial-review job_mqacz101_ff815b66 --allow-edit
# exit 2
# stderr: [adversarial-review] Error: --allow-edit is not applicable to review skills. Reviews are read-only.
```

All commands exited `2` and included `not applicable`, but none emitted the exact requested phrase `not applicable to this subcommand`, so this is marked PARTIAL.

## 2. Empty / Whitespace Delegate Prompts - PASS

Before/after repo-local `status --json` job count: `202` -> `202`; no new job ids.

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes -- ""
# exit 2
# stderr: [delegate] Error: prompt is required: cc delegate -- "<prompt>"

node marketplace/plugins/cc/scripts/cc.mjs delegate --yes -- "   "
# exit 2
# stderr: [delegate] Error: prompt is required: cc delegate -- "<prompt>"
```

## 3. Non-TTY Delegate With Stdin - PASS

Before/after repo-local status had no new job ids.

```sh
printf 'x\n' | node marketplace/plugins/cc/scripts/cc.mjs delegate --yes
# exit 2
# stderr: [delegate] Error: prompt is required: cc delegate -- "<prompt>"
```

This rejects cleanly and starts no job.

## 4. Workspace Isolation - PASS

Temp workspace: `/tmp/cc-lane15-isolation-1781234516871` (resolved in records as `/private/tmp/cc-lane15-isolation-1781234516871`)

```sh
node '/Users/hongjunwu/Repositories/Git/cc-plugin-codex/marketplace/plugins/cc/scripts/cc.mjs' delegate --yes --json --name lane15-isolation -- 'Reply exactly L15_ISOLATION and stop.'
# cwd: /tmp/cc-lane15-isolation-1781234516871
# exit 0
# jobId: job_mqad1l5k_3b475de6

node marketplace/plugins/cc/scripts/cc.mjs status --json
# cwd: repo root
# exit 0
# repo-local jobs did not include job_mqad1l5k_3b475de6

node marketplace/plugins/cc/scripts/cc.mjs status --all --json
# cwd: repo root
# exit 0
# all-workspace jobs included job_mqad1l5k_3b475de6

node marketplace/plugins/cc/scripts/cc.mjs stop job_mqad1l5k_3b475de6 --all --json
# exit 0
# stdout JSON included "status": "stopped"
```

## 5. `--json` Parseability - PASS

All tested `--json` outputs parsed as JSON. Launch jobs were immediately stopped.

| Command family | Command shape | Exit | JSON stream | Job / note |
| --- | --- | ---: | --- | --- |
| delegate | `delegate --yes --json --name lane15-json-delegate -- 'Reply exactly L15_JSON_DELEGATE and stop.'` | 0 | stdout | `job_mqacz6tb_dd927b32` |
| result | `result job_mqacz6tb_dd927b32 --json` | 0 | stdout | after stop |
| workflow | `workflow --yes --json --name lane15-json-workflow -- 'Plan only; reply exactly L15_JSON_WORKFLOW and stop.'` | 0 | stdout | `job_mqaczczj_39c553c0` |
| goal | `goal --yes --json --name lane15-json-goal -- 'Emit exactly L15_JSON_GOAL then stop.'` | 0 | stdout | `job_mqaczidr_c3c5e4df` |
| fork | `fork --yes --json --name lane15-json-fork -- 'Report exactly L15_JSON_FORK and stop.'` | 0 | stdout | `job_mqacznt8_2cf31251` |
| batch | `batch --yes --json --name lane15-json-batch -- 'Report exactly L15_JSON_BATCH and stop.'` | 0 | stdout | `job_mqaczt7t_1a68a883` |
| deep-research | `deep-research --yes --json --name lane15-json-deep-research -- 'What is 1+1? Answer with the number only.'` | 0 | stdout | `job_mqaczyhr_550cecd3` |
| status | `status --json` | 0 | stdout | parsed, large output |
| followup | `followup job_lane15_missing --json -- 'noop'` | 1 | stderr | parsed error JSON |
| review | `review job_lane15_missing --json` | 1 | stderr | parsed error JSON |
| adversarial-review | `adversarial-review job_lane15_missing --json` | 1 | stderr | parsed error JSON |
| stop | `stop job_lane15_missing --json` | 1 | stderr | parsed error JSON |
| workflows | `workflows --json` | 0 | stdout | parsed |

Example parsed error JSON excerpt:

```json
{
  "ok": false,
  "error": {
    "message": "No job found matching \"job_lane15_missing\" in this workspace. Re-run with --all to search every workspace.",
    "name": "Error"
  }
}
```

## 6. Privacy Disclosure / Persisted Ack - PASS

Temp workspace: `/tmp/cc-lane15-privacy-1781234662865` (resolved in records as `/private/tmp/cc-lane15-privacy-1781234662865`)

```sh
node '/Users/hongjunwu/Repositories/Git/cc-plugin-codex/marketplace/plugins/cc/scripts/cc.mjs' delegate -- 'Reply exactly L15_PRIVACY_FIRST and stop.'
# cwd: /tmp/cc-lane15-privacy-1781234662865
# exit 1
# stderr excerpt:
# [delegate] Error: Privacy acknowledgement required.
# This command will send your prompt to Claude Code as a background session.
# Workspace: /private/tmp/cc-lane15-privacy-1781234662865
# Re-run with --yes to acknowledge and proceed.

node '/Users/hongjunwu/Repositories/Git/cc-plugin-codex/marketplace/plugins/cc/scripts/cc.mjs' delegate --yes --json --name lane15-privacy-yes -- 'Reply exactly L15_PRIVACY_YES and stop.'
# exit 0
# jobId: job_mqad4pxx_86d35aba

node '/Users/hongjunwu/Repositories/Git/cc-plugin-codex/marketplace/plugins/cc/scripts/cc.mjs' delegate --json --name lane15-privacy-second -- 'Reply exactly L15_PRIVACY_SECOND and stop.'
# exit 0
# jobId: job_mqad4ukb_ce0a5db1
```

The second delegate in the same workspace succeeded without `--yes`, consistent with persisted ack.

## Cleanup Evidence

All jobs started by lane 15 are stopped according to their job records:

```text
job_mqacz101_ff815b66  stopped  /Users/hongjunwu/Repositories/Git/cc-plugin-codex  d9f14f45
job_mqacz6tb_dd927b32  stopped  /Users/hongjunwu/Repositories/Git/cc-plugin-codex  38a7b359
job_mqaczczj_39c553c0  stopped  /Users/hongjunwu/Repositories/Git/cc-plugin-codex  2c97373f
job_mqaczidr_c3c5e4df  stopped  /Users/hongjunwu/Repositories/Git/cc-plugin-codex  7c20c473
job_mqacznt8_2cf31251  stopped  /Users/hongjunwu/Repositories/Git/cc-plugin-codex  93431628
job_mqaczt7t_1a68a883  stopped  /Users/hongjunwu/Repositories/Git/cc-plugin-codex  0b01544c
job_mqaczyhr_550cecd3  stopped  /Users/hongjunwu/Repositories/Git/cc-plugin-codex  0a410dd8
job_mqad1l5k_3b475de6  stopped  /private/tmp/cc-lane15-isolation-1781234516871  2747fc35
job_mqad4pxx_86d35aba  stopped  /private/tmp/cc-lane15-privacy-1781234662865  efccb7b1
job_mqad4ukb_ce0a5db1  stopped  /private/tmp/cc-lane15-privacy-1781234662865  4932f08b
```

Process check after cleanup matched only the `ps`/`rg` commands themselves; no live lane 15 job command lines were present.

Cleanup stop commands returned exit `0` with parseable JSON and `"status": "stopped"` for each started job.

## Mini-Findings

- Medium: `--allow-edit` invalid-subcommand handling exits `2`, but the error text does not include the exact requested phrase `not applicable to this subcommand`.
- Low: `status --json` and `status --all --json` outputs were very large because this workspace already had many historical jobs; both still returned exit `0` and parseable JSON.
