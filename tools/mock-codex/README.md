# mock-codex

A deterministic stand-in for the real `codex` CLI used by `cc-plugin-codex` tests so the doctor's `codex-version` probe doesn't depend on the maintainer's real Codex install.

## Contract (v1, T4 scope)

| Command | Behavior |
|---|---|
| `codex --version` | Prints the configured version and exits 0. Exits 1 with `codex error` on stderr when `versionFails = true`. |

Any other invocation exits 2 with a usage hint on stderr.

The mock is intentionally minimal. Extend only when a new doctor probe or test scenario requires it.

## Configuration

- `CC_PLUGIN_CODEX_MOCK_CODEX_CONFIG` — optional path to a JSON file:

```jsonc
{
  "version": "codex-cli 0.0.0-mock",
  "versionFails": false,
  "sleepMs": 0
}
```

`sleepMs > 0` blocks the command for that many milliseconds before responding, so tests can exercise timeout handling in the doctor.

## Running tests

```bash
node --test tools/mock-codex/test/*.test.mjs
```
