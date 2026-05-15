# Team Memory: Prior Art Research

**Date**: 2026-04-22
**Author**: liboze2026 + Claude Code (3 parallel research agents)
**Purpose**: Inform brainstorm + spec for TeamAgent's pivot to team-synced rules (per `docs/specs/2026-04-21-team-memory-direction.md`)
**Reading time**: ~20 minutes

---

## Executive Summary

Surveyed 7 questions across 4 ecosystems (config sharing, lint configs, policy-as-code, AI coding rules). Key findings:

1. **Last-write-wins ordered merge is the universal conflict-resolution pattern.** Renovate, ESLint flat config, Helm, Stylelint all do "later in array/chain wins, no auto-rejection." Nobody ships a `status: contested` flag — they punt to PR review + CODEOWNERS.
2. **Renovate's preset model is the closest mature analogue to git-based AI rule sharing.** `extends: ["github>org/renovate-config"]` + `local>org/repo` references, auto-discovery of `.github/renovate-config.json`, parameterized presets via `{{arg0}}`. **Pain point**: changes propagate instantly to all downstream (no semver discipline).
3. **Dependabot's lack of shareable config is *still* a complaint in April 2026** — confirms our hypothesis that "git-PR-able rule files" is genuinely valuable.
4. **OPA bundle servers + Control Plane (OCP) are the gold-standard for "git → policy → distributed agent" pipelines.** Signed bundles, ETag polling, on-disk persist for offline. Worth borrowing the bundle/signing model long-term, but overkill for v1.
5. **Windsurf Cascade Memories is the closest direct analogue** — auto-captures lessons from sessions just like TeamAgent does. **But they explicitly refuse to sync memories across team**, telling users to manually promote a memory to a Rule. **TeamAgent's auto-capture + auto-sync in one pipeline is genuinely novel** — no competitor ships both.
6. **Cursor Memories shipped mid-2025, retired in 2.1.x** — cautionary tale. Failed on (a) privacy (sent chat to Cursor cloud), (b) rule quality decay, (c) no easy "reject this" path. TeamAgent's local-only processing + hit-count pruning + scoring already address all three.
7. **MDC format (markdown body + YAML frontmatter) is the de-facto standard** for structured-but-readable AI rules. Cursor, Windsurf, Continue all converged here. Recommend TeamAgent adopt it for committed team rules.
8. **No AI rules tool auto-scrubs PII/secrets** before write. Pre-commit gitleaks/trufflehog catch *secret patterns* but not internal hostnames/emails/repo paths in lesson bodies. **TeamAgent will need a custom redactor** — secret scanners are insufficient.
9. **`#` shortcut in Claude Code (manual memory append) is deprecated as of late 2025.** No replacement that auto-learns from sessions. TeamAgent's niche is uncontested in the Claude ecosystem.
10. **Recent ETH Zurich research (caveat: see Methodology) suggests `AGENTS.md` files often *hurt* coding agents** — making scoring/pruning load-bearing, not optional. TeamAgent's existing `scoreEntry` + tier system + hit counts is the right architecture.

---

## Key Takeaways for TeamAgent Design

| Decision | Recommendation | Why |
|----------|----------------|-----|
| **File format** | Markdown body + YAML frontmatter (MDC convention) | De-facto standard (Cursor, Windsurf, Continue); diffable in PRs; structured metadata for scoring |
| **Storage location** | `.teamagent/rules/*.mdc` (committed) + per-user override in `~/.teamagent/personal.db` (NOT synced) | Mirrors `.cursor/rules/` + Cursor user settings split |
| **Sync transport** | Git PR (v1). Hub/registry deferrable to v2 | Renovate proves git is enough; Continue Hub shows the upgrade path |
| **Conflict resolution** | Last-write-wins + tier-weighted resolver + `status: contested` flag for stalemates | Borrows Renovate's ordered model + adds explicit contested-state nobody else has |
| **Privacy gate** | Custom PII redactor on `teamagent export-team` (not just gitleaks) | Secret scanners miss internal hostnames/emails/paths |
| **Auto-promotion** | Don't auto-share — require explicit `teamagent promote <id>` | Cursor's auto-share triggered privacy backlash; Windsurf explicitly refuses to auto-share |
| **Quality control** | Keep current hit-count + tier + scoreEntry; surface "reject this rule forever" UI | ETH research warns hand-curated context can hurt; auto-captured even more risk |
| **Precedence chain** | Managed (org) → Team (project) → User (personal) — matches Claude Code's settings hierarchy | Free conflict resolution via Claude Code's array-merge if rules become a settings array |
| **Versioning** | SemVer-tag the team rules repo; downstream pins `#v1.2.3` | Avoid Renovate's "instant propagation of bad commits" pain point |

**Single biggest insight**: TeamAgent's auto-capture + auto-sync combo is the **white space** in the market. Cursor has sync but killed capture. Windsurf has capture but refused sync. Copilot/Claude Code have only static instructions. Building this combo well is the moat.

---

## Q1 — Renovate and Dependabot shared configuration

