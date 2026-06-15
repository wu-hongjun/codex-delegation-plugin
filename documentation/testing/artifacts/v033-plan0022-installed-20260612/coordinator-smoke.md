# Coordinator Smoke — installed cc plugin after Plan 0022

Workspace: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`

Dispatcher under test:
`/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs`

## Install Verification

- `codex plugin remove cc@cc-plugin-codex-local` then `codex plugin add cc@cc-plugin-codex-local` refreshed cache `~/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3`.
- Cache contains `shouldReconcileForStatusList` in `scripts/cc.mjs`.
- Cache contains `completionEvidenceProducedFromCurrentArtifacts` and the `state=blocked/output=null` comment in bundled runtime `dist/reconciler.js`.
- `setup --json` exited 0 with aggregate `warn` only for the known `claude-bg-flag` caveat; delegate and followup capabilities both `ok`.

## Follow-up State Smoke

Delegate:

```sh
node ~/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs delegate --yes --json --name p22-coordinator-followup -- "Plan 0022 coordinator smoke. Do not edit files. Reply exactly: P22_COORD_INITIAL_READY"
```

Evidence:

- Job: `job_mqairgyg_9e4606f5`
- Session: `84ee28c7`
- Session name: `p22-coordinator-followup-772d7bb8`
- Initial status from delegate output: `running`

Result poll:

```sh
node ~/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs result job_mqairgyg_9e4606f5 --json
```

Evidence:

- Status reconciled to `awaiting_followup`.
- Result text: `P22_COORD_INITIAL_READY`.
- Turn 0 status: `completed`.

Follow-up:

```sh
node ~/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs followup job_mqairgyg_9e4606f5 --yes --json -- "Do not edit files. Reply exactly: P22_COORD_FOLLOWUP_OK"
```

Evidence:

- Command exited 0.
- Immediate JSON preview was one turn stale (`P22_COORD_INITIAL_READY`), matching known behavior.
- Subsequent result poll returned status `awaiting_followup`, turn 1 `completed`, and result text `P22_COORD_FOLLOWUP_OK`.

Cleanup:

- `stop job_mqairgyg_9e4606f5 --json` exited 0 and set the coordinator smoke job to `stopped`.

## Coordinator Add-on Checks

### Privacy Disclosure PTY Confirmation

The regression/edge lane reported that a fresh TTY workspace without `--yes` launched immediately instead of showing the privacy acknowledgement. I confirmed that with a real PTY:

```sh
tmpdir=$(mktemp -d /tmp/cc-privacy-verify-tty-XXXXXX)
cd "$tmpdir"
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs delegate --json -- "reply with exactly PRIVACY-VERIFY-TTY"
```

Evidence:

- Temp workspace: `/tmp/cc-privacy-verify-tty-FoEN9i` recorded as `/private/tmp/cc-privacy-verify-tty-FoEN9i`.
- The command printed no acknowledgement text and returned a normal JSON start payload.
- Job: `job_mqaja4vx_8c43f237`
- Session: `01315a23-3db8-4deb-be83-203d9ae5dc2e`
- Initial status: `running`
- `stop job_mqaja4vx_8c43f237 --all --json` exited 0 and set the verifier job to `stopped`.

### Workflow Review Gate Check

The followup/review lane covered delegate review, review `--json`, and adversarial variants. I added one workflow-job review probe for the ticket's workflow-review variation:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs workflow --yes --name p22-review-workflow-gated-verify --effort low --json -- "Plan 0022 workflow review gated smoke. Do not edit files. Prepare a tiny read-only survey plan of marketplace/plugins/cc/skills/claude-workflow/SKILL.md and then wait at approval if required."
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs review job_mqajcn45_d7cce184 --yes --json
```

Evidence:

- Workflow job: `job_mqajcn45_d7cce184`
- Session: `3e191b84-2694-4ee6-b354-5800b19231d1`
- Review exited 1 with parseable JSON: `Job job_mqajcn45_d7cce184 is running; wait for $claude-status to show awaiting_followup before running $claude-review.`
- `stop job_mqajcn45_d7cce184 --json` exited 0 and set the workflow-review probe job to `stopped`.

### Final Cleanup Sweep

Final exact-ID sweep:

```text
statusAllCount=283
runJobCount=32
activeRunJobCount=0
```

## Plan 0022 Polish Recheck

After the privacy finding above was fixed, the local plugin cache was refreshed again:

```sh
codex plugin remove cc@cc-plugin-codex-local
codex plugin marketplace add "$(pwd)/marketplace"
codex plugin add cc@cc-plugin-codex-local
```

Installed cache under test:
`/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs`

Cache evidence:

- Cached `scripts/cc.mjs` contains `ensureWorkspaceAck`.
- Cached `scripts/cc.mjs` contains `Type yes to acknowledge and proceed, or no to cancel.`
- `setup --json` exited 0 with `status:"warn"` only for `claude-bg-flag`; delegate/followup capabilities remained `ok`.

TTY decline smoke:

```sh
tmpdir=$(mktemp -d /tmp/cc-privacy-polish-decline-XXXXXX)
cd "$tmpdir"
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs delegate --json -- "reply with exactly P22_PRIVACY_DECLINE_SHOULD_NOT_RUN"
```

Evidence:

- Temp workspace: `/tmp/cc-privacy-polish-decline-YyZCTY`, recorded as `/private/tmp/cc-privacy-polish-decline-YyZCTY`.
- The command printed the privacy acknowledgement before starting any job.
- Answered `no`.
- Command exited 1 with JSON error `Privacy acknowledgement declined`.
- No job was created by the decline path.

TTY accept smoke:

```sh
tmpdir=$(mktemp -d /tmp/cc-privacy-polish-accept-XXXXXX)
cd "$tmpdir"
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs delegate --json -- "reply with exactly P22_PRIVACY_ACCEPT_OK"
```

Evidence:

- Temp workspace: `/tmp/cc-privacy-polish-accept-hfQ2SX`, recorded as `/private/tmp/cc-privacy-polish-accept-hfQ2SX`.
- The command printed the privacy acknowledgement before starting any job.
- Answered `yes`.
- Command exited 0 and created `job_mqap6jx2_70413b0d`, session `867dae84-1316-41c6-a821-e1fd689a3c11`.
- `stop job_mqap6jx2_70413b0d --all --json` exited 0 and set the job to `stopped`.
- Final exact-ID status confirmed `job_mqap6jx2_70413b0d stopped 867dae84`.
