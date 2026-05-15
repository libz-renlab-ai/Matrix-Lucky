```text
   judge.md — issue #83 team-scope session recording + gbrain index harness
   (MD playbook, NOT a fixed bash script)

   main agent
       │
       ├─► sub-agent 1: glossary lint (forbidden terms in prose only)
       ├─► sub-agent 2: PoC ingest (record → ingest → query hit)
       ├─► sub-agent 3: multi-subject e2e (2 users same team_id, cross-query)
       ├─► sub-agent 4: redaction integrity (synthetic token cast)
       ├─► sub-agent 5: attribution link (session_id ↔ rule_id round-trip)
       ├─► sub-agent 6: dependency on #82 (team_id algorithm match)
       └─► main agent aggregate verdict.json
```

# Judge harness — issue #83

This is the **MD playbook** dispatched by the main agent (or maintainer) when verifying that the follow-up impl PR for #83 has shipped a real `teamagent record-session` + gbrain ingest pipeline that actually re-finds the recording via team-scope query — and doesn't leak secrets in transcripts.

## Inputs

- The impl PR's diff
- `packages/cli/src/commands/record-session.ts` (new — NOT `record.ts`, which would clash with the existing `recording.ts` recording-memory CLI)
- `packages/core/src/m5/recording-ingest.ts` (new, pure functions colocated with secret-scanner)
- `packages/adapters/src/m5/recording-uploader.ts` (new, IO side — asciinema spawn + gbrain upload)
- `packages/core/src/recording/page-schema.ts` (new)
- `docs/specs/<DATE>-team-scope-session-recording.md` (new)
- `docs/plans/issue-83/poc-evidence/<run-id>/...`
- `docs/plans/issue-83/multi-subject-evidence/<run-id>/...`
- `docs/plans/issue-83/redaction-proof/...`
- Existing gbrain MCP tools (read-only access)
- `packages/core/src/m5/secret-scanner.ts` and `m5-sync.ts` (for team_id alg)

## Outputs

- `docs/plans/issue-83/judge-output/<run-id>/verdict.json`
- `docs/plans/issue-83/judge-output/<run-id>/step-<N>/raw.json` + `evidence/`

`verdict.json` schema:

```json
{
  "run_id": "<iso-or-uuid>",
  "steps": [
    {"id": 1, "name": "glossary-lint",        "exit_code": 0, "metrics": {"hits_in_prose": 0}},
    {"id": 2, "name": "poc-ingest",           "exit_code": 0, "metrics": {"query_top_score": 0.78, "page_id_match": true}},
    {"id": 3, "name": "multi-subject-e2e",    "exit_code": 0, "metrics": {"a_finds_b": true, "b_finds_a": true}},
    {"id": 4, "name": "redaction-integrity",  "exit_code": 0, "metrics": {"token_leak_count": 0, "path_leak_count": 0, "key_leak_count": 0}},
    {"id": 5, "name": "attribution-link",     "exit_code": 0, "metrics": {"event_has_session_id": true, "page_has_rule_id": true, "link_resolves": true}},
    {"id": 6, "name": "dependency-on-#82",    "exit_code": 0, "metrics": {"teamid_algorithms_match": true}}
  ],
  "verdict": "pass",
  "verdict_reason": "all 6 steps green; recording ingestable, retrievable, redacted, attributed, isolated to team_id"
}
```

## Step 1 — Glossary lint

Same logic as `docs/plans/issue-82/judge.md` Step 1 (whitelist: top ASCII art, backtick code, quoted issue title, `## Glossary mapping` section, meta risk rows). Forbidden terms add issue-83 specific bans: `["group video","group video recording","group brain","cross-user","federated"]`.

Pass condition: `hits_in_prose == 0`.

## Step 2 — PoC ingest

Sub-agent runs:

1. `teamagent record-session --session-id=poc-<rid> --duration=600` against a synthetic CC session that intentionally includes ≥3 prompts that should match team-scope rules.
2. Wait for ingest to complete; record `cast_file_path`, `transcript_md_path`, `gbrain_page_id`, `timeline_entries_count`.
3. Issue `mcp__gbrain__query "<one of the synthetic prompt phrases>"`; record top result.

Emit:

```json
{
  "session_id": "poc-<rid>",
  "cast_file_uploaded": true,
  "page_id": "...",
  "timeline_entries_count": 7,
  "query_top_page_id": "...",
  "query_top_score": 0.78,
  "page_id_match": true
}
```

Pass conditions: `cast_file_uploaded == true`, `timeline_entries_count >= 3`, `page_id_match == true`, `query_top_score > 0.5`.

## Step 3 — Multi-subject e2e

Sub-agent simulates two distinct git authors (different `git config user.email`) recording in the same git project (same team_id). Each records ≥3 minutes of synthetic CC session with a distinguishable phrase set. Sub-agent then queries gbrain for each subject's distinguishable phrase, expecting to find the *other* subject's recording.

Emit:

```json
{
  "subject_a_email": "a@example.test",
  "subject_b_email": "b@example.test",
  "a_record_page_id": "...",
  "b_record_page_id": "...",
  "a_query_finds_b": true,
  "b_query_finds_a": true
}
```

Pass condition: both directions return the other subject's page in their query top-3.

## Step 4 — Redaction integrity

Sub-agent uses a fixed synthetic cast file `docs/plans/issue-83/redaction-proof/token-test.cast` containing:

- A fake API token like `sk-FAKE${random_hex_40}` (40+ char shape)
- A fake AWS access key line `aws_access_key_id=AKIAFAKE${...}`
- A fake home path `/Users/fakeuser/secret/`
- A fake email `secret@example.test`

