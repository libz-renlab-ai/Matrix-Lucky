#!/usr/bin/env bash
# A/B benchmark: bare Claude (arm-a) vs TeamAgent-armed Claude (arm-b)
# Constraint: ≤25 claudefast calls total (exactly 20: 10 probes × 2 arms)
# Output: docs/features/ab-benchmark/judge.json
set -euo pipefail

BENCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$BENCH_DIR/../../.." && pwd)"
TS="$(date +%Y%m%dT%H%M%S)"
OUT_DIR="${JUDGE_DIR:-/tmp/.judge/ab/$TS}"
mkdir -p "$OUT_DIR"

PROBES_FILE="$BENCH_DIR/probes.json"
ARM_B_RULES="$BENCH_DIR/arm-b-rules.json"

ARM_A_DIR="$OUT_DIR/arm-a"
ARM_B_DIR="$OUT_DIR/arm-b"
ARM_A_CONFIG="$OUT_DIR/arm-a-config"
ARM_B_CONFIG="$OUT_DIR/arm-b-config"
mkdir -p "$ARM_A_DIR" "$ARM_B_DIR" "$ARM_A_CONFIG" "$ARM_B_CONFIG"

# ── Build arm-b CLAUDE.md with injected rules ──────────────────────────────
ARM_B_CLAUDE_MD="$ARM_B_CONFIG/CLAUDE.md"

python3 - "$ARM_B_RULES" "$ARM_B_CLAUDE_MD" << 'PYEOF'
import json, sys
rules_file, out_file = sys.argv[1], sys.argv[2]
with open(rules_file) as f:
    entries = json.load(f)['entries']
lines = ["# TeamAgent Armed Rules (injected for A/B benchmark)\n",
         "The following rules must be applied when responding:\n\n"]
for r in entries:
    lines.append(f"- AVOID: {r['wrong_pattern']} | PREFER: {r['correct_pattern']} (reason: {r['reasoning']})\n")
with open(out_file, 'w') as f:
    f.writelines(lines)
PYEOF

# ── Run all probes (20 claudefast calls: 10 probes × 2 arms) ──────────────
echo "Running 20 probes (10 probes × 2 arms)..."

run_probe() {
  local arm_label="$1" config_dir="$2" probe_id="$3" prompt="$4" out_file="$5"
  printf "  probe %s %s... " "$probe_id" "$arm_label"
  CLAUDE_CONFIG_DIR="$config_dir" \
    claudefast -p "$prompt" \
      --max-turns 2 \
      --permission-mode acceptEdits \
      --output-format text \
      > "$out_file" 2>&1 || true
  echo "done"
}

# Parse probes and run sequentially
python3 - "$PROBES_FILE" "$ARM_A_DIR" "$ARM_B_DIR" "$ARM_A_CONFIG" "$ARM_B_CONFIG" << 'PYPROBES'
import json, subprocess, sys, os

probes_file, arm_a_dir, arm_b_dir, arm_a_config, arm_b_config = sys.argv[1:]
with open(probes_file) as f:
    probes = json.load(f)['probes']

for p in probes:
    probe_id = p['id']
    prompt = p['prompt']
    for arm_label, config_dir, out_dir in [
        ('arm-a', arm_a_config, arm_a_dir),
        ('arm-b', arm_b_config, arm_b_dir),
    ]:
        out_file = f"{out_dir}/{probe_id}.txt"
        env = {**os.environ, 'CLAUDE_CONFIG_DIR': config_dir}
        try:
            result = subprocess.run(
                ['claudefast', '-p', prompt,
                 '--max-turns', '2',
                 '--permission-mode', 'acceptEdits',
                 '--output-format', 'text'],
                env=env, capture_output=True, text=True, timeout=90
            )
            with open(out_file, 'w') as f:
                f.write(result.stdout + result.stderr)
        except Exception as e:
            with open(out_file, 'w') as f:
                f.write(str(e))
