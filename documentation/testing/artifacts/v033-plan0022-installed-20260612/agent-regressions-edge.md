# cc v0.3.3 installed dispatcher regression/edge lane - 2026-06-12

Dispatcher under test: `/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs`

Repo workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex` except the explicit `/tmp` workspace-isolation and privacy cases.

No commits made. No source files edited.

## Environment

- `claude --version`: `2.1.175 (Claude Code)`
- `codex --version`: `codex-cli 0.137.0`
- OS: `macOS 26.5.1 (25F80) arm64`
- Installed plugin: `cc@cc-plugin-codex-local installed, enabled 0.3.3`
- Setup command: `node .../cc.mjs setup --json`
- Setup exit: `0`
- Setup status: `warn`, with only the documented `claude-bg-flag` caveat; background daemon, auth, logs, transcript path, `agents --json`, and workflow probes were `ok`.

## Summary

| Item | Verdict | Notes |
| --- | --- | --- |
| F1 rapid no-name delegates isolated | PASS | Three concurrent no-name delegates returned their own markers with distinct `sessionId` and `pid`. |
| F2 ID-shaped `--name` shortId | PASS | `claude.shortId` stayed a real 8-char session hex prefix. |
| F2b reused `--name` sample | PASS | No cross observed. If it had crossed, it would be recorded as the known upstream symptom, not a plugin blocker. |
| F3 `status <jobId>` rejection | PASS | Real and bogus positional IDs both exited 2 with `result <jobId>` / `status --all` guidance. |
| `--allow-edit` read-only/not-applicable rejections | PASS | All requested subcommands exited 2 and included `not applicable`; review paths also said read-only. |
| Empty/whitespace/non-TTY no-prompt delegate validation | PASS | All exited 2 with prompt-required error and returned no job ID. |
| Workspace isolation from `/tmp` | PASS | `/tmp` job absent from repo-local status and present with `status --all`. |
| `--json` parseability sweep | PASS | Tested success and cheap validation/error paths; all selected outputs parsed as JSON. |
| Privacy disclosure fresh workspace | FAIL/PARTIAL | Non-TTY fresh workspace correctly rejected with disclosure text. TTY fresh workspace without `--yes` launched immediately and printed no disclosure/prompt text. |
| Cleanup | PASS | Every job started in this lane was stopped; final global status showed no active started jobs. |

## Regression Details

### F1 - rapid no-name delegates isolated

Commands launched rapidly in parallel:

```sh
node .../cc.mjs delegate --yes --json -- "reply with exactly CLEAN-RAPID-A"
node .../cc.mjs delegate --yes --json -- "reply with exactly CLEAN-RAPID-B"
node .../cc.mjs delegate --yes --json -- "reply with exactly CLEAN-RAPID-C"
```

| Marker | Start exit | Result exit | Job ID | shortId | sessionId | pid | resultText |
| --- | ---: | ---: | --- | --- | --- | ---: | --- |
| CLEAN-RAPID-A | 0 | 0 | `job_mqaisk5x_a81d5d88` | `c72f7fbd` | `c72f7fbd-e6f6-4b10-b1de-f5b5b2b3d7f1` | 43062 | `CLEAN-RAPID-A` |
| CLEAN-RAPID-B | 0 | 0 | `job_mqaisk1h_f2d86037` | `18cf2ce3` | `18cf2ce3-fb01-4d31-a748-de5a5e7313c9` | 42952 | `CLEAN-RAPID-B` |
| CLEAN-RAPID-C | 0 | 0 | `job_mqaisjqv_7db3c4d9` | `8a9ec48f` | `8a9ec48f-c3a1-4c23-a2d3-7232882f9436` | 40783 | `CLEAN-RAPID-C` |

All three final states were `awaiting_followup` before cleanup.

### F2 - ID-shaped `--name` shortId remains real 8-char hex

Command:

```sh
node .../cc.mjs delegate --yes --json --name my-test-session-abc -- "reply CLEAN-NAME"
```

Start exit `0`; result exit `0`.

- Job ID: `job_mqait3kp_dd95221f`
- `claude.shortId`: `a17fb74f`
- `claude.sessionId`: `a17fb74f-e56d-45e8-af33-df6ee0b2c6d5`
- `claude.sessionName`: `my-test-session-abc-547bd891`
- `pid`: `44011`
- `resultText`: `CLEAN-NAME`

Verdict: PASS. `shortId` is the 8-char hex session prefix, not the ID-shaped name.

### F2b - reused `--name` sample

Commands:

```sh
node .../cc.mjs delegate --yes --json --name dup-key-test -- "reply with exactly DUP-ONE"
node .../cc.mjs delegate --yes --json --name dup-key-test -- "reply with exactly DUP-TWO"
```

| Prompt marker | Start exit | Result exit | Job ID | sessionName | sessionId | pid | resultText |
| --- | ---: | ---: | --- | --- | --- | ---: | --- |
| DUP-ONE | 0 | 0 | `job_mqaitj91_a2a05766` | `dup-key-test-0b06b370` | `25cf1019-2bab-4b1b-9e45-d8d92e523f36` | 45463 | `DUP-ONE` |
| DUP-TWO | 0 | 0 | `job_mqaitiyx_6bf865b2` | `dup-key-test-fab4740a` | `a4fc0689-6412-46b5-92c2-909cf8b0b2fc` | 44534 | `DUP-TWO` |

Verdict: PASS. No upstream cross-contamination symptom observed in this run.

### F3 - `status <jobId>` and bogus ID rejected

```sh
node .../cc.mjs status job_mqait3kp_dd95221f
```

Exit `2`:

```text
[status] Error: cc status does not take a job id (got "job_mqait3kp_dd95221f"). For one job use: cc result job_mqait3kp_dd95221f  (or cc status --all to list every workspace).
```

```sh
node .../cc.mjs status job_bogus_not_real_12345678
```

Exit `2`:

```text
[status] Error: cc status does not take a job id (got "job_bogus_not_real_12345678"). For one job use: cc result job_bogus_not_real_12345678  (or cc status --all to list every workspace).
```

Verdict: PASS. No full-list fallback occurred.

## Edge Cases

### `--allow-edit` not applicable/read-only

All commands exited `2`.

| Command | Message |
| --- | --- |
| `node .../cc.mjs fork --allow-edit --yes -- "edge allow edit fork"` | `[fork] Error: --allow-edit is not applicable to $claude-fork.` |
| `node .../cc.mjs workflow --allow-edit --yes -- "edge allow edit workflow"` | `[workflow] Error: --allow-edit is not applicable to $claude-workflow.` |
| `node .../cc.mjs goal --allow-edit --yes -- "edge allow edit goal"` | `[goal] Error: --allow-edit is not applicable to $claude-goal.` |
| `node .../cc.mjs batch --allow-edit --yes -- "edge allow edit batch"` | `[batch] Error: --allow-edit is not applicable to $claude-batch.` |
| `node .../cc.mjs review job_mqait3kp_dd95221f --allow-edit --yes` | `[review] Error: --allow-edit is not applicable to review skills. Reviews are read-only.` |
| `node .../cc.mjs adversarial-review job_mqait3kp_dd95221f --allow-edit --yes` | `[adversarial-review] Error: --allow-edit is not applicable to review skills. Reviews are read-only.` |
| `node .../cc.mjs deep-research --allow-edit --yes -- "edge allow edit deep research"` | `[deep-research] Error: --allow-edit is not applicable to $claude-deep-research.` |

Verdict: PASS.

### Delegate prompt validation

| Command | Exit | Message |
| --- | ---: | --- |
| `node .../cc.mjs delegate --yes -- ""` | 2 | `[delegate] Error: prompt is required: cc delegate -- "<prompt>"` |
| `node .../cc.mjs delegate --yes -- "   \t  "` | 2 | `[delegate] Error: prompt is required: cc delegate -- "<prompt>"` |
| `printf 'x\n' \| node .../cc.mjs delegate --yes` | 2 | `[delegate] Error: prompt is required: cc delegate -- "<prompt>"` |

Verdict: PASS. No job ID was returned for any prompt-validation rejection.

### Workspace isolation from `/tmp`

Command:

```sh
tmpdir=$(mktemp -d /tmp/cc-edge-isolation-XXXXXX)
cd "$tmpdir" && node .../cc.mjs delegate --yes --json -- "reply with exactly TMP-ISOLATION"
```

Start exit `0`.

- Temp dir printed by shell: `/tmp/cc-edge-isolation-C1br1b`
- Recorded workspace root: `/private/tmp/cc-edge-isolation-C1br1b`
- Job ID: `job_mqaiv1fl_65a54205`
- `sessionId`: `3fee229c-8e93-45af-9326-ca55a9c09bad`
- `pid`: `46149`
- `resultText`: `TMP-ISOLATION`

Status checks from the repo workdir:

| Command | Exit | JSON parse | Count | Contains temp job |
| --- | ---: | --- | ---: | --- |
| `node .../cc.mjs status --json` | 0 | yes | 252 | false |
| `node .../cc.mjs status --all --json` | 0 | yes | 262 | true |

Verdict: PASS.

### JSON parseability sweep

The sweep used success paths where already available and cheap validation/error paths to avoid starting extra jobs.

| Label | Command shape | Exit | JSON parsed |
| --- | --- | ---: | --- |
| setup-json | `setup --json` | 0 | yes |
| delegate-empty-json | `delegate --yes --json -- ""` | 2 | yes |
| status-json-large-buffer | `status --json` | 0 | yes |
| status-all-json-large-buffer | `status --all --json` | 0 | yes |
| result-json | `result job_mqait3kp_dd95221f --json` | 0 | yes |
| stop-bogus-json | `stop job_bogus_not_real_12345678 --json` | 1 | yes |
| followup-bogus-json | `followup job_bogus_not_real_12345678 --yes --json -- "json parse edge"` | 1 | yes |
| review-bogus-json | `review job_bogus_not_real_12345678 --yes --json` | 1 | yes |
| adversarial-review-bogus-json | `adversarial-review job_bogus_not_real_12345678 --yes --json` | 1 | yes |
| workflow-allow-edit-json | `workflow --allow-edit --yes --json -- "json parse edge"` | 2 | yes |
| goal-allow-edit-json | `goal --allow-edit --yes --json -- "json parse edge"` | 2 | yes |
| fork-allow-edit-json | `fork --allow-edit --yes --json -- "json parse edge"` | 2 | yes |
| batch-allow-edit-json | `batch --allow-edit --yes --json -- "json parse edge"` | 2 | yes |
| deep-research-allow-edit-json | `deep-research --allow-edit --yes --json -- "json parse edge"` | 2 | yes |
| workflows-json | `workflows --json` | 0 | yes |
| workflows-bogus-json | `workflows job_bogus_not_real_12345678 --json` | 1 | yes |

Verdict: PASS.

### Privacy disclosure fresh workspace

TTY fresh workspace commands, intentionally without `--yes`:

```sh
tmpdir=$(mktemp -d /tmp/cc-privacy-XXXXXX)
cd "$tmpdir"
node .../cc.mjs delegate --json -- "reply with exactly PRIVACY-FIRST"
node .../cc.mjs delegate --json -- "reply with exactly PRIVACY-SECOND"
```

Observed temp dir: `/tmp/cc-privacy-OmMnb7`, recorded as `/private/tmp/cc-privacy-OmMnb7`.

| Marker | Exit | Job ID | sessionId | pid | resultText | Prompt/disclosure seen |
| --- | ---: | --- | --- | ---: | --- | --- |
| PRIVACY-FIRST | 0 | `job_mqaixkmo_1074287e` | `bfe6f2b6-5c04-4df9-932e-b617cc507755` | 51576 | `PRIVACY-FIRST` | no |
| PRIVACY-SECOND | 0 | `job_mqaiy1xv_f54f6786` | `8ec30ef1-2d98-468c-8540-921b5197fc38` | 56730 | `PRIVACY-SECOND` | no |

Non-TTY fresh workspace command, also without `--yes`:

```sh
tmpdir=$(mktemp -d /tmp/cc-privacy-nontty-XXXXXX)
cd "$tmpdir"
node .../cc.mjs delegate --json -- "reply with exactly PRIVACY-NONTTY"
```

Node command exit `1`; JSON parsed and contained:

```text
Privacy acknowledgement required.

