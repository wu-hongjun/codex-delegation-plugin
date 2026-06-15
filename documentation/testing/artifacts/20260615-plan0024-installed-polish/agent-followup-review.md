# Plan 0024 — Installed-Plugin Heavy Test, Lane B: lifecycle / followup / status / review gates

**Date:** 2026-06-15
**Lane:** B (lifecycle, followup, status, review gates)
**Dispatcher under test (installed only):** `/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.5/scripts/cc.mjs` (v0.3.5, 89947 bytes)
**Workspace probed:** `/Users/hongjunwu/Repositories/Git/cc-plugin-codex` (main checkout)
**Report written from:** worktree `.claude/worktrees/plan0024-laneb-report` (shared-checkout write was guarded; see Notes).
**Commit:** committed nothing (per instructions).

## Overall verdict: **PASS**

Both required contracts hold and the full delegate → status → followup → review → adversarial-review lifecycle works end-to-end against the installed dispatcher:

- ✅ `review` JSON contains `review.blocking` as a **boolean** (verified `typeof === "boolean"`) — in both same-session `review` and fresh-session `adversarial-review`.
- ✅ `status --json --compact` contains the **`waitingFor`** field (`hasOwnProperty === true`) — present in both single-job (`--job`) and list shapes.

---

## Commands run (in order) and summarized outputs

All commands invoked as `node <CC> …` where `<CC>` is the installed dispatcher above. Markers were generated per-run; values shown are the actual observed values.

### 1. Start a small delegate job with a unique marker
```
node <CC> delegate --yes --name plan0024-laneb -- \
  "Reply with exactly this single token and nothing else, no preamble: PLAN0024-LANEB-1781543404-97482"
```
- **Job ID:** `job_mqfgy4i3_f0ed64c3` · session `fc0403ed` · name `plan0024-laneb-81a2b0ea`
- Status on start: `running`.

### 2. Poll status (compact JSON)
```
node <CC> status --job job_mqfgy4i3_f0ed64c3 --json --compact
```
- First poll: `status=running`, `waitingFor=null`, `latestTurn.finalMessagePreview="PLAN0024-LANEB-1781543404-97482"` — **marker round-tripped exactly.**
- Subsequent polls: `status=awaiting_followup`, `latestTurn.status=completed`, `waitingFor=null`.
- Compact shape fields confirmed present: `jobId, status, shortId, sessionName, waitingFor, createdAt, updatedAt, turnCount, latestTurn{…}, result{hasResult, finalMessagePreview, touchedFiles}`.

### 3. Send a follow-up
```
node <CC> followup job_mqfgy4i3_f0ed64c3 --yes --json -- \
  "Now reply with exactly this single token and nothing else: PLAN0024-FOLLOWUP-1781543449"
```
- Return: `ok=true`, new `turn.index=1`, `turn.status=completed`, `finalMessagePreview=null`, `stalePreview=true`, `resultPending=true`, `previousTurnPreview="PLAN0024-LANEB-1781543404-97482"`.
- Poll after followup: `turnCount=2`, `latestTurn.index=1`, `finalMessagePreview="PLAN0024-FOLLOWUP-1781543449"` — **followup marker round-tripped exactly.**

### 4. Same-session structured review
```
node <CC> review job_mqfgy4i3_f0ed64c3 --yes --json
```
Output:
```json
{
  "ok": true,
  "review": { "verdict": "pass", "blocking": false, "findingsCount": 0,
              "blockerCount": 0, "highCount": 0, "mediumCount": 0,
              "lowCount": 0, "nitCount": 0, "findings": [] },
  "job": { "jobId": "job_mqfgy4i3_f0ed64c3", "status": "awaiting_followup" },
  "turn": { "index": 2, "status": "completed" }
}
```
- Reviewed the latest **non-review** turn (the followup, turn index 1); the review itself became turn index 2.
- `review.blocking` present, `typeof === "boolean"`, value `false`.

### 5. Adversarial (fresh-session) review with a blocking gate
```
node <CC> adversarial-review job_mqfgy4i3_f0ed64c3 --yes --json --blocking
```
Output:
```json
{
  "ok": true,
  "review": { "verdict": "pass", "blocking": false, "findingsCount": 0, … "findings": [] },
  "job": { "jobId": "job_mqfh0cd9_b4dda467", "status": "awaiting_followup",
           "reviewOf": { "jobId": "job_mqfgy4i3_f0ed64c3", "turnIndex": 1 } },
  "targetJob": { "jobId": "job_mqfgy4i3_f0ed64c3", "status": "awaiting_followup" }
}
```
- **Process exit code: `0`** (`--blocking` = alias for `--fail-on high`; gate did NOT trip because verdict=`pass`, 0 findings → exit 0, the correct behavior).
- Spawned a **fresh independent job** `job_mqfh0cd9_b4dda467` with `reviewOf` → target `job_mqfgy4i3_f0ed64c3` turn index 1.
- `review.blocking` present, `typeof === "boolean"`, value `false`.

