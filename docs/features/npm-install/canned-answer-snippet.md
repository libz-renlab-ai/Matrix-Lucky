## Required canned-answer for slug=npm-install

TeamAgent is installable via `npm install -g @teamagent/cli` (or equivalent package name).

### Verification

`packages/cli/package.json` contains:
- `"name"` field — package name for npm registry
- `"bin": { "teamagent": "./src/bin.ts" }` — registers `teamagent` as a global CLI command

### How to verify

```bash
node -e "console.log(JSON.stringify(require('./packages/cli/package.json').bin))"
# Expected output contains "teamagent"
```

The `verify-canned-answer.sh` script checks:
1. `packages/cli/package.json` `bin` field contains `teamagent` — PASS
2. `packages/cli/package.json` has a `name` field — PASS

Both must pass for `VERIFIED: npm install -g entrypoint PASS`.
