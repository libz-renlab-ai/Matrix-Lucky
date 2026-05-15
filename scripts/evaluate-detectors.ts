#!/usr/bin/env node
/**
 * Detector 评测脚本。
 *
 * 读取 fixtures/sessions/_manifest.json 里的 ground truth，
 * 对每个 fixture 跑 correction + success detector，
 * 计算精确率 / 召回率，并打印逐条对比详情。
 *
 * 运行方式: pnpm tsx scripts/evaluate-detectors.ts
 */
import nodeFs from "node:fs";
import path from "node:path";
import {
  parseSessionFile,
  ruleBasedCorrectionDetector,
  ruleBasedSuccessDetector,
} from "../packages/core/src/index.js";

interface Expected {
  turn_index?: number;
  signal: string;
  min_weight: number;
  note?: string;
}

interface ManifestEntry {
  file: string;
  expected_corrections: Expected[];
  expected_successes: Expected[];
  note?: string;
}

interface Manifest {
  fixtures: ManifestEntry[];
}

const REPO_ROOT = process.cwd();
const FIXTURE_DIR = path.join(REPO_ROOT, "fixtures", "sessions");

function loadManifest(): Manifest {
  const raw = nodeFs.readFileSync(path.join(FIXTURE_DIR, "_manifest.json"), "utf-8");
  return JSON.parse(raw) as Manifest;
}

interface MatchResult {
  matched: number;
  missed: number;
  extra: number;
  detailMissed: Expected[];
  detailExtra: Array<{ signal: string; turnIndex: number; weight: number }>;
}

function matchSignals<T extends { signal: string; turnIndex: number; weight: number }>(
  detected: T[],
  expected: Expected[],
): MatchResult {
  const expectedCopy = expected.slice();
  const detectedCopy = detected.slice();
  const detailMissed: Expected[] = [];
  let matched = 0;

  // 每条 expected 找一个 detected 匹配（signal 一致 + weight 达标 + turn_index 接近）
  for (const exp of expectedCopy) {
    const idx = detectedCopy.findIndex((d) => {
      if (d.signal !== exp.signal) return false;
      if (d.weight < exp.min_weight) return false;
      if (exp.turn_index !== undefined && Math.abs(d.turnIndex - exp.turn_index) > 0) {
        return false;
      }
      return true;
    });
    if (idx >= 0) {
      matched++;
      detectedCopy.splice(idx, 1);
    } else {
      detailMissed.push(exp);
    }
  }

  return {
    matched,
    missed: detailMissed.length,
    extra: detectedCopy.length,
    detailMissed,
    detailExtra: detectedCopy.map((d) => ({
      signal: d.signal,
      turnIndex: d.turnIndex,
      weight: d.weight,
    })),
  };
}

function main(): void {
  const manifest = loadManifest();

  let totalExpectedCorr = 0;
  let totalExpectedSucc = 0;
  let totalDetectedCorr = 0;
  let totalDetectedSucc = 0;
  let totalMatchedCorr = 0;
  let totalMatchedSucc = 0;

  console.log(`📊 Detector 评测 (对 ${manifest.fixtures.length} 条 fixture)`);
  console.log("━".repeat(72));

  for (const entry of manifest.fixtures) {
    const fp = path.join(FIXTURE_DIR, entry.file);
    const session = parseSessionFile(nodeFs.readFileSync(fp, "utf-8"));
    const dCorr = ruleBasedCorrectionDetector.detect(session);
    const dSucc = ruleBasedSuccessDetector.detect(session);

    const mCorr = matchSignals(dCorr, entry.expected_corrections);
    const mSucc = matchSignals(dSucc, entry.expected_successes);

    totalExpectedCorr += entry.expected_corrections.length;
    totalExpectedSucc += entry.expected_successes.length;
    totalDetectedCorr += dCorr.length;
    totalDetectedSucc += dSucc.length;
    totalMatchedCorr += mCorr.matched;
    totalMatchedSucc += mSucc.matched;

    const ok =
      mCorr.missed === 0 &&
      mSucc.missed === 0 &&
      mCorr.extra === 0 &&
      mSucc.extra === 0;

    console.log(
      `${ok ? "✅" : "⚠️ "} ${entry.file.padEnd(34)}  ` +
        `C: ${mCorr.matched}/${entry.expected_corrections.length}hit +${mCorr.extra}extra  ` +
        `S: ${mSucc.matched}/${entry.expected_successes.length}hit +${mSucc.extra}extra`,
    );
    for (const m of mCorr.detailMissed) {
      console.log(`    MISS correction: ${m.signal} @turn${m.turn_index ?? "?"}`);
    }
    for (const e of mCorr.detailExtra) {
      console.log(`    EXTRA correction: ${e.signal} @turn${e.turnIndex}`);
    }
    for (const m of mSucc.detailMissed) {
      console.log(`    MISS success: ${m.signal} @turn${m.turn_index ?? "?"}`);
    }
    for (const e of mSucc.detailExtra) {
      console.log(`    EXTRA success: ${e.signal} @turn${e.turnIndex}`);
    }
  }

  console.log("━".repeat(72));
  console.log("总计:");

  const corrPrecision =
    totalDetectedCorr > 0 ? totalMatchedCorr / totalDetectedCorr : 1;
  const corrRecall =
    totalExpectedCorr > 0 ? totalMatchedCorr / totalExpectedCorr : 1;
  const succPrecision =
    totalDetectedSucc > 0 ? totalMatchedSucc / totalDetectedSucc : 1;
  const succRecall =
    totalExpectedSucc > 0 ? totalMatchedSucc / totalExpectedSucc : 1;

  console.log(
    `  Correction: precision ${(corrPrecision * 100).toFixed(0)}% ` +
      `(${totalMatchedCorr}/${totalDetectedCorr}), ` +
      `recall ${(corrRecall * 100).toFixed(0)}% ` +
      `(${totalMatchedCorr}/${totalExpectedCorr})`,
  );
  console.log(
    `  Success:    precision ${(succPrecision * 100).toFixed(0)}% ` +
      `(${totalMatchedSucc}/${totalDetectedSucc}), ` +
      `recall ${(succRecall * 100).toFixed(0)}% ` +
      `(${totalMatchedSucc}/${totalExpectedSucc})`,
  );
  console.log("");

  // Spec 阈值：precision >85%, recall >70%
  const PASS_P = 0.85;
  const PASS_R = 0.7;
  const corrPass = corrPrecision >= PASS_P && corrRecall >= PASS_R;
  const succPass = succPrecision >= PASS_P && succRecall >= PASS_R;
  console.log(
    `  Correction 达标 (precision>=85%, recall>=70%): ${corrPass ? "✅" : "❌"}`,
  );
  console.log(
    `  Success    达标 (precision>=85%, recall>=70%): ${succPass ? "✅" : "❌"}`,
  );

  if (!corrPass || !succPass) process.exit(1);
}

main();