### 6. Contract verifications (programmatic)
```
review.json:    typeof review.blocking = boolean, value=false, verdict=pass
advreview.json: typeof review.blocking = boolean, value=false, verdict=pass
status_followup.json: hasOwnProperty(waitingFor)=true, value=null, status=awaiting_followup
status (list, compact): every job entry has hasOwnProperty(waitingFor)=true
```

### 7. Cleanup — stop only the jobs I created
```
node <CC> stop job_mqfgy4i3_f0ed64c3 --json   → ok=true, status=stopped
node <CC> stop job_mqfh0cd9_b4dda467 --json   → ok=true, status=stopped
```
- Post-stop workspace listing confirmed **both my jobs `stopped`**, and the other lanes' jobs (`job_mqfgx3*`, `job_mqfgx42z*`, `job_mqfgx3pd*`) **left `running` / untouched**.

---

## Required-contract evidence (explicit)

| Contract | Result | Evidence |
|---|---|---|
| `review` JSON contains `review.blocking` boolean | ✅ PASS | `review.json` + `advreview.json`: `typeof review.blocking === "boolean"`, value `false` |
| `status --compact` contains `waitingFor` | ✅ PASS | `status_followup.json`: `hasOwnProperty("waitingFor")===true`; also present in list shape for all jobs |
| Marker round-trip (delegate) | ✅ PASS | `latestTurn.finalMessagePreview === "PLAN0024-LANEB-1781543404-97482"` |
| Marker round-trip (followup) | ✅ PASS | `latestTurn.finalMessagePreview === "PLAN0024-FOLLOWUP-1781543449"` |
| Adversarial review gate behavior recorded | ✅ PASS | `--blocking` → exit 0 on verdict=pass/0 findings; fresh job created with `reviewOf` linkage |
| Cleanup (stop only my jobs) | ✅ PASS | both mine `stopped`; other lanes' jobs untouched |

---

## Frictions / observations

1. **`waitingFor` is `null` even while `status === "awaiting_followup"`.** The field is always present (contract satisfied), but it is never populated in this flow. A consumer might reasonably expect `awaiting_followup` to carry a non-null `waitingFor` describing what the job is blocked on. Cosmetic/semantic only — does not break the contract, but the field currently conveys no signal here. *(Severity: low / cosmetic.)*

2. **`followup --json` returns no synchronous result** — it comes back with `finalMessagePreview=null`, `stalePreview=true`, `resultPending=true`. The followup turn's output must be obtained by a subsequent `status` poll. Expected async behavior, but consumers of `--json` must poll rather than read the followup's immediate return. *(Severity: informational.)*

3. **`result <jobId>` returns the *latest* turn, which after a same-session `review` is the review turn**, not the original/marker turn. After step 4, `result job_mqfgy4i3 --json --compact` returned the review payload (`{"verdict":"pass","findings":[]}` + review reasoning), not the followup marker. To retrieve a specific earlier turn's output, use `status --job … --compact` (`latestTurn` / `previousTurnPreview`). *(Severity: informational — worth documenting so callers don't assume `result` == task output once a review turn exists.)*

4. **Node warning on stderr:** `Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.` appears on dispatcher invocations in this environment (harness sets `FORCE_COLOR`; a `NO_COLOR` is also set). **JSON stdout integrity is intact** — every captured `--json` file begins with `{` and parsed cleanly; the warning is stderr-only. *(Severity: cosmetic, environment-specific.)*

5. **Gate-trip path not exercisable on a trivial job.** `--blocking` / `--fail-on high` could only be observed in the *non-tripping* case (verdict `pass`, 0 findings → exit 0), because the marker-echo job presents nothing reviewable to produce a high/blocker finding. The gate wiring is confirmed present and correct on the pass path; a true exit-1 trip would require a job whose reviewed turn contains a high-severity defect. *(Not a defect — a coverage limitation of this lane's fixture.)*

## Notes on scope / safety
- Used **only** the installed dispatcher at the pinned path; no repo source scripts were invoked.
- Created exactly **two** jobs (`job_mqfgy4i3_f0ed64c3` delegate, `job_mqfh0cd9_b4dda467` adversarial-review fresh session); both were stopped. Other lanes' concurrently-running jobs were not touched.
- No commits made.
- **Report location:** the background-session worktree guard rejected writing into the shared checkout, so this report was written from the worktree `.claude/worktrees/plan0024-laneb-report` at the same relative path `documentation/testing/artifacts/20260615-plan0024-installed-polish/agent-followup-review.md`. If the aggregator expects it in the main checkout, copy it across (no commit was made).
