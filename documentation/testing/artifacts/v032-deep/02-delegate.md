# Lane 02 - delegate depth test

Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`

Dispatcher: `node marketplace/plugins/cc/scripts/cc.mjs`

Skill read first: `sed -n '1,240p' marketplace/plugins/cc/skills/claude-delegate/SKILL.md` -> exit 0. Relevant rule confirmed: `--name` is documented as an idempotent session key; `--yes` must be user-requested and was requested for this lane.

No `--all --json` polling was used. Status snapshots below use current-workspace `status --json` piped through a local filter. Polling was spaced by command runtime plus explicit `sleep 5` before later status snapshots.

## Baseline Variations

### Variation A - read-only TODO summary

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes -- "Read-only task: summarize TODO comments in this repository. Do not edit files. Return concise findings."
```

Exit code: 0

Output excerpt:

```text
Claude job started
Job ID:         job_mqa3509i_96662ce7
Status:         running
Claude session: 673f41b1
Name:           codex:cc-plugin-codex:mqa34xl2-f928cc3b
```

Final observed status after cleanup:

```json
{"jobId":"job_mqa3509i_96662ce7","status":"stopped","sessionId":"673f41b1-cb46-4b6d-9d08-ba109e47519d","shortId":"673f41b1","pid":70554,"sessionName":"codex:cc-plugin-codex:mqa34xl2-f928cc3b","turnStatus":"needs_input","preview":"I'll search the repository for TODO comments. Let me scope this to the actual source (excluding the untracked `references/` clones which are external code)."}
```

Result command after stop:

```sh
node marketplace/plugins/cc/scripts/cc.mjs result job_mqa3509i_96662ce7
```

Exit code: 0

Output excerpt:

```text
Status:     stopped
Logs:       claude logs 673f41b1

I'll search the repository for TODO comments. Let me scope this to the actual source (excluding the untracked `references/` clones which are external code).
```

### Variation B - different analysis prompt

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes -- "Analysis task: inspect the CC plugin delegate behavior at a high level and report one implementation risk and one verification idea. Do not edit files."
```

Exit code: 0

Output excerpt:

```text
Claude job started
Job ID:         job_mqa350lo_2ec106e8
Status:         running
Claude session: c1714b27
Name:           codex:cc-plugin-codex:mqa34xt1-06e793c2
```

Final observed status after cleanup:

```json
{"jobId":"job_mqa350lo_2ec106e8","status":"stopped","sessionId":"c1714b27-8f77-48f8-aaaa-24b596372e1c","shortId":"c1714b27","pid":54167,"sessionName":"codex:cc-plugin-codex:mqa34xt1-06e793c2","turnStatus":"needs_input","preview":null}
```

Result command after stop:

```sh
node marketplace/plugins/cc/scripts/cc.mjs result job_mqa350lo_2ec106e8
```

Exit code: 0

Output excerpt:

```text
Status:     stopped
Logs:       claude logs c1714b27
```

## F1 - rapid parallel no-name delegates

Commands fired in parallel with no `--name`:

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes -- "CLEAN-RAPID-A"
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes -- "CLEAN-RAPID-B"
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes -- "CLEAN-RAPID-C"
```

Exit codes: all 0

Start output excerpts:

```text
A: Job ID job_mqa37epg_125e8c79, Claude session 2d815204, Name codex:cc-plugin-codex:mqa37br6-f957d4d8
B: Job ID job_mqa37esy_52f51e09, Claude session fb910140, Name codex:cc-plugin-codex:mqa37bxh-0241afec
C: Job ID job_mqa37eh7_38e64d06, Claude session de2a5dcc, Name codex:cc-plugin-codex:mqa37bie-da929a55
```

