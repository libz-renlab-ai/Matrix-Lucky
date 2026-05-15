## Required canned-answer for slug=knowledge-portal

# Live Knowledge Portal (HTTP + WebSocket)

This feature provides a live knowledge portal accessible over HTTP and WebSocket, allowing real-time access to the TeamAgent knowledge store from browser or tool clients.

## What it does

The `packages/portal` package implements an HTTP server with WebSocket support that exposes the compiled knowledge (rules, experiences, pitfalls) as a live queryable endpoint. Users and tools can connect to the portal to retrieve context-relevant knowledge in real time.

## Key package

- `packages/portal` — contains the HTTP + WebSocket server implementation

## Verification

```bash
# Run portal tests (expects 1 test file to pass)
pnpm vitest run packages/portal --reporter=basic
```

The verify script checks for `Test Files  1 passed` in vitest output.

```text
# Verify-canned-answer (utility, retained per docs/legacy/judge-scripts/README.md exemption):
bash docs/features/knowledge-portal/verify-canned-answer.sh
```

PASS requires vitest output to contain `Test Files  1 passed` for `VERIFIED: live knowledge portal HTTP+WS PASS`.