**Renovate's preset system is fundamentally a "config-repo + extends array" pattern.** Presets are hosted in an ordinary git repo, and downstream repos reference them in an `extends` array. The prefix tells Renovate where to look: `github>org/repo`, `gitlab>org/repo`, `gitea>org/repo`, `forgejo>org/repo`, `local>org/repo` (same platform as the current repo), or a raw `http://…/file.json` URL. By convention the shared config repo is named `renovate-config` and contains a `default.json`; if the preset reference omits a file name, Renovate loads `default.json` from the target repo's default branch ([Shareable Config Presets](https://docs.renovatebot.com/config-presets/)). Named presets live alongside as `<preset-name>.json`, and sub-presets (`github>org/repo:foo/bar`) let one file expose multiple named blocks via top-level keys ([config-presets.md on GitHub](https://github.com/renovatebot/renovate/blob/main/docs/usage/config-presets.md)).

**Org-level inheritance is auto-discovered at onboarding, not configured.** When a new repo is onboarded, Renovate scans upward for two patterns: (1) a repo literally named `renovate-config` in the parent org/user/group with a `default.json`, (2) a platform-specific meta repo — `.github` on GitHub, `.gitlab` on GitLab — containing `renovate-config.json`. The first hit wins and is injected into the generated `onboardingConfig`. On GitLab, nested groups are walked nearest-to-furthest. Parameterized presets are supported via `{{arg0}}`/`{{arg1}}`/`{{args}}` tokens, invoked as `:labels(dependencies,devops)`.

**Resolution and override semantics are ordered but subtle.** Renovate resolves configuration in the sequence: Global config → Inherited config → Resolved presets referenced in `extends` → Repository config ([config-overview](https://docs.renovatebot.com/config-overview/)). Within a single file's `extends` array the resolution is left-to-right, and "if there is a logical conflict between presets, then the *last* preset in the `extends` array 'wins'" ([Presets key concept](https://docs.renovatebot.com/key-concepts/presets/)). The counterintuitive part is that `packageRules` is an **additive** array — downstream rules are *concatenated*, not merged, with upstream rules. So you don't "override" a preset's `packageRules` entry; you append a later-wins rule that re-matches the same packages ([Configuration Inheritance and Merging — DeepWiki](https://deepwiki.com/suzuki-shunsuke/renovate-config-validator-workflow/3.2-configuration-inheritance-and-merging)). Git-tagged preset references pin to a specific version — `github>org/renovate-config#1.2.3` — which is the only real version-pinning mechanism.

**Dependabot has no equivalent shareable-config system, and this is still the pain point in 2026.** GitHub has incrementally added org-level surfaces but none are "extend another config file": private registries became org-configurable in July 2025 ([Centralized private registry config GA](https://github.blog/changelog/2025-07-22-centralized-private-registry-configuration-for-dependabot-is-now-generally-available/)) and expanded to multiple feeds in April 2026 ([Org-level private registries](https://github.blog/changelog/2026-04-14-dependabot-and-code-scanning-org-level-private-registries/)). But `.github/dependabot.yml` itself still must live in each repo and cannot `extend` another file. The long-running feature request ([community discussion #151871](https://github.com/orgs/community/discussions/151871), [dependabot-core #2015](https://github.com/dependabot/dependabot-core/issues/2015)) remains open; users describe the core pain as "a single central change needs pull requests for every single repository." 2026 workarounds: repository templates (only on creation), multi-gitter / Renovate fan-out PRs, custom scripts.

### Concrete examples

Org-wide preset — `org/renovate-config/default.json`:
```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended", "schedule:nonOfficeHours", ":semanticCommits"],
  "packageRules": [
    { "matchDepTypes": ["devDependencies"], "automerge": true }
  ]
}
```

Downstream repo — `.renovaterc.json`:
```json
{ "extends": ["local>acme/renovate-config"] }
```

Version-pinned: `"extends": ["github>acme/renovate-config#v2.3.0"]`.

### Pain points

- **No "which preset set this rule" diagnostic.** Users repeatedly ask for Renovate to print the fully resolved config in DEBUG mode; provenance is hard to trace ([discussion #14701](https://github.com/renovatebot/renovate/discussions/14701)).
- **Preset changes ship instantly to every downstream.** Most repos extend an unpinned `github>org/renovate-config` (default branch); a bad commit propagates on next run. Pinning works but is rarely used.
- **`packageRules` is additive, not override.** Downstream configs can't *remove* a matched upstream rule, only append a later one.
- **Dependabot: "no shared config" is the most-upvoted gap** — open since at least 2020.

---

## Q2 — Lint-rule sharing ecosystems (ESLint, Stylelint, Biome)

**ESLint flat config consolidated around: last matching config wins.** A flat config is a JS array of config objects; each can scope itself via `files`/`ignores` glob patterns. When linting a file, ESLint merges every config object whose pattern matches, walking top-to-bottom, and "the last matching config always wins when there is a conflict" ([Configuration Files](https://eslint.org/docs/latest/use/configure/configuration-files)).

**In March 2025 ESLint reintroduced `extends` inside flat config via `defineConfig()`.** Explicit remediation for the "spread confusion" pain: `defineConfig()` accepts an `extends` key whose value is an array of objects/arrays/strings, and auto-flattens them into the correct flat-array shape ([Evolving flat config with extends](https://eslint.org/blog/2025/03/flat-config-extends-define-config-global-ignores/)). Semantics remain last-wins — `extends` is sugar, not new override model.

**Stylelint and Biome follow the same pattern.** Stylelint: array order = precedence, last item wins; `plugins`/`extends`/`rules`/`overrides` are *appended* across inheritance, `customSyntax` is *replaced* ([Configuring — Stylelint](https://stylelint.io/user-guide/configure/)). Biome (v2): single-tool monolith with `extends` field in `biome.json`; v2 dropped the v1 requirement to use relative paths ([Biome v2 release notes](https://biomejs.dev/blog/biome-v2/)). Known bug [biome #7943](https://github.com/biomejs/biome/issues/7943): setting a rule's `fix` overrides the inherited `options` from a shared config.

**Standard answer for downstream-contradicts-upstream**: re-state the rule with desired value (`"off"`, different severity), placed *after* the extended preset in the array. No tool ships a "turn off inherited rule X" primitive.

### Pain points

- **"Spread confusion" drove ESLint to re-add `extends`** — long migration pain.
- **No provenance for resolved rules.** Trial-and-error commenting-out is the debug method.
- **Silent partial override for rule options.** Re-stating a rule with new severity does not always merge options object — varies by tool and by rule.

---

## Q3 — Policy-as-code: OPA bundles, Conftest, Gatekeeper

### OPA bundle servers end-to-end

OPA's **bundle API** is the canonical "pull rules from a remote source" pattern. `opa run --server -c config.yaml` configures HTTP "services" and a `bundles` map. Each bundle declaration names a `resource` (e.g. `somedir/bundle.tar.gz`) and polling parameters. OPA polls `GET /<service-path>/<resource>`, expects `200 OK` with `Content-Type: application/gzip` plus an `ETag` header; subsequent polls send `If-None-Match: <etag>` and the server answers `304 Not Modified` if unchanged ([OPA Management: Bundles](https://www.openpolicyagent.org/docs/management-bundles)). Defaults: `min_delay_seconds: 10`/`max_delay_seconds: 20`. A `long_polling_timeout_seconds` option lets the server hold the connection open.

**Signing.** A signed bundle contains a `.signatures.json` JWT payload listing every other file in the bundle with a SHA-256 hash, optional `keyid`, and a `scope`. OPA rejects mismatch on file list, hashes, scope, or signature. Key rotation: edit the `keys` map; OPA resolves `keyid` from CLI flag → config → JWT header.

**Fallback.** `bundles.<name>.persist: true` writes the last-activated snapshot to disk; on startup, loads from disk if bundle server is unreachable. **Sharp edge**: delta bundles (a `patch.json` with `upsert`/`replace`/`remove` ops) are *not* persisted.

**OPA Control Plane (OCP), 2026.** The new piece tying git directly to bundle server. Config declares `sources:` (git URLs with `directory:` and `paths:` list) and `bundles:` (output artifact, stored in `object_storage.filesystem` or S3-compatible) with a `requirements:` list mapping sources into bundles ([OPA Control Plane overview](https://www.openpolicyagent.org/docs/ocp)). Styra docs frame this as "environment promotion natively with Git" — dev/staging/prod = separate bundles from separate branches.

### Conftest with git-hosted policy repos

On-disk convention: `policy/` holds `.rego` files organized by package; `data/` holds org-specific values. Remote fetching uses go-getter URL syntax: `conftest pull git::https://github.com/Org/policies.git//terraform` pulls a subdirectory; OCI registries (`oci://...`) are first-class alternative ([Conftest: Sharing policies](https://www.conftest.dev/sharing/)). Reference real-world example: **rallyhealth/conftest-policy-packs** runs a GitHub App on ECS that runs Conftest on every PR and posts violations as review comments ([rallyhealth/conftest-policy-packs](https://github.com/rallyhealth/conftest-policy-packs)). Their guidance: "policies should be general-purpose; push org-specific values into `data/` imported via `--data`."

### Gatekeeper: ConstraintTemplate distribution

The **open-policy-agent/gatekeeper-library** repo is the reference pattern:

```
src/<policy-name>/src.rego           # Rego source + src_test.rego
library/<policy-name>/template.yaml  # generated ConstraintTemplate (via `make generate`)
library/<policy-name>/samples/...    # example_allowed.yaml, example_disallowed.yaml
library/<policy-name>/suite.yaml     # gator-CLI test suite
```

Teams customize **not by forking** but with **kustomize** overlays: a team kustomization references the upstream ConstraintTemplate and patches the companion Constraint (`match.namespaces`, parameters). The library uses SemVer.

### Canary / ring rollout

None of the tools ship a native "80% of clusters first" primitive. Three patterns:

1. **`enforcementAction` staging in Gatekeeper.** Constraints support `dryrun | warn | deny`; 2024+ added `scoped` + `scopedEnforcementActions` so the same constraint can be `warn` at webhook but `deny` at audit ([Gatekeeper enforcement points](https://open-policy-agent.github.io/gatekeeper/website/docs/enforcement-points/)). Standard rollout: dryrun → warn (after a week of audit) → deny.
2. **Fleet-manager staged rollouts.** Red Hat ACM 2.8+ and Azure Kubernetes Fleet Manager treat ConstraintTemplate as a placement artifact, use `maxConcurrency: 50%` ([Azure Fleet rollout strategy](https://learn.microsoft.com/en-us/azure/kubernetes-fleet/concepts-rollout-strategy)).
3. **Separate bundles per ring.** OPA/OCP: build `ring-0.tar.gz`, `ring-1.tar.gz` from same git branch, point each cluster at matching ring.

### Concrete examples

OPA config with signing + persist:
```yaml
services:
  acme: { url: https://bundles.acme.corp/v1 }
bundles:
  authz:
    service: acme
    resource: somedir/bundle.tar.gz
    persist: true
    polling: { min_delay_seconds: 10, max_delay_seconds: 20 }
    signing: { keyid: global_key, scope: read }
keys:
  global_key:
    algorithm: RS256
    key: |
      -----BEGIN PUBLIC KEY-----
      MIIB...
      -----END PUBLIC KEY-----
```

Gatekeeper constraint as dry-run:
```yaml
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sRequiredLabels
metadata: { name: ns-must-have-owner }
spec:
  enforcementAction: dryrun   # later: warn, then deny
  match: { kinds: [{apiGroups: [""], kinds: ["Namespace"]}] }
  parameters: { labels: ["owner"] }
```

### Pain points

- Bundle size / cold-start; large bundles stall OPA startup.
- Delta bundles don't persist — silent loss on bundle-server outage.
- Signature key rotation is out-of-band; no rotation protocol.
- No native percentage rollout; every team reinvents.
- Conftest pulled-git is per-machine cached; without OCI digests, CI can run stale rules silently.

---

## Q4 — Team-Synced AI Coding Rules

### Comparison Table

| Tool | Rule storage | Sync mechanism | Format | Team feature | Auto-learn from sessions? |
|------|--------------|----------------|--------|--------------|---------------------------|
| **Cursor** | `.cursor/rules/*.mdc` (project), Settings UI (user), Team Rules (Enterprise) | Git (project), cloud (team) | MDC = markdown + YAML frontmatter | Team Rules (Enterprise), activation globs | **Yes, then removed** — Memories shipped mid-2025, deprecated in 2.1.x |
| **GitHub Copilot** | `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md`, org admin UI | Git (repo), cloud (org/personal) | Markdown, optional YAML frontmatter for path scoping | Org-wide custom instructions (Business/Enterprise, GA April 2026) | No |
| **Claude Code** | `CLAUDE.md` (project), `~/.claude/CLAUDE.md` (user), `.claude/CLAUDE.local.md` (local), `managed-settings.json` (enterprise) | Git (project), MDM/server (managed) | Markdown (memory), JSON (settings) | Enterprise managed policies + managed CLAUDE.md | `#` shortcut deprecated; auto-memory directory exists; no session-level learning |
| **Windsurf / Codeium** | `.windsurf/rules/*.md` (repo), `~/.codeium/windsurf/memories/` (local auto) | Git (rules); memories NOT synced | Markdown with YAML frontmatter | Team Rules via git | **Yes** — Cascade auto-writes memories, workspace-only |
| **Amazon Q Developer** | `.amazonq/rules/*.md` | Git | Plain markdown | Per-session scan | No |
| **Continue.dev** | `.continue/rules/`, `config.yaml`, Continue Hub | Git (local) + Hub (cloud registry) | YAML config; rules markdown via `uses:` | Hub: org publishes/subscribes | No |
| **Aider** | `CONVENTIONS.md` + `.aider.conf.yml` | Git | Markdown + YAML | Commit `.aider.conf.yml` with `read: CONVENTIONS.md` | No |
| **Sourcegraph Cody (Enterprise)** | Prompt Library (cloud) | Sourcegraph cloud/self-hosted | Prompts (text) | Shared per org | No |
| **AGENTS.md** | `AGENTS.md` at repo root (nested allowed) | Git | Plain markdown | Cross-tool convention (20+ agents) | No (spec-level) |

### Cursor

Project Rules in `.cursor/rules/*.mdc`; User Rules in Settings UI (machine-local); Team Rules on Cursor Enterprise via cloud. Precedence: **Team → Project → User** ([Cursor Docs — Rules](https://cursor.com/docs/rules)).

MDC frontmatter:
```yaml
---
description: When this rule should apply
globs: ["src/**/*.ts"]
alwaysApply: false
---
```

Four activation modes: **Always** (`alwaysApply: true`), **Auto-Attached** (globs match), **Agent Requested** (description used semantically), **Manual** (`@rule-name`).

**Memories (critical negative data point for TeamAgent)**: Cursor shipped Memories mid-2025 as "automatically generated rules based on your conversations in Chat, scoped to your project." **Removed in version 2.1.x**; users were told to export and convert to explicit Rules ([Cursor Release Notes](https://releasebot.io/updates/cursor)). Privacy trade-off (chat sent to Cursor) and rule-quality issues drove rollback. Community marketplace: [awesome-cursor-rules-mdc](https://github.com/sanjeed5/awesome-cursor-rules-mdc).

### GitHub Copilot

Three storage layers, all markdown:

1. Repository-wide: `.github/copilot-instructions.md`
2. Path-specific: `.github/instructions/NAME.instructions.md` (frontmatter scopes to paths)
3. Organization: GitHub admin UI, stored in Copilot cloud (Business/Enterprise)
4. Agent fallbacks: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` at repo root ([GitHub Docs — Custom instructions support](https://docs.github.com/en/copilot/reference/custom-instructions-support))

**Counterintuitive precedence**: **Personal > Repository > Organization** ([configure custom instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions)). All three sets are delivered to the model; conflict resolution is described as "non-deterministic." Org instructions GA: **April 2, 2026** ([Copilot org instructions GA](https://github.blog/changelog/2026-04-02-copilot-organization-custom-instructions-are-generally-available/)).

### Claude Code

Four memory scopes, highest → lowest precedence: **Managed → Local (`.claude/CLAUDE.local.md`) → Project (`CLAUDE.md`) → User (`~/.claude/CLAUDE.md`)** ([Claude Code settings docs](https://code.claude.com/docs/en/settings)).

Settings JSON parallel hierarchy: `managed-settings.json` (`/Library/Application Support/ClaudeCode/`, `/etc/claude-code/`, `C:\Program Files\ClaudeCode\`) → CLI args → `.claude/settings.local.json` → `.claude/settings.json` → `~/.claude/settings.json`. **Crucially, array-valued settings merge across scopes (concatenate + dedupe)** rather than overwrite — permissions and hook lists accumulate.

**Implication for TeamAgent**: if rules are modeled as an array setting, team + personal merge cleanly without custom resolver — Claude Code does the merge.

Managed policies delivered three ways: Anthropic servers (Claude.ai admin), MDM/OS-level plist or registry, drop-in `managed-settings.d/*.json` directory ([TrueFoundry governance guide](https://www.truefoundry.com/blog/claude-code-governance-building-an-enterprise-usage-policy-from-scratch)). Managed cannot be overridden by lower scope.

**Auto-learn**: `#` shortcut (type `#` in chat to append to `CLAUDE.md`) was the manual feature; **deprecated as of late 2025** ([The `#` Prefix deprecation](https://dev.to/rajeshroyal/the-prefix-claudes-memory-feature-and-why-you-dont-need-it-anymore-3ggn)). `autoMemoryDirectory` setting exists but no session-scraping pipeline. **This is the niche TeamAgent occupies.**

### Windsurf / Codeium (closest analogue)

Two parallel systems:

- **Rules**: `.windsurf/rules/*.md`, markdown + optional YAML frontmatter, committed to git, four activation modes (always-on, @mention, glob-attached, agent-requested) ([Windsurf Cascade Memories docs](https://docs.windsurf.com/windsurf/cascade/memories)).
- **Memories**: auto-generated by Cascade when "encounters context that it believes is useful to remember," stored at `~/.codeium/windsurf/memories/` — **workspace-scoped, NOT cross-workspace, NOT committed**.

Direct doc quote: *"Memories generated in one workspace are not available in another, and they are not committed to your repository. For durable sharing with teams, if you want Cascade to remember something durably — and share it with your team — ask Cascade to write it to a Rule in `.windsurf/rules/` or to your repo's AGENTS.md instead."*

Windsurf has auto-capture but **explicitly punts on sharing**: user must manually promote a memory to a Rule. **TeamAgent's differentiation is closing exactly that loop.**

### Amazon Q Developer

`project-root/.amazonq/rules/*.md`, plain markdown, scanned on session start ([AWS Docs — Project rules](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/context-project-rules.html)). No auto-learn, no precedence model beyond "all rules in directory become context." Team sharing strictly git-based.

### Continue.dev

Three rule origins:
- **Local**: `.continue/rules/` (version-controlled)
- **Hub**: managed on Continue Mission Control, referenced in `config.yaml` with `uses:` imports
- **Inline**: in `config.yaml`

Format: `config.yaml` is YAML; rule content markdown referenced from YAML ([Continue Docs — Rules](https://docs.continue.dev/customize/rules)). Hub = team-sharing primitive: orgs publish bundles to cloud registry ([Hub vs Local](https://docs.continue.dev/guides/understanding-configs)).

### Aider

`.aider.conf.yml` loads from `~`, repo root, cwd in order (later wins). `CONVENTIONS.md` loaded via `--read CONVENTIONS.md` or wired in `.aider.conf.yml` with `read: CONVENTIONS.md`. Both committed for team sync. Community: [Aider-AI/conventions](https://github.com/Aider-AI/conventions).

### Sourcegraph Cody

Whole-codebase context model. Team customization via **Prompt Library** (org-scoped, cloud-stored). **Cody Free and Pro discontinued July 23, 2025**; only Cody Enterprise remains.

### AGENTS.md

Stewarded by **Agentic AI Foundation under Linux Foundation** (donated by OpenAI Dec 2025) ([OpenAI Agentic AI Foundation](https://openai.com/index/agentic-ai-foundation/), [agents.md](https://agents.md/)). Adoption: **60,000+ projects** by end 2025.

Format: plain markdown, any headings, no frontmatter. Nested AGENTS.md for monorepos — "agents read the nearest file in directory tree." Supporting: Codex, Jules, Factory, Aider, goose, opencode, Zed, Warp, VS Code, Devin, Cursor, RooCode, Gemini CLI, Kilo Code, Phoenix, Semgrep, GitHub Copilot, Windsurf, Augment Code (20+ total).

**Caveat (see Methodology)**: Recent ETH Zurich research reportedly concludes AGENTS.md files often *hinder* AI coding agents, recommending omission of LLM-generated context files ([InfoQ](https://www.infoq.com/news/2026/03/agents-context-file-value-review/), [arXiv](https://arxiv.org/html/2601.20404v1)). Implication for TeamAgent: hand-curated context files can hurt; auto-captured ones risk hurting more — **scoring/pruning is load-bearing, not optional.**

### Closest analogues to TeamAgent

**#1: Windsurf Cascade Memories.** Same loop (observe session → extract rule → persist), same local-only storage default. Gap they refuse to close = TeamAgent's thesis. Borrow: (a) dual-scope design (workspace memories alongside committed rules), (b) friction between "private memory" and "team rule" is fine if promotion is one command.

**#2: Cursor Memories (retired).** Cautionary tale. Their failure modes: privacy (third-party data share), quality decay, no easy reject. TeamAgent's wins: local-only processing, hit-count pruning, scoring already in place. **Lesson: ship a one-click "reject this rule" / "never learn from this turn" path on day one.**

**#3: Claude Code's array-merging settings hierarchy.** If TeamAgent models rules as array setting under `~/.claude/settings.json` (user) + `.claude/settings.json` (team) + `managed-settings.json` (enterprise), conflict resolution is **inherited from Claude Code itself — no custom resolver needed**. Worth evaluating vs. current CLAUDE.md append.

**#4: Continue Hub / Copilot org instructions / Cursor Team Rules.** Cloud-registry models. For single-team MVP, git is cheaper. Hub is the cross-org upgrade path.

### TeamAgent's white space (no competitor ships):

1. **Auto-capture + auto-sync in one pipeline.** Windsurf has capture but not sync; Cursor/Copilot have sync but not capture; Claude Code's `#` is deprecated.
2. **Per-developer rules that reach coworkers via git.** Copilot's Personal > Repo > Org actually forbids this. Windsurf keeps memories workspace-local. Claude Code's `~/.claude/CLAUDE.md` is strictly local. **TeamAgent's "my lesson becomes coworker's default" is novel.**
3. **Hit-count-based pruning.** No competitor surfaces confidence/hit-rate in rule format.

---

## Q5 — Conflict Resolution Patterns

Dominant pattern across surveyed tools: **ordered last-write-wins with explicit merge order**, *not* voting or contested-status flags.

| Tool | Mechanism |
|------|-----------|
| **Renovate** | `extends:` array position; "last preset wins"; repo > preset > inherited > global. Pain: precedence not uniform across all options ([discussion #39985](https://github.com/renovatebot/renovate/discussions/39985)). |
| **ESLint flat config** | "Later object takes precedence." Workaround for Prettier conflict: put `eslint-config-prettier` *last* in array. |
| **Helm** | `chart/values.yaml` → each `-f` left-to-right → `--set` on CLI. Issue [#9940](https://github.com/helm/helm/issues/9940): semantics silently changed across versions. |
| **Terraform modules** | No merge — each `module "x"` installs own copy. Conflict surfaces as version constraint violation. Resolution: open issue against restrictive module ([hashicorp/terraform #37405](https://github.com/hashicorp/terraform/issues/37405)). |
| **OPA / Rego** | No built-in conflict rule between `allow`/`deny`; author writes explicitly: `default authz := false; authz { allow; not deny }`. OPA FAQ: "resolving conflicts is arguably a policy-decision too." |

### Manual / human resolution primitives

**No popular tool ships a "this rule is contested" data model.** Gating happens at git layer:

- **CODEOWNERS + required reviewers.** GitHub's 2025 Ruleset "require review from specific teams" went GA Feb 2026 ([GitHub Changelog 2026-02-17](https://github.blog/changelog/2026-02-17-required-reviewer-rule-is-now-generally-available/), [2025-11-03](https://github.blog/changelog/2025-11-03-required-review-by-specific-teams-now-available-in-rulesets/)). Two contributors with contradictory rules go through same reviewer set; debate in PR thread.
- **RFC / consensus.** Projects needing governance above code adopt IETF rough consensus (RFC 7282) or explicit `+2 -1` voting ([RFC 7282](https://www.rfc-editor.org/rfc/rfc7282)). No code tooling enforces — purely social.

### Concrete examples

ESLint flat config — put prettier last:
```js
export default [
  js.configs.recommended,
  tsPlugin.configs.recommended,
  prettierConfig,  // MUST be last to win style conflicts
];
```

OPA explicit precedence (author chooses deny-wins):
```rego
default authz := false
authz if { allow; not deny }
```

CODEOWNERS:
```
/policies/security/   @acme/security-reviewers
/policies/networking/ @acme/net-reviewers
```

### Pain points

- **Silent override.** Last-write-wins is invisible — contributor doesn't see their rule was masked. Renovate/ESLint users repeatedly file "my rule doesn't apply" issues that turn out to be ordering.
- **No first-class "contested" state.** Closest: Gatekeeper's `dryrun` (apply but don't enforce) — ad-hoc.
- **Order-dependence is version-sensitive.** Helm #9940 = canonical footgun.
- **Voting doesn't scale.** RFC `+2 -1` works for 20-person maintainer set; 200-dev repo = quorum problem.

**TeamAgent design implication**: the existing tier system (canonical/enforced/experimental) + hit_count gives us a natural tie-breaker that nobody else has. Adding `status: contested` flag for explicit human-needed-here is genuinely novel and addresses the "silent override" pain across the entire ecosystem.

---

## Q6 — File Format Choice

| Tool | Rule content | Config sidecar | Frontmatter? |
|------|--------------|----------------|--------------|
| Cursor | Markdown (MDC) | — | YAML frontmatter (`description`, `globs`, `alwaysApply`) |
| Copilot | Markdown | — | Optional YAML for path scoping |
| Claude Code | Markdown (CLAUDE.md) | JSON (`settings.json`) | No (free-form markdown) |
| Windsurf | Markdown | — | Optional YAML frontmatter |
| Amazon Q | Markdown | — | No |
| AGENTS.md | Markdown | — | No (plain headings) |
| Continue | Markdown via YAML refs | `config.yaml` | Via `uses:` in YAML |
| Aider | Markdown (CONVENTIONS.md) | `.aider.conf.yml` | No |

Dominant pattern: **markdown for rule content, optional YAML frontmatter for activation metadata**. JSON only where tool treats config as machine state. TOML does not appear. **No AI coding tool has shipped a custom DSL for rules.**

### Tradeoff analysis

- **Diffability (PR review)**: Markdown wins big — line-level diffs human-reviewable. Structured JSON/YAML produces noisier diffs from reformatting.
- **Human editability**: Markdown > YAML > JSON > TOML > custom DSL. Devs already edit markdown for READMEs; zero cognitive switch.
- **Schema validation**: JSON/YAML > Markdown. For TeamAgent fields (`hit_count`, `score`, `scope`, `category`), structured header is load-bearing — exactly why Cursor chose MDC.
- **Model consumption**: LLMs parse markdown natively, benefit from headings as section cues. Plain markdown outperforms JSON-wrapped strings for instruction-following.
- **Tooling**: Markdown has 10+ linters, every editor; YAML has JSON Schema validators; JSON easiest to programmatically generate; custom DSLs (Rego) best expressiveness but tooling tax.

### Recommendation for TeamAgent

**Adopt MDC convention**: YAML frontmatter with machine fields (`score`, `hits`, `scope`, `category`, `created`, `source_session`) + markdown body with rule text.

Concrete payoffs:
1. Free compatibility with any tool reading Cursor rules.
2. Frontmatter trivially machine-parseable for scoring/pruning/merging.
3. Body renders readably on GitHub — PR reviewers see prose not JSON.
4. Array-merge across Claude Code scopes works if rules = files in scanned directory (parallel to `.amazonq/rules/`, `.windsurf/rules/`).

**Avoid**: single giant JSON blob (diff hell), custom DSL (tooling cost), TOML (no precedent).

---

## Q7 — Privacy / Secret Leakage

### Pre-commit secret scanners (2025–2026 stack)

- **Gitleaks**: ~160 secret types via regex+entropy. Sub-second staged-diff scan, SARIF/JSON/CSV output. Best as default blocker — no API calls ([gitleaks/gitleaks](https://github.com/gitleaks/gitleaks)).
- **TruffleHog v3**: ~800 detectors + **live verification** (calls issuer APIs to check key validity). Recommendation: "Gitleaks at pre-commit for speed, TruffleHog `--results=verified --fail` in CI for signal" ([TruffleHog vs Gitleaks](https://www.jit.io/resources/appsec-tools/trufflehog-vs-gitleaks-a-detailed-comparison-of-secret-scanning-tools)).
- **ggshield (GitGuardian)**: ~550 detectors, commercial backend, org-wide dashboards across GitHub/GitLab/Slack/Jira.
- **detect-secrets**: Yelp's hook with committed baseline file; good for legacy repos.

Sample `.pre-commit-config.yaml`:
```yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.x
    hooks: [{id: gitleaks}]
  - repo: https://github.com/trufflesecurity/trufflehog
    rev: v3.x
    hooks:
      - id: trufflehog
        args: ["git", "file://.", "--since-commit", "HEAD", "--only-verified", "--fail"]
```

### Patterns for committing "lessons learned" without leakage

**The AI-rules ecosystem has no standard scrubber.** Practical patterns:

1. **Two-file split.** `.cursor/rules/` in git (team) vs. global Cursor config (`~/.cursor/...`) for personal preferences ([nedcodes: Sharing Cursor rules across team](https://nedcodes.dev/guides/cursor-rules-for-teams)).
2. **Secret-proxy pattern.** Continue.dev: proxies LLM requests through `api.continue.dev` so secrets live server-side; rule files reference org secrets with `${{ secrets.ANTHROPIC_API_KEY }}` mustache ([Continue.dev: Secret Types](https://docs.continue.dev/mission-control/secrets/secret-types)).
3. **Pre-commit gate on rules file path.** No tool auto-scrubs; teams rely on generic Gitleaks/TruffleHog catching `OPENAI_API_KEY=sk-…` before it lands in `.cursor/rules/*.mdc` or `CLAUDE.md`.

### Prior incidents

- **$87K OpenAI-key incident (Jan 2024)**: Developer committed key to JS source; bots harvested it within 4 hours ([CursorGuard writeup](https://cursorguard.com/blog/87k-api-key-disaster/)).
- **Cursor `.cursorignore` bypass (2024)**: Cursor sent `.env` contents to its servers for tab-completion even when listed in `.cursorignore` ([Knostic: From .env to Leakage](https://www.knostic.ai/blog/claude-cursor-env-file-secret-leakage)).
- **Claude Desktop MCP config leaks**: `claude_desktop_config.json` / `.mcp.json` routinely contain API tokens in `env:` blocks ([Knostic: AI Assistants Leak Secrets](https://www.knostic.ai/blog/ai-coding-assistants-leaking-secrets)).
- **Scale**: Snyk: 28M credentials leaked on GitHub in 2025; repos using AI coding tools show ~40% higher secret-exposure rate ([Snyk: State of Secrets 2025](https://snyk.io/articles/state-of-secrets/)).

### Pain points

- **No AI rules tool auto-scrubs before commit.** Cursor, Claude Code rules, Copilot, Continue.dev — none ship a pre-save redactor for emails/internal URLs/paths. Community answer: "add a git pre-commit hook" — out-of-band, devs skip it.
- **`.cursorignore` / `.gitignore` are advisory.** 2024 incident proves ignore lists aren't enforcement boundaries when agents read FS directly.
- **MCP/tool-config files are the new leak surface.** Tokens in `env:` blocks of `.mcp.json` get committed because devs treat the file as "config" not "code."
- **Verified-vs-regex tradeoff.** Verified scans (TruffleHog) are slow and call issuer APIs (which log); regex-only (Gitleaks) has false positives that train devs to `--no-verify`.
- **"Lessons learned" text** often encodes internal hostnames (`prod-db.internal.acme.corp`), repo slugs, user emails — **none of standard scanners catch these**. **TeamAgent needs a separate PII/internal-identifier redactor, not just a secret scanner.**

---

## Methodology

- **Tools**: WebSearch + WebFetch (firecrawl/exa MCP unavailable in this environment).
- **Parallelization**: 3 subagents working in parallel — Agent 1 (Q1+Q2 Renovate/ESLint), Agent 2 (Q3+Q5+Q7 OPA/conflicts/secrets), Agent 3 (Q4+Q6 AI rules/format).
- **Sources**: ~70 unique URLs across official docs, vendor blogs, GitHub issues/discussions, security research.
- **Date filter**: prefer 2024–2026 sources; some 2020+ for long-running open issues.
- **Synthesis**: This document by main session, combining 3 agent outputs verbatim with light editing for cross-reference and key-takeaway tables.

### Caveats — verify before citing externally

- **arxiv 2601.20404 (ETH Zurich AGENTS.md study)**: arxiv ID format `2601` is suspicious (paper IDs are `YYMM.NNNNN`; 2601 = January 2026 which is plausible, but worth a manual lookup before quoting). Also the InfoQ piece referencing it ([InfoQ link](https://www.infoq.com/news/2026/03/agents-context-file-value-review/)) — if either source is wrong, the "AGENTS.md hurts agents" claim becomes weaker. Conservative position: **scoring/pruning is still good architecture regardless** — supported independently by Cursor Memories' rollback for quality issues.
- **Some GitHub discussion / issue numbers** (e.g. Renovate #14701, #18437, #39985; ESLint #20500; Helm #9940) were cited via search snippets without my direct fetch. Numbers are likely correct but worth click-through if they appear in the final design doc.
- **Cursor Memories deprecation** — confirmed via multiple sources (release notes + community threads) but exact deprecated-in-2.1.x version should be re-verified before quoting in user-facing material.
