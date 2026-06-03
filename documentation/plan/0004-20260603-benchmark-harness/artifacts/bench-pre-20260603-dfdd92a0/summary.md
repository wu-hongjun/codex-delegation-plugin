# Plan 0004 benchmark summary

| Field | Value |
|---|---|
| runId | 4904d374 |
| date | 20260603 |
| claudeCodeVersion | 2.1.150 (Claude Code) |
| nodeVersion | v25.8.2 |
| platform | darwin |
| cutoverPhase | pre |
| runsPerCell | 5 |

## Per-flow latency

| Flow | Tasks | Median latency (ms) | IQR (ms) | Successful runs |
|---|---|---|---|---|
| delegate | 3 | 41762 | 31380-67040 | 15/15 |
| delegate-followup | 3 | 54636 | 30338-74872 | 15/15 |
| delegate-review | 3 | 59883 | 31155-76718 | 13/15 |
| delegate-adversarial | 3 | 70313 | 31021-91490 | 15/15 |

## Per-task breakdown

### Task: summarize-todos

| Flow | Median latency (ms) | Errors |
|---|---|---|
| delegate | 35610 | 0 |
| delegate-followup | 54636 | 0 |
| delegate-review | 59883 | 1 (review_failed) |
| delegate-adversarial | 70313 | 0 |

### Task: rename-variable

| Flow | Median latency (ms) | Errors |
|---|---|---|
| delegate | 75485 | 0 |
| delegate-followup | 81458 | 0 |
| delegate-review | 91694 | 1 (review_failed) |
| delegate-adversarial | 99800 | 0 |

### Task: answer-question

| Flow | Median latency (ms) | Errors |
|---|---|---|
| delegate | 15330 | 0 |
| delegate-followup | 28589 | 0 |
| delegate-review | 29188 | 0 |
| delegate-adversarial | 29235 | 0 |

## Review Verdict Agreement Matrix

| Task | delegate-review: pass | delegate-review: pass_with_findings | delegate-adversarial: pass | delegate-adversarial: pass_with_findings |
| --- | --- | --- | --- | --- |
| summarize-todos | 2 | 2 | 4 | 1 |
| rename-variable | 0 | 4 | 2 | 3 |
| answer-question | 3 | 2 | 5 | 0 |

## Token Usage Summary

| Flow | Total input tokens | Total output tokens | Runs with data |
|---|---|---|---|
| delegate | 889 | 54082 | 15 |
| delegate-followup | 941 | 49749 | 15 |
| delegate-adversarial | 390 | 28513 | 15 |

## Caveats

- sidecar state.json has no tempo field: ~/.claude/jobs/f28f5740/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/f935ed4c/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/bb361d58/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/fad7f6a1/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/2c76e2ed/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/44a59652/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/aa7242c3/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/d1f74bc0/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/9a7849d6/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/8b2bb5a9/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/c5360a64/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/4cbb6b4f/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/8a15f5b9/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/ff332227/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/86182b1d/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/3d0e5ca3/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/71c95185/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/4cac43ed/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/f06c68da/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/fa324410/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/a2987cc5/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/280ef1d0/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/39a94930/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/9a85d739/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/23afb4e9/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/5961f1fe/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/e11b9d4f/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/499c13c4/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/0bbccb35/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/6cdc28f4/state.json
- transcript not found: no transcriptPath and no shortId in job record
- adversarial-review severities: blocker:0, high:0, medium:0, low:0, nit:0
- adversarial review session transcript missing: transcriptPath not in review output
- sidecar state.json has no tempo field: ~/.claude/jobs/31aa99f8/state.json
- adversarial-review severities: blocker:0, high:0, medium:0, low:1, nit:2
- sidecar state.json has no tempo field: ~/.claude/jobs/84f1100d/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/bccb363d/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/9f70862f/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/3fe68774/state.json
- adversarial-review severities: blocker:0, high:0, medium:2, low:2, nit:0
- sidecar state.json has no tempo field: ~/.claude/jobs/8f09f192/state.json
- adversarial-review severities: blocker:0, high:0, medium:1, low:1, nit:1
- sidecar state.json has no tempo field: ~/.claude/jobs/e71ac3c8/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/bca2aa23/state.json
- adversarial-review severities: blocker:0, high:0, medium:2, low:1, nit:0
- sidecar state.json has no tempo field: ~/.claude/jobs/fafdaa9c/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/031e7e79/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/1e2da472/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/ddea2de5/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/6152ebe4/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/b02a4080/state.json
- sidecar state.json has no tempo field: ~/.claude/jobs/09146c43/state.json

## Billing-bucket observation

Not observed in this run (see OQ-I).