Filtered status command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs status --json | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const ids = new Set(process.argv.slice(1)); const data = JSON.parse(s); for (const job of data.jobs.filter(j => ids.has(j.jobId))) { console.log(JSON.stringify({ jobId: job.jobId, status: job.status, sessionId: job.claude?.sessionId, shortId: job.claude?.shortId, pid: job.claude?.pid, sessionName: job.claude?.sessionName, prompt: job.prompt?.summary, turnStatus: job.turns?.at(-1)?.status, preview: job.result?.finalMessagePreview || null })); } })' job_mqa37epg_125e8c79 job_mqa37esy_52f51e09 job_mqa37eh7_38e64d06
```

Exit code: 0

Status excerpts:

```json
{"jobId":"job_mqa37epg_125e8c79","status":"running","sessionId":"2d815204-0c63-4a48-9c5a-b6e140654db5","shortId":"2d815204","pid":72932,"sessionName":"codex:cc-plugin-codex:mqa37br6-f957d4d8","prompt":"CLEAN-RAPID-A","turnStatus":"queued","preview":"\"CLEAN-RAPID-A\" isn't a command or request I recognize..."}
{"jobId":"job_mqa37esy_52f51e09","status":"awaiting_followup","sessionId":"fb910140-5c10-4d46-b898-af6f4615ecfc","shortId":"fb910140","pid":72952,"sessionName":"codex:cc-plugin-codex:mqa37bxh-0241afec","prompt":"CLEAN-RAPID-B","turnStatus":"completed","preview":"CLEAN-RAPID-B This is delegate **B** reporting in clean..."}
{"jobId":"job_mqa37eh7_38e64d06","status":"running","sessionId":"de2a5dcc-7990-4608-826c-f909f03ffef7","shortId":"de2a5dcc","pid":67387,"sessionName":"codex:cc-plugin-codex:mqa37bie-da929a55","prompt":"CLEAN-RAPID-C","turnStatus":"queued","preview":"\"CLEAN-RAPID-C\" doesn't map to any command..."}
```

Distinctness check:

```text
Job IDs: distinct
claude.sessionId: distinct
claude.shortId: distinct
pid: distinct
sessionName: distinct autogenerated names
```

Pre-cleanup `result` command behavior:

```sh
node marketplace/plugins/cc/scripts/cc.mjs result job_mqa37epg_125e8c79
node marketplace/plugins/cc/scripts/cc.mjs result job_mqa37esy_52f51e09
node marketplace/plugins/cc/scripts/cc.mjs result job_mqa37eh7_38e64d06
```

Exit codes:

```text
A: 1 - [result] Error: Job job_mqa37epg_125e8c79 is not complete yet (status: running).
B: 0 - returned CLEAN-RAPID-B.
C: 1 - [result] Error: Job job_mqa37eh7_38e64d06 is not complete yet (status: running).
```

After stop, dispatcher `result` returned each job's own marker:

```text
A: Status stopped, output contains "CLEAN-RAPID-A".
B: Status stopped, output contains CLEAN-RAPID-B and says marker is CLEAN-RAPID-B.
C: Status stopped, output contains "CLEAN-RAPID-C".
```

F1 verdict: PASS for rapid no-name isolation. The three parallel delegates had distinct job IDs, session IDs, and PIDs, and each final/result text contained its own assigned marker. Note: A and C stayed `running` until stopped even though result files had been reconciled; `result` only worked for them after cleanup moved them to `stopped`.

## F2 - literal --name must not become shortId

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --name my-test-session-abc -- "reply CLEAN-NAME"
```

Exit code: 0

Output excerpt:

```text
Claude job started
Job ID:         job_mqa39xrq_845f5866
Status:         running
Claude session: 4bc92eda
Name:           my-test-session-abc
```

Filtered status excerpt:

```json
{"jobId":"job_mqa39xrq_845f5866","status":"awaiting_followup","sessionId":"4bc92eda-b129-4432-80ec-7e2cb388fe2b","shortId":"4bc92eda","pid":89104,"sessionName":"my-test-session-abc","prompt":"reply CLEAN-NAME","turnStatus":"completed","preview":"CLEAN-NAME"}
```

Result command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs result job_mqa39xrq_845f5866
```

Exit code: 0

Output excerpt:

```text
Status:     awaiting_followup
Logs:       claude logs 4bc92eda

