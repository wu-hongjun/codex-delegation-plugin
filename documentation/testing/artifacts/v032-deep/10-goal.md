# Lane 10: `$claude-goal` depth test

Date: 2026-06-11
Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`
Dispatcher: `node marketplace/plugins/cc/scripts/cc.mjs`
Plugin version observed: `0.3.2`
Claude Code observed: `2.1.173 (Claude Code)`

## Verdict

Pass with observations. All three bounded goal sessions started with `--yes` and unique `v032deep-goal-` names. Variation C returned parseable `--json` output. A focused `status --json` parse after a wait longer than 10 seconds matched all three jobs, but the selected job objects did not expose `goal_status` or `goalStatus` fields. The goal runtime did not show delegated fan-out/subagent evidence in dispatcher status metadata or in the lane job records/results. All jobs started by this lane were stopped before finishing.

## Skill and Help Checks

Read first:

```sh
sed -n '1,220p' marketplace/plugins/cc/skills/claude-goal/SKILL.md
```

Exit code: `0`.

Relevant excerpt:

```text
This skill starts a Claude Code background session with /goal <condition>
injected as the opening slash command. The runtime tracks goal-completion
automatically; no interactive approval dialog is required.
```

Help probes:

```sh
node marketplace/plugins/cc/scripts/cc.mjs goal --help
node marketplace/plugins/cc/scripts/cc.mjs status --help
node marketplace/plugins/cc/scripts/cc.mjs stop --help
```

Exit codes: all `0`.

Relevant excerpt:

```text
goal [flags] -- <condition>               Start a Claude Code background session with a /goal condition
status [--all] [--json]                   List jobs for current workspace
stop <jobId> [--all] [--json]             Stop a running job
```

Preflight predicate check:

```sh
test -f README.md; printf 'README.md exit=%s\n' "$?"; test -f package.json; printf 'package.json exit=%s\n' "$?"; test -f marketplace/plugins/cc/skills/claude-goal/SKILL.md; printf 'claude-goal SKILL.md exit=%s\n' "$?"
```

Exit code: `0`.

```text
README.md exit=0
package.json exit=0
claude-goal SKILL.md exit=0
```

## Goal Starts

Variation A, bounded README existence goal:

```sh
node marketplace/plugins/cc/scripts/cc.mjs goal --yes --name v032deep-goal-10a-readme -- "Confirm README.md exists in the current workspace, then emit exactly V032_GOAL_10A_README_CONFIRMED once and stop."
```

Exit code: `0`.

```text
Claude job started
Job ID:         job_mqa3hqji_23330b51
Status:         running
Claude session: 36eb47fa
Name:           v032deep-goal-10a-readme
```

Variation B, different bounded package existence goal:

```sh
node marketplace/plugins/cc/scripts/cc.mjs goal --yes --name v032deep-goal-10b-package -- "Confirm package.json exists in the current workspace, then emit exactly V032_GOAL_10B_PACKAGE_CONFIRMED once and stop."
```

Exit code: `0`.

```text
Claude job started
Job ID:         job_mqa3i154_ffae7306
Status:         running
Claude session: 958cbbf8
Name:           v032deep-goal-10b-package
```

Variation C, JSON parseable goal:

```sh
node marketplace/plugins/cc/scripts/cc.mjs goal --json --yes --name v032deep-goal-10c-json -- "Confirm marketplace/plugins/cc/skills/claude-goal/SKILL.md exists in the current workspace, then emit exactly V032_GOAL_10C_SKILL_CONFIRMED once and stop."
```

Exit code: `0`.

JSON parse evidence:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqa3iaul_cadf617c",
    "status": "running",
    "codex": {
      "pluginVersion": "0.3.2"
    },
    "claude": {
      "shortId": "fe53a60b",
      "sessionName": "v032deep-goal-10c-json"
    },
    "turns": [
      {
        "status": "queued"
      }
    ]
  }
}
```

The `goal --json` output parsed successfully as JSON and exposed the expected job object.

## Status, Goal Status, and Fan-Out Evidence

Poll command, focused to the three lane jobs after all starts:

```sh
node marketplace/plugins/cc/scripts/cc.mjs status --json | node -e '
let s = "";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const ids = new Set(["job_mqa3hqji_23330b51", "job_mqa3i154_ffae7306", "job_mqa3iaul_cadf617c"]);
  const data = JSON.parse(s);
  const wanted = data.jobs.filter(j => ids.has(j.jobId));
  function findKeys(obj, rx, path = "") {
    const out = [];
    if (!obj || typeof obj !== "object") return out;
    for (const [k, v] of Object.entries(obj)) {
      const p = path ? `${path}.${k}` : k;
      if (rx.test(k)) out.push({ path: p, value: (v == null || typeof v !== "object") ? v : `[${Array.isArray(v) ? "array" : "object"}]` });
      if (v && typeof v === "object") out.push(...findKeys(v, rx, p));
    }
    return out;
  }
  console.log(JSON.stringify({
    ok: data.ok,
    matched: wanted.length,
    jobs: wanted.map(j => ({
      jobId: j.jobId,
      status: j.status,
      sessionName: j.claude?.sessionName,
      shortId: j.claude?.shortId,
      turnStatus: j.turns?.at(-1)?.status,
      promptSummary: j.prompt?.summary,
      finalPreview: j.result?.finalMessagePreview || null,
      goalStatusFields: findKeys(j, /^(goal_status|goalStatus)$/),
      fanoutOrSubagentFields: findKeys(j, /(fan.?out|sub.?agent|delegate|delegated|child|children|fork|parallel)/i).map(x => x.path)
    }))
  }, null, 2));
});
'
```

