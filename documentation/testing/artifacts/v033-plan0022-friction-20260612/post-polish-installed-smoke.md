# Post-polish Installed Smoke

Date: 2026-06-12

Installed plugin:

```text
cc@cc-plugin-codex-local  installed, enabled  0.3.3    /Users/hongjunwu/Repositories/Git/cc-plugin-codex/marketplace/plugins/cc
```

Install refresh:

```sh
codex plugin remove cc@cc-plugin-codex-local
codex plugin marketplace add "$(pwd)/marketplace"
codex plugin add cc@cc-plugin-codex-local
```

Cached dispatcher under test:

```text
/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs
```

## Cache Evidence

The refreshed cache contains the expected new source symbols:

- Runtime dist exports and uses `getJobTurnResultPath`.
- Dispatcher/formatter contain `--compact`, `status --job`, `stalePreview`, and `resultPending`.
- Workflow inspector contains `deep_research`.
- Workflow/deep-research output and help say `--yes` does not approve Claude Code workflow gates.

## Command Smokes

- `workflow --help` printed command-specific help with `Usage: cc workflow`, `claude attach <shortId>`, and the no-auto-approval note.
- `deep-research --help` printed command-specific help with WebSearch/fanout wording, `claude attach <shortId>`, and the no-auto-approval note.
- `workflows --help` printed command-specific inspector help and said it includes `$claude-workflow` and `$claude-deep-research`.
- `status --job job_mqay5thy_7db6c560 --all --json` returned compact single-job JSON for the stopped job and did not include `driver` or `capabilitiesSnapshot`.
- `status --json --compact` parsed successfully for 283 workspace jobs and did not include `driver` or `capabilitiesSnapshot`.
- `workflows --json` parsed successfully with 57 sessions and kind values `deep_research,dynamic_workflow`.

No new Claude job was launched during this smoke pass.