The plan's ingest gate guarantees that if the secret scanner hits, the session is sealed in L1 and **nothing is uploaded to gbrain**. So this step has two execution branches:

**Branch A — happy path: synthetic secrets are caught, ingest aborts.**

Sub-agent confirms ingest aborted by checking `recording-ingest` exit code or AttributionBus event log for `recording_ingest_failed{reason: "sealed_in_L1"}`. Then verifies that `mcp__gbrain__file_list` does NOT contain a cast file for this run_id, and `mcp__gbrain__get_page` returns 404 for the expected page slug.

```json
{
  "branch": "A",
  "ingest_aborted": true,
  "abort_reason": "sealed_in_L1",
  "uploaded_cast_present": false,
  "page_present": false
}
```

Pass condition (Branch A): `ingest_aborted == true` AND `uploaded_cast_present == false` AND `page_present == false`.

**Branch B — scanner failed to catch the secret: ingest proceeded.**

This is a scanner BUG and Step 4 must fail loudly so the impl PR cannot merge. Sub-agent reads:

- The transcript markdown (`transcript_md_path` from step 2's flow)
- The page content (`mcp__gbrain__get_page` on the resulting page slug)
- The uploaded cast file content (`mcp__gbrain__file_url` → fetch contents)

Sub-agent greps each for fake-token-shape patterns:

```json
{
  "branch": "B",
  "transcript_token_leak": <int>,
  "transcript_path_leak": <int>,
  "transcript_key_leak": <int>,
  "transcript_email_leak": <int>,
  "page_token_leak": <int>,
  "page_path_leak": <int>,
  "page_key_leak": <int>,
  "page_email_leak": <int>,
  "uploaded_cast_token_leak": <int>,
  "uploaded_cast_path_leak": <int>,
  "uploaded_cast_key_leak": <int>,
  "uploaded_cast_email_leak": <int>
}
```

Pass condition (Branch B): **all 12 leak counts == 0**. Any non-zero leak — transcript, page, OR uploaded cast — fails Step 4. The uploaded cast is included because v1 covers the cast's text stream end-to-end via the M5 secret scanner (per `plan.md` privacy section); a leak there means the scanner missed the pattern and must be patched. There is no "warning, requires manual review" exit hatch in v1 — frame-level visual redaction is OUT OF SCOPE only because v1 does not record the screen, not because v1 lets text-stream leaks through.

The remediation when Step 4 Branch B fails:

1. Delete the uploaded cast and page from gbrain (`mcp__gbrain__file_list` → delete; `delete_page`).
2. Revoke any real token that was leaked (manual operator action).
3. Patch the scanner regex table to catch the missed shape; add a regression test in `packages/core/src/m5/__tests__/secret-scanner.test.ts`.
4. Re-run Step 4; only Branch A is acceptable for merge.

## Step 5 — Attribution link

Sub-agent inspects step 2's PoC session evidence:

- AttributionBus event log: at least 1 event during the session must contain `recording_session_id == poc-<rid>`.
- Resulting gbrain page frontmatter: must contain `attribution_link_to_rule_id` non-empty if any team-scope rule was triggered during the session.
- Round-trip: `mcp__gbrain__query` for the rule_id-related text must return the page with the recording_session_id; the link from rule trigger → recording → timestamp clip must resolve (URL fetchable).

Emit:

```json
{
  "event_has_session_id": true,
  "page_has_rule_id": true,
  "link_resolves": true,
  "round_trip_seconds": 1.4
}
```

Pass condition: all three true.

## Step 6 — Dependency on #82

The team_id helper is currently inline in `packages/cli/src/commands/m5-sync.ts:95` (`computeTeamId`). The impl PR's deliverable extracts it to a shared helper `packages/core/src/m5/team-id.ts` and updates both call sites.

Sub-agent reads:

- `packages/core/src/m5/team-id.ts` — the new shared helper (extracted from `packages/cli/src/commands/m5-sync.ts:95`).
- `packages/cli/src/commands/m5-sync.ts` — must now import from the helper, not redefine.
- `packages/core/src/m5/recording-ingest.ts` — must also import from the helper.

Both call sites must compute team_id as `SHA256(normalize(git remote))[:16]` via the same shared helper. If the impl PR ships without extracting the helper, the test fails.

Emit:

```json
{
  "m5_sync_uses_helper": true,
  "recording_ingest_uses_helper": true,
  "shared_helper_path": "packages/core/src/m5/team-id.ts (NEW; extracted from packages/cli/src/commands/m5-sync.ts:95 computeTeamId as part of this impl PR's deliverable)",
  "teamid_algorithms_match": true
}
```

Pass condition: `teamid_algorithms_match == true`. Failure means the impl PR is silently forking the team_id concept; reviewer asks for refactor before merge.

## Step 7 — Aggregate verdict

Main agent reads `step-{1..6}/raw.json`, applies pass conditions, writes `verdict.json` per the schema above. Failure on any step is a hard block.

## What this judge harness does NOT do

- It does not judge whether asciinema is the "right" recording technology — that's a v1 decision in the plan. v1 supports both asciinema cast v2 and v3 schemas.
- It does not enforce frame-level visual redaction — that's a v2 concern; v1 does not record the screen so the question doesn't arise. (It DOES enforce text-stream redaction end-to-end, including the uploaded cast file, via Step 4.)
- It does not test cross-project (different `team_id`) playback — that's a non-goal.
- It does not measure end-user UX for "watching another teammate's clip" — UX is iterated in v2.
- It does not retrain or re-rank gbrain's hybrid search; trusts gbrain's existing query behavior.
