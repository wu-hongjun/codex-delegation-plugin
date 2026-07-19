# Antigravity parity audit — 2026-07-19

This is the evidence record for bringing the Google Antigravity integration to operational parity
with the Claude Code integration. It distinguishes plugin behavior from provider-specific UI and API
semantics; a matching command name is not treated as proof of an equivalent primitive.

## Audited environment

- Antigravity CLI: `agy` 1.1.4
- Codex Delegation source manifest: 0.5.0 plus the current cachebuster build metadata
- Platforms covered by the release workflow: macOS and Ubuntu, Node.js 20 and 22
- Local source: `packages/driver-agy-cli/`, `packages/plugin-delegate/antigravity-plugin/`, and the
  19 `skills/agy-*` wrappers

## Upstream interfaces used

| Requirement | Stable provider surface | Plugin use |
| --- | --- | --- |
| Persistent conversation | `--prompt-interactive`, `--conversation`, `--log-file` | One detached PTY and one exact UUID per job |
| Lifecycle and transcript discovery | `PreInvocation` and `Stop` hooks | Bundled observability-only companion hooks |
| Permissions | Native TUI permission cards | Durable `needs_input`; user answers through `delegate attach` |
| Child agents | Native subagent tools and `/agents` | Default parent plus bundled child profiles; native inspect/approve/kill through attachment |
| Tasks | `/tasks` | Available unchanged through attachment |
| Conversation branch | `/fork` (`/branch`) | Available through attachment; not confused with subagent delegation |
| Plugins and custom agents | `agy plugin validate/install/list`, plugin `agents/` | Setup installs five purpose-built native subagent profiles |

Primary documentation:

- [CLI overview](https://antigravity.google/docs/cli-overview)
- [CLI reference](https://antigravity.google/docs/cli-reference)
- [Conversations and `/fork`](https://antigravity.google/docs/cli-conversations)
- [`/agents` child inspection and control](https://antigravity.google/docs/cli/commands/agents)
- [Background tasks and subagents](https://antigravity.google/docs/cli-subagents)
- [Native permission cards](https://antigravity.google/docs/cli-permissions)
- [Plugins and skills](https://antigravity.google/docs/plugins)
- [Hooks](https://antigravity.google/docs/hooks)

## Empirical findings

1. `agy --prompt-interactive` remains alive after a completed turn and accepts bracketed-paste
   follow-ups in the same conversation.
2. A native permission card remains interactive even when the process is supervised by a PTY. A
   user can approve or deny it in place; no process restart is required.
3. A `PreToolUse` allow hook does not override the CLI's independent headless permission engine.
   Using hooks as an approval broker would therefore require dangerous permission bypass and was
   rejected.
4. `PreInvocation` can inject user messages. The plugin deliberately returns no injections because
   its companion is an observability bridge, not an authority that edits user prompts.
5. `Stop` supplies the conversation UUID, transcript path, artifact directory, idle flag, and
   termination reason needed for structured reconciliation.
6. The undocumented `agentapi send-message` can persist an external message, but exact same-turn
   consumption and lifecycle guarantees are not documented. It is not used as the control plane.
7. `/agents` is the documented child lifecycle and cancellation surface. The current CLI does not
   document a JSON child-list or child-cancel command, so the plugin exposes the real panel through
   attachment instead of reverse-engineering a private API.
8. Selecting a packaged custom profile as the top-level `--agent` removed `invoke_subagent` from the
   live model tool schema. Running orchestration in the default parent preserved the collaboration
   tools; a live probe then created a native child conversation and returned exact parent and child
   markers. The packaged profiles are therefore used as native child `TypeName` templates, matching
   Antigravity's documented plugin model.
9. Public wait/result output is restricted to normalized result artifacts. Raw TUI diagnostics and
   raw transcript JSONL remain explicit diagnostic files and are not appended to command output.
10. Native subagents inherit the parent's hook environment. The bridge now assigns lifecycle state
    ownership to the first parent conversation and logs, but does not consume, child hook events.
    Provider invocation/execution counters are execution-loop counters rather than user-turn
    indexes, so turn identity comes from explicit user transcript records.
11. A live `$agy-fork` profile run stayed active across the parent's non-idle Stop, received the
    child's exact `CODEX_DELEGATION_FORK_LIFECYCLE_OK` marker, verified the child evidence, emitted a
    normalized final result without a transcript tail, and was then stopped cleanly.

## Operational parity matrix

| Capability | Claude Code path | Antigravity path | Status |
| --- | --- | --- | --- |
| Start | Native background session | Detached persistent native TUI | Equivalent |
| Status | Agents JSON, sidecar, transcript | Atomic supervisor state, hooks, transcript | Equivalent |
| Wait/result/stop | Provider session plus job store | Provider session plus job store | Equivalent |
| Exact follow-up | PTY attach to live session | Same supervised PTY and exact UUID | Equivalent |
| Live user input | `claude attach` | `delegate attach`; `Ctrl+]` detaches | Equivalent |
| Permission handoff | Native Claude prompt | Native Antigravity card | Equivalent |
| Structured results | Claude transcript | Normalized Antigravity transcript | Equivalent |
| Private reasoning policy | Not returned as result | `thinking` explicitly discarded | Equivalent |
| Workflow/goal/batch/research | Claude runtime commands | Default Antigravity parent plus native child profiles | Equivalent outcome |
| Subagent delegation | Claude `/fork` runtime | Default parent invokes bundled fork child profile | Equivalent outcome |
| Child inspection/cancel | Claude's native attached surface | Antigravity `/agents` attached surface | Equivalent, interactive |
| Conversation branching | Provider-specific | Antigravity `/fork` attached surface | Provider-specific extra |
| Programmatic child JSON API | Provider-specific agents surface | No documented Antigravity equivalent | Explicit upstream gap |

## Safety decisions

- Raw ANSI terminal output is diagnostic and attachment data, not the semantic result source.
- The structured parser never surfaces Antigravity's private `thinking` field.
- The companion hooks do not allow or deny tools and fail open for observability errors, leaving the
  provider's own permission engine authoritative.
- The plugin does not answer permission cards on behalf of a user.
- An explicit unattended bypass that still reaches native input fails closed and records the job as
  failed rather than applying Claude-specific assumptions.
- `--print-timeout` is rejected for persistent jobs instead of being silently ignored.

## Verification record

The deterministic suites cover persistent lifecycle, same-process follow-up, permission handoff,
transcript normalization, default-parent orchestration and profile fallback, provider-aware bypass
failure, dispatcher lifecycle, and cleanup of detached test processes.

- Plugin suite: 1,642 passed, 0 failed.
- PTY attachment lane: 29 passed, 0 failed.
- Benchmark harness: 258 passed, 0 failed.
- Site: 11 pages, 246 internal links, 37 skill references, and 23 dispatcher command smokes.
- Packaging: 58 derived files, 80 bundled dependency files, four synthesized package manifests,
  and one marketplace-owned file matched exactly.
- Source and marketplace Codex validators passed; source and marketplace Antigravity companion
  validators each processed five agents and one hook configuration.
- Marketplace install smoke passed from an isolated Codex home. The real Claude model-access probe
  was unavailable due to the account's current service limit and was correctly classified as an
  environment issue rather than a packaging defect.
- `npm audit` reported zero vulnerabilities.
- Final local install: `delegate@codex-delegation-plugin-local`
  `0.5.0+codex.20260719170324`; installed cache bytes were checked for the corrected default-parent
  orchestration and sanitized-wait contracts.

CI and Pages results are recorded after the commit reaches GitHub.