CLEAN-NAME
```

F2 verdict: PASS. `claude.shortId` is `4bc92eda`, exactly 8 lowercase hex characters and equal to the `sessionId` prefix. It is not the literal name `my-test-session-abc`.

## F2b - duplicate --name idempotent resume

Commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --name dup-key-test -- "reply DUP-KEY-ONE"
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --name dup-key-test -- "reply DUP-KEY-TWO"
```

Exit codes: both 0

Start output excerpts:

```text
First:  Job ID job_mqa3e4oc_99014b9a, Claude session 10c7b501, Name dup-key-test
Second: Job ID job_mqa3edkm_1bbb0046, Claude session 7b568f05, Name dup-key-test
```

Filtered status excerpt before cleanup:

```json
{"jobId":"job_mqa3e4oc_99014b9a","status":"running","sessionId":"10c7b501-235e-400b-8dd6-35590c1963e2","shortId":"10c7b501","pid":13961,"sessionName":"dup-key-test","prompt":"reply DUP-KEY-ONE","turnStatus":"queued","preview":"DUP-KEY-TWO"}
{"jobId":"job_mqa3edkm_1bbb0046","status":"awaiting_followup","sessionId":"7b568f05-c1b7-425d-adfb-81d93e3358d7","shortId":"7b568f05","pid":14809,"sessionName":"dup-key-test","prompt":"reply DUP-KEY-TWO","turnStatus":"completed","preview":"DUP-KEY-TWO"}
```

Result commands after stop:

```sh
node marketplace/plugins/cc/scripts/cc.mjs result job_mqa3e4oc_99014b9a
node marketplace/plugins/cc/scripts/cc.mjs result job_mqa3edkm_1bbb0046
```

Exit codes: both 0

Output excerpts:

```text
job_mqa3e4oc_99014b9a: Status stopped, Logs claude logs 10c7b501, result DUP-KEY-TWO
job_mqa3edkm_1bbb0046: Status stopped, Logs claude logs 7b568f05, result DUP-KEY-TWO
```

F2b verdict: FAIL against the expected idempotent-resume behavior. This was not confirmed as a not-bug. The two invocations with the same `--name dup-key-test` produced different job IDs, different `claude.sessionId` values, different short IDs, and different PIDs. The first job's prompt was `reply DUP-KEY-ONE` but its preview/result became `DUP-KEY-TWO`, which is possible cross-name-key contamination or duplicate-key routing confusion.

## Cleanup

Stop commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa3509i_96662ce7 --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa350lo_2ec106e8 --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa37epg_125e8c79 --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa37esy_52f51e09 --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa37eh7_38e64d06 --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa39xrq_845f5866 --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa3e4oc_99014b9a --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa3edkm_1bbb0046 --json
```

Exit codes: all 0

Final filtered status command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs status --json | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const ids = new Set(process.argv.slice(1)); const data = JSON.parse(s); for (const job of data.jobs.filter(j => ids.has(j.jobId))) { console.log(JSON.stringify({ jobId: job.jobId, status: job.status, sessionId: job.claude?.sessionId, shortId: job.claude?.shortId, pid: job.claude?.pid, sessionName: job.claude?.sessionName, prompt: job.prompt?.summary, turnStatus: job.turns?.at(-1)?.status, preview: job.result?.finalMessagePreview || null })); } })' job_mqa3509i_96662ce7 job_mqa350lo_2ec106e8 job_mqa37epg_125e8c79 job_mqa37esy_52f51e09 job_mqa37eh7_38e64d06 job_mqa39xrq_845f5866 job_mqa3e4oc_99014b9a job_mqa3edkm_1bbb0046
```

Exit code: 0

Final status excerpt:

```text
job_mqa3509i_96662ce7 stopped
job_mqa350lo_2ec106e8 stopped
job_mqa37epg_125e8c79 stopped
job_mqa37esy_52f51e09 stopped
job_mqa37eh7_38e64d06 stopped
job_mqa39xrq_845f5866 stopped
job_mqa3e4oc_99014b9a stopped
job_mqa3edkm_1bbb0046 stopped
```

No commit made.
