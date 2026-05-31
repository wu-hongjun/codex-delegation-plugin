# Stage 2 — Implement

> **Status**: in progress. Started 2026-05-31 after maintainer approval of Stage 1. All eight open questions in [`1-plan.md` § 6](1-plan.md#6-open-questions--resolved-2026-05-31) are resolved.

Running log of the actual implementation. Truthful, not polished. Update as you go — daily entries are better than a single retro.

## Conventions

- One section per task (T1, T2, …) matching [`1-plan.md` § 4](1-plan.md#4-tasks-with-acceptance-criteria).
- Each task section: what was built, what deviated from the plan and why, surprises, decisions, commit/PR links, test evidence.
- Anything bigger than a paragraph goes into `artifacts/` (logs, screenshots, diff exports).

## T1 — node-pty dependency + CI PTY smoke

**Started**: 2026-05-31. **Status**: complete (pending CI confirmation).

Files changed:

- `packages/driver-claude-code/package.json` — added `node-pty` to `dependencies`. **Pinned to `1.2.0-beta.13`** (deviation from plan; see below).
- `package-lock.json` — refreshed via `npm install`.
- `.github/workflows/ci.yml` — added a `PTY smoke (node-pty)` step between `Check formatting` and `Test`. Smoke spawns `/bin/sh -c 'echo ok'` under `pty.spawn` with full options (`name: 'xterm-color'`, `cols: 80`, `rows: 24`, `cwd: process.cwd()`, `env: process.env`), asserts `out.includes('ok')`, clears its timeout on success, exits 0.
- `packages/plugin-codex/test/ci-workflow.test.mjs` — Plan 0001 invariant `ci.yml does not contain "node-pty"` is no longer true under Plan 0002. Removed that one negative assertion; added a new `describe('ci.yml PTY smoke step (plan 0002)', ...)` block with three positive assertions: (1) step name `PTY smoke (node-pty)` present, (2) `node-pty` referenced, (3) PTY smoke step appears before the Test step.

### Deviation: `1.2.0-beta.13` instead of `^1.1.0`

[`1-plan.md` § 3.7](1-plan.md#37-pty-transport-details-research-block-b) locked `node-pty@1.1.0`. During T1 implementation, the local PTY smoke against `node-pty@1.1.0` failed on Node 25.1.0 (arm64) with `posix_spawnp failed.` — even for `/bin/sh -c 'echo ok'` with full env / cwd / cols / rows options. The prebuilt darwin-arm64 binary loads fine (`require('node-pty')` works; the module exposes `spawn`/`fork`/`createTerminal`/`open`/`native`), but the C++-side `pty.fork` call fails at the syscall level.

Hypothesis: `node-pty@1.1.0`'s prebuilt binary targets `node-addon-api@^7`, which supports Node 18–24. Node 25 is outside that ABI window. The maintainer's local environment runs Node 25.1.0; Plan 0001's live E2E was also Node 25.

Verified `node-pty@1.2.0-beta.13` (published 2026-05-13 per `npm view`) runs the same smoke cleanly on Node 25.1.0 (`exitCode: 0`, output `"ok\r\n"`).

Maintainer's call (2026-05-31): **pin to `1.2.0-beta.13` explicitly**. Trade: beta-channel exposure for the duration of Plan 0002; revisit when `node-pty@1.2.0` ships stable. Decision recorded here rather than retroactively editing `1-plan.md § 3.7` — the plan-as-approved cited `^1.1.0`; this Stage 2 entry is the deviation log per the workflow.

### Decisions taken (not in the plan but consistent with it)

- **Smoke uses `/bin/sh -c 'echo ok'`** instead of the plan's bare `echo`. Reason: bare `echo` requires PATH lookup, and `pty.spawn(..., {})` with no env inherits nothing — the smoke failed with `posix_spawnp failed.` even when the binding was healthy. `/bin/sh -c 'echo ok'` uses an absolute path and forwards env/cwd explicitly, which is robust on both macOS arm64 and on the Linux runners CI uses.
- **Smoke clears its 5-second timeout on successful exit** (`clearTimeout(timer)`). Reason: `setTimeout` keeps the event loop alive after the spawned process exits cleanly; without the `clearTimeout`, the smoke prints `PTY smoke ok` and then `PTY smoke timed out` 5 s later, exiting non-zero. The original plan text didn't specify this; corrected in the smoke source.
- **Tests-mjs delta**: removed 1 negative + added 3 positives = test:plugin lane grows by +2 (212 → 214). Net test total: 449 (mock 34 + runtime 82 + driver 119 + plugin 214). No tests removed elsewhere.

### Acceptance evidence (2026-05-31)

- `npm ci` ... actually `npm install` (lockfile refresh) — exit 0; `node-pty@1.2.0-beta.13` resolves and installs (prebuilt darwin-arm64 binary used; no local compile).
- Local PTY smoke (Node 25.1.0 arm64): prints `PTY smoke ok`, exits 0.
- `npm run lint` clean.
- `npm run typecheck` clean.
- `npm run format` clean.
- `npm run test:plugin` → 214 pass / 0 fail. Other lanes unchanged: mock 34, runtime 82, driver 119. Total 449.
- CI confirmation pending; will be appended once the commit lands on `main`.

## Deviations from the plan

- **node-pty version pin** (T1) — see above. `^1.1.0` → `1.2.0-beta.13`. Reason: Node 25 ABI incompatibility with `1.1.0`. Maintainer approved.

## Surprises

- `pty.spawn(..., {})` with empty options does NOT inherit env, so PATH lookups fail. Plan's smoke command needs an explicit cwd/env/cols/rows. (Documented in T1 decisions.)
- The Plan 0001 invariant test `ci.yml does not contain "node-pty"` correctly fired against the Plan 0002 dep change. Good catch by the static suite. Inverted to a positive assertion in T1 rather than just deleted.
