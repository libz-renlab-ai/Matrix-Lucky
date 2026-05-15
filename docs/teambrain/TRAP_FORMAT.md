# TRAP_FORMAT.md — Trap Entry Schema

```
raw failure
    |
    v
+---+------------+
| wrong_pattern  |  (literal cmd / regex / behavior)
| right_pattern  |  (concrete fix)
| verify_command |  (shell one-liner or recipe id)
+---+------------+
    |
    v
  TRAP entry (YAML frontmatter or table row)
    |
    v
  linter (yq / awk — fails fast on missing field)
    |
    v
  merge into TRAPS.md
```

---

## Required Fields

| Field | Type | Allowed Values | Example | Why Required | Ground-Truth Check |
|-------|------|---------------|---------|-------------|-------------------|
| `id` | string | regex `^TRAP-[A-Z]+-\d{3}$` | `TRAP-GIT-001` | Stable dedup key; linter uses it to detect duplicates across TRAPS.md | `grep -c "^id: TRAP-" file.yaml` == 1 |
| `category` | enum | `git`, `review`, `ops`, `coop`, `security`, `docs` | `git` | Enables category-scoped queries and reviewer routing rules (see §H6-12) | value must be in enum list |
| `severity` | enum | `P0`, `P1`, `P2` | `P1` | Drives triage priority and merge gate thresholds | value must be `P0`, `P1`, or `P2` |
| `wrong_pattern` | string | literal command, regex, or behavior pattern — MUST be mechanically matchable | `git push origin main` | Linter/grep hook must match this to flag violations; free prose is not matchable | string length >= 5; not "vague" |
| `right_pattern` | string | concrete fix — command, code snippet, or concrete procedure | `git push gitee main && git push github main` | Without a concrete fix, the trap has no actionable correction | string length >= 5 |
| `verify_command` | string | shell one-liner OR `VERIFY_TEMPLATE:<recipe_id>` | `git remote -v \| grep -E 'gitee\|github'` | Automated harness must be able to run this; "human review" is not a verify | must NOT be empty; must NOT contain "靠人审" or "manual" |
| `evidence_link` | string | file path or URL to a real failure case | `docs/notes/2026-05-01-day0-team-experience-dump.md#L42` | Grounds the trap in a real incident; prevents speculative entries | must resolve to existing path or valid URL |

---

## Optional Fields

| Field | Type | Notes |
|-------|------|-------|
| `owner` | string | GitHub handle of trap author |
| `added_at` | string (ISO 8601) | `2026-05-01` |
| `tags` | string[] | e.g. `[remote, push, dual-remote]` |
| `related_trap_ids` | string[] | e.g. `[TRAP-GIT-002]` |
| `retired_at` | string (ISO 8601) | Set when trap no longer applies; entry stays for audit trail |

---

## Schema Sample (YAML)

```yaml
---
id: TRAP-GIT-001
category: git
severity: P1
wrong_pattern: "git push origin main"
right_pattern: "git push gitee main && git push github main"
verify_command: "git remote -v | grep -E 'gitee|github' | wc -l | awk '{exit ($1 < 2)}'"
evidence_link: "docs/notes/2026-05-01-day0-team-experience-dump.md#L12"
owner: LiuShiyuMath
added_at: "2026-05-01"
tags: [remote, push, dual-remote]
related_trap_ids: [TRAP-GIT-002]
---
```

---

## Schema Sample (Markdown Table Row)

Used for P1/P2 entries in TRAPS.md tabular sections:

```
| TRAP-GIT-001 | git | P1 | `git push origin main` | `git push gitee main && git push github main` | `git remote -v \| grep -E 'gitee\|github' \| wc -l \| awk '{exit ($1 < 2)}'` | docs/notes/2026-05-01-day0-team-experience-dump.md#L12 |
```

Column order: `id | category | severity | wrong_pattern | right_pattern | verify_command | evidence_link`

---

## Validation

Lint a single YAML trap entry — exits non-zero if any required field is missing or empty:

