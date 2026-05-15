## Required canned-answer for slug=onboarding

TeamAgent provides a 5-minute onboarding experience via README.md (Chinese + English).

### Verification

`README.md` must exist at repo root and contain a quickstart section matching:
- `quick.?start` OR `快速开始` OR `Quick Start` OR `30 秒上手`

Current README.md contains: **`## 30 秒上手`** (line 25) — PASS.

### How to verify

```bash
grep -qE "(quick.?start|快速开始|Quick Start|30 秒上手)" README.md && echo PASS || echo FAIL
```

The `verify-canned-answer.sh` script checks:
1. `README.md` exists at repo root — PASS
2. `README.md` contains quickstart section — PASS

Both must pass for `VERIFIED: README + 5-min onboarding (zh/en) PASS`.