PYPROBES

# ── Score results ──────────────────────────────────────────────────────────
echo "Scoring results..."

python3 - "$PROBES_FILE" "$ARM_A_DIR" "$ARM_B_DIR" "$OUT_DIR" "$BENCH_DIR" "$TS" << 'PYSCORE'
import json, re, sys, os
from pathlib import Path

probes_file, arm_a_dir, arm_b_dir, out_dir, bench_dir, ts = sys.argv[1:]

with open(probes_file) as f:
    probes = json.load(f)['probes']

per_probe = []
for p in probes:
    pattern = re.compile(p['mistake_regex'], re.IGNORECASE)
    a_path = f"{arm_a_dir}/{p['id']}.txt"
    b_path = f"{arm_b_dir}/{p['id']}.txt"
    a_text = Path(a_path).read_text() if os.path.exists(a_path) else ''
    b_text = Path(b_path).read_text() if os.path.exists(b_path) else ''
    a_mistake = bool(pattern.search(a_text))
    b_mistake = bool(pattern.search(b_text))
    per_probe.append({
        'probe_id': p['id'],
        'name': p['name'],
        'rule_tag': p['rule_tag'],
        'arm_a_mistake': a_mistake,
        'arm_b_mistake': b_mistake,
        'avoided': a_mistake and not b_mistake,
        'arm_a_response_path': a_path,
        'arm_b_response_path': b_path,
    })

mistake_a = sum(1 for r in per_probe if r['arm_a_mistake'])
mistake_b = sum(1 for r in per_probe if r['arm_b_mistake'])
reduction_pct = round(1 - mistake_b / mistake_a, 4) if mistake_a > 0 else None
passed = reduction_pct is not None and reduction_pct >= 0.50

judge = {
    'run_id': f'ab-{ts}',
    'recipe_id': 'AB-BENCHMARK-001',
    'timestamp': __import__('datetime').datetime.utcnow().isoformat() + 'Z',
    'probes_total': len(probes),
    'arm_a_label': 'bare-claude (no rules)',
    'arm_b_label': 'teamagent-armed (10 rules)',
    'metrics': {
        'mistake_repeated_a': mistake_a,
        'mistake_repeated_b': mistake_b,
        'reduction_pct': reduction_pct,
        'avoided_count': sum(1 for r in per_probe if r['avoided']),
    },
    'assertion': {
        'reduction_pct_gte_050': passed,
        'result': 'PASS' if passed else 'FAIL',
    },
    'missing_evidence': False,
    'per_probe': per_probe,
    'evidence_dir': out_dir,
}

judge_path = os.path.join(out_dir, 'judge.json')
with open(judge_path, 'w') as f:
    json.dump(judge, f, indent=2)

# canonical copy
canonical_path = os.path.join(bench_dir, 'judge.json')
with open(canonical_path, 'w') as f:
    json.dump(judge, f, indent=2)

print(json.dumps({'judge_file': judge_path, 'result': judge['assertion']['result'],
                  'reduction_pct': reduction_pct}, indent=2))
PYSCORE

echo ""
echo "Judge output: $OUT_DIR/judge.json"
echo "Canonical:    $BENCH_DIR/judge.json"
echo ""

# ── Final assertion (read from file, not recompute) ────────────────────────
RESULT="$(python3 -c "import json; print(json.load(open('$BENCH_DIR/judge.json'))['assertion']['result'])")"
REDUCTION="$(python3 -c "import json; print(json.load(open('$BENCH_DIR/judge.json'))['metrics']['reduction_pct'])")"

echo "reduction_pct = $REDUCTION"
echo "Assertion (reduction_pct >= 0.50): $RESULT"

if [ "$RESULT" = "PASS" ]; then
  echo "BENCHMARK PASS"
  exit 0
else
  echo "BENCHMARK FAIL — reduction below 0.50"
  exit 1
fi