Exit code: `0`. The command was allowed to wait more than 10 seconds before output (`status --json` scanned the full workspace job store).

Parsed excerpts:

```json
{
  "ok": true,
  "matched": 3,
  "jobs": [
    {
      "jobId": "job_mqa3hqji_23330b51",
      "status": "running",
      "sessionName": "v032deep-goal-10a-readme",
      "shortId": "36eb47fa",
      "turnStatus": "queued",
      "finalPreview": "README.md exists in the workspace. V032_GOAL_10A_README_CONFIRMED",
      "goalStatusFields": [],
      "fanoutOrSubagentFields": []
    },
    {
      "jobId": "job_mqa3i154_ffae7306",
      "status": "running",
      "sessionName": "v032deep-goal-10b-package",
      "shortId": "958cbbf8",
      "turnStatus": "queued",
      "finalPreview": "`package.json` exists in the workspace root. V032_GOAL_10B_PACKAGE_CONFIRMED",
      "goalStatusFields": [],
      "fanoutOrSubagentFields": []
    },
    {
      "jobId": "job_mqa3iaul_cadf617c",
      "status": "awaiting_followup",
      "sessionName": "v032deep-goal-10c-json",
      "shortId": "fe53a60b",
      "turnStatus": "completed",
      "finalPreview": "V032_GOAL_10C_SKILL_CONF...",
      "goalStatusFields": [],
      "fanoutOrSubagentFields": []
    }
  ]
}
```

Goal-status finding: no `goal_status` or `goalStatus` field was present for any of the three selected jobs in the status JSON.

Fan-out/subagent record search:

```sh
rg -ni "fan.?out|sub.?agent|delegate|delegated|fork|parallel|Task" /Users/hongjunwu/.codex/cc-plugin-codex/jobs/job_mqa3hqji_23330b51* /Users/hongjunwu/.codex/cc-plugin-codex/jobs/job_mqa3i154_ffae7306* /Users/hongjunwu/.codex/cc-plugin-codex/jobs/job_mqa3iaul_cadf617c*
```

Exit code: `1`; no matches. Combined with empty `fanoutOrSubagentFields`, this records no delegated fan-out/subagent evidence for goal runtime jobs.

## Cleanup

Stop commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa3hqji_23330b51 --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa3i154_ffae7306 --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa3iaul_cadf617c --json
```

Exit codes: all `0`.

Stop excerpts:

```json
{
  "jobId": "job_mqa3hqji_23330b51",
  "status": "stopped",
  "sessionName": "v032deep-goal-10a-readme",
  "finalPreview": "README.md exists in the workspace. V032_GOAL_10A_README_CONFIRMED"
}
{
  "jobId": "job_mqa3i154_ffae7306",
  "status": "stopped",
  "sessionName": "v032deep-goal-10b-package",
  "finalPreview": "V032_GOAL_10B_PACKAGE_CONFIRMED"
}
{
  "jobId": "job_mqa3iaul_cadf617c",
  "status": "stopped",
  "sessionName": "v032deep-goal-10c-json",
  "finalPreview": "V032_GOAL_10C_SKILL_CONF..."
}
```

Final focused cleanup status command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs status --json | node -e '
let s = "";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const ids = new Set(["job_mqa3hqji_23330b51", "job_mqa3i154_ffae7306", "job_mqa3iaul_cadf617c"]);
  const data = JSON.parse(s);
  const wanted = data.jobs.filter(j => ids.has(j.jobId));
  console.log(JSON.stringify({ ok: data.ok, matched: wanted.length, jobs: wanted.map(j => ({ jobId: j.jobId, status: j.status, sessionName: j.claude?.sessionName, turnStatus: j.turns?.at(-1)?.status, finalPreview: j.result?.finalMessagePreview || null })) }, null, 2));
});
'
```

Exit code: `0`.

```json
{
  "ok": true,
  "matched": 3,
  "jobs": [
    {
      "jobId": "job_mqa3hqji_23330b51",
      "status": "stopped",
      "sessionName": "v032deep-goal-10a-readme",
      "turnStatus": "queued",
      "finalPreview": "README.md exists in the workspace. V032_GOAL_10A_README_CONFIRMED"
    },
    {
      "jobId": "job_mqa3i154_ffae7306",
      "status": "stopped",
      "sessionName": "v032deep-goal-10b-package",
      "turnStatus": "queued",
      "finalPreview": "V032_GOAL_10B_PACKAGE_CONFIRMED"
    },
    {
      "jobId": "job_mqa3iaul_cadf617c",
      "status": "stopped",
      "sessionName": "v032deep-goal-10c-json",
      "turnStatus": "completed",
      "finalPreview": "V032_GOAL_10C_SKILL_CONF..."
    }
  ]
}
```

No commit was made.