This command will send your prompt to Claude Code as a background session.
Claude Code will have access to files in the current workspace.

Workspace: /private/tmp/cc-privacy-nontty-9ukXmm

Re-run with --yes to acknowledge and proceed.
```

Verdict: FAIL/PARTIAL. The non-TTY disclosure rejection works, but the TTY fresh workspace did not show any privacy disclosure or acknowledgement prompt before starting jobs. This is the only issue found in this lane.

## Findings

### Blocker

None.

### High

None.

### Medium

- Privacy disclosure prompt not shown for a fresh TTY workspace without `--yes`. The first delegate in `/tmp/cc-privacy-OmMnb7` exited `0`, created `job_mqaixkmo_1074287e`, and printed only the normal JSON job payload. The second no-`--yes` delegate in the same workspace also exited `0`. Non-TTY fresh workspace rejection did include the disclosure text and exited `1`.

### Low

None.

## Cleanup

Explicit stop commands were run for every job started in this lane:

```sh
node .../cc.mjs stop <jobId> --all --json
```

Stopped jobs:

- `job_mqaisk5x_a81d5d88`
- `job_mqaisk1h_f2d86037`
- `job_mqaisjqv_7db3c4d9`
- `job_mqait3kp_dd95221f`
- `job_mqaitj91_a2a05766`
- `job_mqaitiyx_6bf865b2`
- `job_mqaiv1fl_65a54205`
- `job_mqaixkmo_1074287e`
- `job_mqaiy1xv_f54f6786`

Final verification:

```sh
node .../cc.mjs status --all --json
```

Exit `0`, JSON parsed, global job count `272`. Status for every job listed above was `stopped`; `activeStartedJobs` was `[]`.
