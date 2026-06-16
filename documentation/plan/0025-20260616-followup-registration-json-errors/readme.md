# Plan 0025 — follow-up registration and JSON error polish

## Scope

Patch-release polish after v0.3.8 heavy testing.

## Findings

- Same-session review can fail under load with `follow-up prompt did not register within 5000ms`.
- Retrying the same path with `CC_PLUGIN_CODEX_PROMPT_REGISTER_TIMEOUT_MS=20000` succeeds.
- A runtime command failure with `--json` can leave stdout empty, forcing agents to parse stderr.
- Power-user Claude subagent simulations can pause on permission prompts while
  useful partial output already exists, and status may briefly show running while
  the sidecar already reports blocked tempo.
- Development testing can accidentally use a stale installed cc dispatcher while
  the workspace checkout has a newer plugin version.

## Implementation

- Documented exception: touch `packages/driver-claude-code/**` to raise the prompt-registration default.
- Documented exception: touch `packages/runtime/**` to map sidecar
  `tempo:"blocked"` to `needs_input` faster without changing completed-result
  remapping.
- Emit parseable JSON on stdout for top-level runtime command failures when `--json` is present.
- Keep parse/usage errors behavior unchanged unless separately planned.
- Add `cc result --partial` for recorded partial output on incomplete jobs.
- Add compact status `actionHints` and `result.finalMessagePath` so agents can
  choose `attach`, `logs`, or `partialResult` without parsing prose.
- Add setup/status worktree-version mismatch warnings for stale installed
  dispatcher caches during contributor testing.
