# Lane 02: delegate regressions

Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`

Dispatcher: `node marketplace/plugins/cc/scripts/cc.mjs`

Skill read first:

```sh
sed -n '1,240p' marketplace/plugins/cc/skills/claude-delegate/SKILL.md
```

Dispatcher probe:

```sh
node marketplace/plugins/cc/scripts/cc.mjs --help
node marketplace/plugins/cc/scripts/cc.mjs status
```

No `status --all --json` command was used. Result polling used targeted `result <jobId> --json` commands with `sleep 3` between polling batches.

## Verdicts

- Read-only TODO delegate: PASS. Result contained `CLEAN-TODOS`.
- Analysis delegate: PASS on retry. Initial inspect-file analysis prompt reached `needs_input`; no-tool analysis retry returned `CLEAN-ANALYSIS`.
- F1 rapid no-name delegates: PASS. `CLEAN-RAPID-A/B/C` had distinct job IDs, session IDs, and PIDs; each returned its own marker.
- F2 named delegate: PASS. `shortId` was the 8-hex prefix of `sessionId`, and `sessionName` was suffixed as `my-test-session-abc-0e8f0c01`.
- F2b duplicate `--name dup-key-test`: FAIL. Job/session/PID uniqueness and suffixed names passed, but result isolation failed:
  - `DUP-ONE` job returned `DUP-TWO`.
  - `DUP-A` did not produce an exact `DUP-A` marker through targeted result polling before cleanup; stop output showed a non-exact clarification preview mentioning `DUP-A`.

## Jobs

| Case | Command | Job ID | shortId | sessionId | sessionName | PID | Result marker / status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TODO summary | `node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --json -- "Read-only task. Do not edit files. Summarize TODO comments in this repository in 3 bullets or fewer, and end with marker CLEAN-TODOS."` | `job_mqac0t5j_26d93bc7` | `24819004` | `24819004-c3e1-4160-8676-a9babacc591c` | `codex:cc-plugin-codex:mqac0qfw-75be0485` | `90799` | `CLEAN-TODOS` |
| Analysis initial | `node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --json -- "Analysis-only task. Do not edit files. Inspect marketplace/plugins/cc/scripts/cc.mjs at a high level and state whether delegate --name appears intended as a label, not a resume key. Keep it to 3 bullets and end with marker CLEAN-ANALYSIS."` | `job_mqac12ox_1232bae2` | `c221236c` | `c221236c-2fed-44ba-88e0-5c6fbd14f40f` | `codex:cc-plugin-codex:mqac0zwr-dad0c0c8` | `93024` | `needs_input`; stopped |
| F1 rapid A | `node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --json -- "Reply with exactly CLEAN-RAPID-A."` | `job_mqac1g38_ad2cb29d` | `40ddc8e6` | `40ddc8e6-0269-482d-9316-72dc360a0ee4` | `codex:cc-plugin-codex:mqac1d64-f51300e6` | `94792` | `CLEAN-RAPID-A` |
| F1 rapid B | `node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --json -- "Reply with exactly CLEAN-RAPID-B."` | `job_mqac1g94_740b3e2c` | `af0b1668` | `af0b1668-dfeb-44b9-b2ee-3d3ca2c82dd3` | `codex:cc-plugin-codex:mqac1dah-7ecb44b3` | `97194` | `CLEAN-RAPID-B` |
| F1 rapid C | `node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --json -- "Reply with exactly CLEAN-RAPID-C."` | `job_mqac1gj3_0d6d406e` | `436934db` | `436934db-60a9-4991-827d-8b236a0cd927` | `codex:cc-plugin-codex:mqac1dja-4227c9b6` | `97218` | `CLEAN-RAPID-C` |
| F2 named | `node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --json --name my-test-session-abc -- "reply CLEAN-NAME"` | `job_mqac23g4_03aeff0c` | `013c47c4` | `013c47c4-8461-49e2-9436-ac5eecea4fe2` | `my-test-session-abc-0e8f0c01` | `98495` | `CLEAN-NAME` |
| F2b pair DUP-ONE | `node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --json --name dup-key-test -- "reply DUP-ONE"` | `job_mqac2i4h_4d3e2965` | `dd3a7dec` | `dd3a7dec-3ccf-497a-b910-6246365a8598` | `dup-key-test-ff742519` | `940` | FAIL: returned `DUP-TWO` |
| F2b pair DUP-TWO | `node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --json --name dup-key-test -- "reply DUP-TWO"` | `job_mqac2i9f_4e34a487` | `39b5f2e3` | `39b5f2e3-2377-43e5-ad92-6fdb65ffdee1` | `dup-key-test-4732a5e5` | `3541` | `DUP-TWO` |
| F2b triple DUP-A | `node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --json --name dup-key-test -- "reply DUP-A"` | `job_mqac2wb3_1acbffa1` | `1d2109db` | `1d2109db-00df-4065-9c5d-a61c40ce9d9a` | `dup-key-test-691fec92` | `3617` | FAIL: targeted `result` stayed `running`; stop preview was not exact marker |
| F2b triple DUP-B | `node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --json --name dup-key-test -- "reply DUP-B"` | `job_mqac2wod_82fa01c1` | `0ce7082e` | `0ce7082e-8f00-4a29-81e8-19bbde736a26` | `dup-key-test-0d6f0300` | `5325` | `DUP-B` |
| F2b triple DUP-C | `node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --json --name dup-key-test -- "reply DUP-C"` | `job_mqac2woo_d237a0ff` | `b2f4b456` | `b2f4b456-3c43-4956-ba16-16f35d7953cc` | `dup-key-test-73607936` | `5655` | `DUP-C` |
| Analysis retry | `node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --json -- "No tools. Provide a brief conceptual analysis of why a delegate --name flag should be treated as a human-readable label rather than a resume key. Keep it to two bullets and end with marker CLEAN-ANALYSIS."` | `job_mqac4n7w_26cb462f` | `51accda0` | `51accda0-2ace-413a-969f-ce8a93142b04` | `codex:cc-plugin-codex:mqac4k6m-0dbeb5c9` | `13398` | `CLEAN-ANALYSIS` |

## Result Polling

Targeted result commands used:

```sh
sleep 3 && node marketplace/plugins/cc/scripts/cc.mjs result job_mqac0t5j_26d93bc7 --json
sleep 3 && node marketplace/plugins/cc/scripts/cc.mjs result job_mqac12ox_1232bae2 --json
sleep 3 && node marketplace/plugins/cc/scripts/cc.mjs result job_mqac1g38_ad2cb29d --json
sleep 3 && node marketplace/plugins/cc/scripts/cc.mjs result job_mqac1g94_740b3e2c --json
sleep 3 && node marketplace/plugins/cc/scripts/cc.mjs result job_mqac1gj3_0d6d406e --json
sleep 3 && node marketplace/plugins/cc/scripts/cc.mjs result job_mqac23g4_03aeff0c --json
sleep 3 && node marketplace/plugins/cc/scripts/cc.mjs result job_mqac2i4h_4d3e2965 --json
sleep 3 && node marketplace/plugins/cc/scripts/cc.mjs result job_mqac2i9f_4e34a487 --json
sleep 3 && node marketplace/plugins/cc/scripts/cc.mjs result job_mqac2wb3_1acbffa1 --json
sleep 3 && node marketplace/plugins/cc/scripts/cc.mjs result job_mqac2wod_82fa01c1 --json
sleep 3 && node marketplace/plugins/cc/scripts/cc.mjs result job_mqac2woo_d237a0ff --json
sleep 3 && node marketplace/plugins/cc/scripts/cc.mjs result job_mqac4n7w_26cb462f --json
```

Notable result outputs:

- `job_mqac12ox_1232bae2`: `Job ... is not complete yet (status: needs_input).`
- `job_mqac2i4h_4d3e2965`: prompt was `reply DUP-ONE`, but `resultText` was `DUP-TWO`.
- `job_mqac2wb3_1acbffa1`: repeated targeted result polls returned `Job ... is not complete yet (status: running).` Stop output later showed result preview `I see "DUP-A" ...`, not exact `DUP-A`.

## Cleanup

Stop commands used:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqac0t5j_26d93bc7 --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqac12ox_1232bae2 --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqac1g38_ad2cb29d --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqac1g94_740b3e2c --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqac1gj3_0d6d406e --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqac23g4_03aeff0c --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqac2i4h_4d3e2965 --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqac2i9f_4e34a487 --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqac2wb3_1acbffa1 --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqac2wod_82fa01c1 --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqac2woo_d237a0ff --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqac4n7w_26cb462f --json
```

Each stop command returned `ok: true` and job `status: "stopped"`.

Process check after cleanup:

```sh
ps -o pid,stat,command -p 90799,93024,94792,97194,97218,98495,940,3541,3617,5325,5655,13398
```

Output contained only the header, so none of the recorded PIDs remained running at cleanup time.
