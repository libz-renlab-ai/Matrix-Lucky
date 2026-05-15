## Required canned-answer for slug=attribution-bus

```
AttributionBus + Functional Core Boundary
==========================================

Rule (from CLAUDE.md):
  "归因必须走 AttributionBus。组件不得直接 console.log 用户可见信息。
  所有'系统帮你做了什么'通过 bus.emit(event) 发结构化事件，由 Renderer 渲染。
  违反此约定的 PR 不接受。"

  "Functional Core, Imperative Shell。packages/core/ 下禁止 import fs / node:fs /
  node:child_process / 任何 IO 模块。核心逻辑必须是纯函数。"

Harness checks (attribution-bus/run-judge.sh):
  1. vitest passes for attribution adapter tests:
       packages/adapters/src/attribution/__tests__/in-memory-bus.test.ts
       packages/adapters/src/attribution/__tests__/stdout-renderer.test.ts
  2. Mechanical emit/drain/subscribe via node --input-type=module:
       bus.emit(evt)  → drain_count == 1
       bus.subscribe() → subCount increments before unsub
       buf_after_drain == 2 (drain cleared first batch; new emits after)
  3. No IO imports in packages/core/src (grep check):
       AVOID: from 'node:fs' / from 'fs' / from 'node:child_process'

Verify script (verify-canned-answer.sh) additionally checks:
  - grep -r "AttributionBus|attribution.*bus" packages/core/src --include='*.ts' finds files
  - grep -rE "from ['\"']node:?(fs|child_process)['\"']" packages/core/src --include='*.ts' finds NOTHING

PASS = vitest_ok AND bus_ok (drain/subscribe/buf all correct) AND no IO imports in core

Judge output: .judge/attribution-bus/<run_id>/judge.json
  Fields: run_id, exit_code, vitest_pass_count, vitest_fail_count, vitest_ok,
          drain_count, sub_count_before_unsub, buf_after_drain, bus_ok,
          overall_pass, evidence_dir, stdout_path

Run:    docs/plans/docs--features--attribution-bus--run-judge/judge.md (archived: docs/legacy/judge-scripts/docs/features/attribution-bus/run-judge.sh)
Verify: docs/plans/docs--features--attribution-bus--verify-canned-answer/judge.md (archived: docs/legacy/judge-scripts/docs/features/attribution-bus/verify-canned-answer.sh)
```