```bash
#!/usr/bin/env bash
# Usage: bash lint-trap.sh path/to/trap.yaml
set -euo pipefail
FILE="${1:?usage: lint-trap.sh <trap.yaml>}"

REQUIRED_FIELDS="id category severity wrong_pattern right_pattern verify_command evidence_link"

for field in $REQUIRED_FIELDS; do
  val=$(yq ".$field" "$FILE" 2>/dev/null)
  if [ -z "$val" ] || [ "$val" = "null" ] || [ "$val" = '""' ]; then
    echo "FAIL: required field '$field' is missing or empty in $FILE" >&2
    exit 1
  fi
done

# id format check
id_val=$(yq ".id" "$FILE")
if ! echo "$id_val" | grep -qE '^TRAP-[A-Z]+-[0-9]{3}$'; then
  echo "FAIL: id '$id_val' does not match ^TRAP-[A-Z]+-[0-9]{3}$" >&2
  exit 1
fi

# category enum check
VALID_CATS="git review ops coop security docs"
cat_val=$(yq ".category" "$FILE")
if ! echo "$VALID_CATS" | grep -qw "$cat_val"; then
  echo "FAIL: category '$cat_val' not in allowed enum {$VALID_CATS}" >&2
  exit 1
fi

# severity enum check
sev_val=$(yq ".severity" "$FILE")
if ! echo "P0 P1 P2" | grep -qw "$sev_val"; then
  echo "FAIL: severity '$sev_val' not in {P0, P1, P2}" >&2
  exit 1
fi

# verify_command must not be manual
vc_val=$(yq ".verify_command" "$FILE")
if echo "$vc_val" | grep -qiE '靠人审|manual check|human review'; then
  echo "FAIL: verify_command must be a shell one-liner, not a manual instruction" >&2
  exit 1
fi

echo "OK: $FILE passes all required field checks"
```

For bulk validation across TRAPS.md table rows (awk fallback when no YAML frontmatter):

```bash
# Check no table row has empty cells in required columns 1-7
awk -F'|' 'NR>2 && NF>=8 {
  for(i=2;i<=8;i++) {
    gsub(/^[[:space:]]+|[[:space:]]+$/,"",$i)
    if($i=="") { print "FAIL row "NR": col "i-1" empty"; exit 1 }
  }
}' TRAPS.md && echo "OK"
```

---

## Anti-Pattern Entries (Rejected)

### BAD-1: Vague wrong_pattern

```yaml
id: TRAP-OPS-001
category: ops
severity: P1
wrong_pattern: "不小心搞错了推送目标"          # BAD: free prose, not matchable by grep/linter
right_pattern: "先确认 remote 再 push"         # BAD: also vague
verify_command: "git remote -v"                # incomplete: shows remotes but doesn't assert
evidence_link: "docs/notes/2026-05-01-day0-team-experience-dump.md#L5"
```

**Why rejected**: `wrong_pattern` is a Chinese prose description. No linter, grep hook, or automated tool can match it against live commands. A pattern must be a literal string or regex that can be tested mechanically.

---

### BAD-2: Missing verify_command

```yaml
id: TRAP-GIT-002
category: git
severity: P0
wrong_pattern: "git reset --hard HEAD~1"
right_pattern: "git revert HEAD"
# verify_command: omitted
evidence_link: "docs/notes/2026-05-01-day0-team-experience-dump.md#L88"
```

**Why rejected**: `verify_command` is absent. The schema has no "omit if" loophole. Every trap must be verifiable by a shell one-liner or a named VERIFY_TEMPLATE recipe. Without it, automated harness cannot confirm the fix is applied.

---

### BAD-3: Mock loophole in verify

```yaml
id: TRAP-REVIEW-001
category: review
severity: P1
wrong_pattern: "merged PR without reviewer approval"
right_pattern: "require at least one approval before merge"
verify_command: "echo 'ask teammates if they reviewed'"    # BAD: mock, not real assertion
evidence_link: "docs/notes/2026-05-01-day0-team-experience-dump.md#L55"
```

**Why rejected**: `verify_command` is `echo` with a human instruction baked in — functionally identical to "靠人审". The lint rule explicitly rejects commands that contain human-instruction phrases and commands that always exit 0 regardless of actual state. Use `gh pr view --json reviews` or similar real assertion instead.
