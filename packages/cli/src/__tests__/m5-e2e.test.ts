/**
 * M5 (v0.10.0) 端到端验证
 *
 * 覆盖 M5 新增的核心功能：
 * - Scenario 1: Tier-2 对 userMessage 做语义检索，注入相关规则
 * - Scenario 2: Tier-1 仅在 isFirstPrompt=true 时基于技术栈检索
 * - Scenario 3: sessionSeenIds 跨 turn 去重（已注入的规则不再注入）
 * - Scenario 4: rerankByConfidence 使高置信度规则排在前面
 * - Scenario 5: 空 DB → 不崩溃，安静返回空结果
 * - Scenario 6 (bug fix): project DB 里 personal/team-scope 规则能被检索到
 *   根因：queryRules scope 覆盖不完整，project DB 实际规则被过滤掉 → 零命中
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb, syncRuleVectors } from "@teamagent/adapters";
import { retrieveRulesForPrompt, buildTechStackText } from "../user-prompt-rule-retriever.js";
import type { KnowledgeEntry } from "@teamagent/types";

// 384-dim 确定性 stub embedder（同 m4b-e2e.test.ts，无 Xenova 依赖）
const stubEmbedder = {
  modelId: "stub-e2e",
  dim: 384,
  async embed(texts: string[]) {
    return texts.map((t) => {
      const v = new Array(384).fill(0.5);
      let hash = 0;
      for (let i = 0; i < t.length; i++) {
        hash = ((hash * 31 + t.charCodeAt(i)) & 0xffff);
      }
      v[hash % 384] += 0.5;
      const n = Math.sqrt(v.reduce((s: number, x: number) => s + x * x, 0));
      return v.map((x: number) => x / n);
    });
  },
};

function mkRule(overrides: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    id: "stub",
    scope: { level: "global" },
    category: "E",
    tags: [],
    type: "avoidance",
    nature: "objective",
    trigger: "trigger text",
    wrong_pattern: "",
    correct_pattern: "correct pattern text",
    reasoning: "",
    confidence: 0.9,
    enforcement: "warn",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: new Date().toISOString(),
    last_hit_at: "",
    last_validated_at: new Date().toISOString(),
    source: "accumulated",
    conflict_with: [],
    current_tier: "canonical",       // tier_factor=1.0，reranked_score = raw_score * confidence
    max_tier_ever: "canonical",
    tier_entered_at: new Date().toISOString(),
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    channel: "tool-action",
    fire_threshold: 0.1,             // 低于 scoreSoftAnd 输出值（~0.8），确保 pre-rerank 通过
    threshold_alpha: 1.0,
    threshold_beta: 1.0,
    embedder_model_id: "stub-e2e",
    trigger_description: "stub trigger description",
    pattern_description: "stub pattern description",
    ...overrides,
  };
}

async function seedRule(db: ReturnType<typeof openDb>, rule: KnowledgeEntry): Promise<void> {
  db.prepare(`
    INSERT OR REPLACE INTO knowledge (
      id, scope_level, category, tags, type, nature,
      trigger, wrong_pattern, correct_pattern, reasoning,
      confidence, enforcement, status, hit_count, success_count,
      override_count, evidence, source, conflict_with,
      created_at, last_hit_at, last_validated_at,
      current_tier, max_tier_ever, tier_entered_at,
      demerit, demerit_last_updated, resurrect_count, channel,
      trigger_description, pattern_description, fire_threshold,
      threshold_alpha, threshold_beta, embedder_model_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    rule.id, rule.scope.level, rule.category, JSON.stringify(rule.tags),
    rule.type, rule.nature, rule.trigger, rule.wrong_pattern ?? "",
    rule.correct_pattern, rule.reasoning, rule.confidence, rule.enforcement,
    rule.status, rule.hit_count, rule.success_count, rule.override_count,
    JSON.stringify(rule.evidence), rule.source, JSON.stringify(rule.conflict_with),
    rule.created_at, rule.last_hit_at, rule.last_validated_at,
    rule.current_tier, rule.max_tier_ever, rule.tier_entered_at,
    rule.demerit, rule.demerit_last_updated, rule.resurrect_count, rule.channel ?? "",
    rule.trigger_description ?? "", rule.pattern_description ?? "",
    rule.fire_threshold ?? 0.1, rule.threshold_alpha ?? 1.0,
    rule.threshold_beta ?? 1.0, rule.embedder_model_id ?? "",
  );

  // 写入向量（不 try/catch：若 sqlite-vec 缺失，测试应直接失败而不是悄悄通过）
  const [tvec, pvec] = await stubEmbedder.embed([
    rule.trigger_description ?? "",
    rule.pattern_description ?? "",
  ]);
  syncRuleVectors(db, rule.id, new Float32Array(tvec!), new Float32Array(pvec!));
}

// ─── 公共 setup ───────────────────────────────────────────────────────────────

let tmpDir: string;
let globalDbPath: string;
let projectDbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "m5-e2e-"));
  globalDbPath = join(tmpDir, "global.db");
  projectDbPath = join(tmpDir, "project.db");  // 大多数 scenario 不使用此路径
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Scenario 1: Tier-2 语义检索 ─────────────────────────────────────────────

describe("Scenario 1: Tier-2 检索将语义相关规则注入", () => {
  it("userMessage 语义命中规则 → tier2Rules 包含该规则，injectionText 带 T2 标签和 correct_pattern", async () => {
    const queryText = "implement HTTP API endpoint";
    const db = openDb(globalDbPath);
    const rule = mkRule({
      id: "http-api-rule",
      trigger_description: queryText,      // 与查询完全一致 → cosine ≈ 1.0
      pattern_description: queryText,
      correct_pattern: "先写接口契约测试",
      confidence: 0.9,
      current_tier: "canonical",
    });
    await seedRule(db, rule);
    db.close();

    const result = await retrieveRulesForPrompt({
      userMessage: queryText,
      cwd: process.cwd(),
      projectDbPath: join(tmpDir, "nonexistent.db"),  // 故意不存在
      globalDbPath,
      sessionSeenIds: new Set(),
      isFirstPrompt: false,
      embedder: stubEmbedder as any,
    });

    expect(result.tier2Rules.length).toBeGreaterThanOrEqual(1);
    expect(result.tier2Rules.map((r) => r.id)).toContain("http-api-rule");
    expect(result.injectionText).toContain("T2");
    expect(result.injectionText).toContain("先写接口契约测试");
  });
});

// ─── Scenario 2: Tier-1 仅首 prompt 触发 ─────────────────────────────────────

describe("Scenario 2: Tier-1 仅在 isFirstPrompt=true 时触发", () => {
  it("isFirstPrompt=true → tier1Rules 非空；isFirstPrompt=false → tier1Rules 为 []", async () => {
    // 用实际技术栈文本作为 trigger_description，使 Tier-1 查询能命中
    const techText = buildTechStackText(process.cwd());
    const db = openDb(globalDbPath);
    const rule = mkRule({
      id: "tech-stack-rule",
      trigger_description: techText,
      pattern_description: techText,
      correct_pattern: "遵循技术栈最佳实践",
      confidence: 0.9,
      current_tier: "canonical",
    });
    await seedRule(db, rule);
    db.close();

    // 首次 prompt：Tier-1 应触发
    const firstResult = await retrieveRulesForPrompt({
      userMessage: "随便一条用户消息",
      cwd: process.cwd(),
      projectDbPath: join(tmpDir, "nonexistent.db"),
      globalDbPath,
      sessionSeenIds: new Set(),
      isFirstPrompt: true,
      embedder: stubEmbedder as any,
    });
    expect(firstResult.tier1Rules.length).toBeGreaterThanOrEqual(1);
    expect(firstResult.tier1Rules.map((r) => r.id)).toContain("tech-stack-rule");

    // 后续 prompt：Tier-1 不触发
    const laterResult = await retrieveRulesForPrompt({
      userMessage: techText,  // 即使消息与 tech text 相同
      cwd: process.cwd(),
      projectDbPath: join(tmpDir, "nonexistent.db"),
      globalDbPath,
      sessionSeenIds: new Set(),
      isFirstPrompt: false,
      embedder: stubEmbedder as any,
    });
    expect(laterResult.tier1Rules).toHaveLength(0);
  });
});

// ─── Scenario 3: sessionSeenIds 去重 ─────────────────────────────────────────

describe("Scenario 3: sessionSeenIds 排除已注入规则", () => {
  it("已在 sessionSeenIds 中的规则不出现在返回结果中", async () => {
    const queryText = "duplicate dedup test";
    const db = openDb(globalDbPath);
    const ruleA = mkRule({
      id: "rule-a",
      trigger_description: queryText,
      pattern_description: queryText,
      confidence: 0.9,
      current_tier: "canonical",
    });
    const ruleB = mkRule({
      id: "rule-b",
      trigger_description: queryText,
      pattern_description: queryText,
      confidence: 0.85,
      current_tier: "canonical",
    });
    await seedRule(db, ruleA);
    await seedRule(db, ruleB);
    db.close();

    const result = await retrieveRulesForPrompt({
      userMessage: queryText,
      cwd: process.cwd(),
      projectDbPath: join(tmpDir, "nonexistent.db"),
      globalDbPath,
      sessionSeenIds: new Set(["rule-a"]),   // rule-a 已在本 session 注入过
      isFirstPrompt: false,
      embedder: stubEmbedder as any,
    });

    const returnedIds = result.allInjectedIds;
    expect(returnedIds).not.toContain("rule-a");
    // rule-b 具有足够高的 confidence + canonical tier，分数远超 MIN_SCORE，必须出现
    expect(returnedIds).toContain("rule-b");
  });
});

// ─── Scenario 4: rerankByConfidence 排序 ──────────────────────────────────────

describe("Scenario 4: rerankByConfidence 使高置信度规则排在前", () => {
  it("相同语义的两条规则，高置信度规则排在 tier2Rules[0]", async () => {
    const queryText = "confidence rerank ordering test";
    const db = openDb(globalDbPath);
    const ruleHigh = mkRule({
      id: "rule-high-conf",
      trigger_description: queryText,
      pattern_description: queryText,
      confidence: 0.9,
      current_tier: "canonical",
    });
    const ruleLow = mkRule({
      id: "rule-low-conf",
      trigger_description: queryText,
      pattern_description: queryText,
      confidence: 0.5,
      current_tier: "canonical",
    });
    await seedRule(db, ruleHigh);
    await seedRule(db, ruleLow);
    db.close();

    const result = await retrieveRulesForPrompt({
      userMessage: queryText,
      cwd: process.cwd(),
      projectDbPath: join(tmpDir, "nonexistent.db"),
      globalDbPath,
      sessionSeenIds: new Set(),
      isFirstPrompt: false,
      embedder: stubEmbedder as any,
    });

    expect(result.tier2Rules.length).toBeGreaterThanOrEqual(1);
    // 高置信度规则应该排在第一位
    expect(result.tier2Rules[0]!.id).toBe("rule-high-conf");
  });
});

// ─── Scenario 5: 空 DB → 安静返回空结果 ──────────────────────────────────────

describe("Scenario 5: 两个 DB 路径均不存在 → 返回空结果不崩溃", () => {
  it("当 projectDbPath 和 globalDbPath 均不存在时，返回全空结果", async () => {
    const result = await retrieveRulesForPrompt({
      userMessage: "any message",
      cwd: process.cwd(),
      projectDbPath: join(tmpDir, "no-project.db"),
      globalDbPath: join(tmpDir, "no-global.db"),
      sessionSeenIds: new Set(),
      isFirstPrompt: true,
      embedder: stubEmbedder as any,
    });

    expect(result.tier1Rules).toHaveLength(0);
    expect(result.tier2Rules).toHaveLength(0);
    expect(result.injectionText).toBe("");
    expect(result.allInjectedIds).toHaveLength(0);
  });
});

// ─── Scenario 6 (bug fix): project DB 里 personal-scope 规则能被检索 ──────────
// 根因：queryRules 写死 scope:"global"，而 project DB 里的规则是 personal scope
// 导致生产环境语义检索零命中。

describe("Scenario 6: personal-scope 规则（project DB 的实际形态）能被 Tier-2 检索", () => {
  it("scope:personal 规则通过 projectDbPath 被检索到，而非被 scope:global 过滤掉", async () => {
    const queryText = "personal scope retrieval bug fix";
    // 用 project DB 存放 personal scope 规则——复现生产环境实际数据形状
    const projectDb = openDb(projectDbPath);
    const rule = mkRule({
      id: "personal-scope-rule",
      scope: { level: "personal" },   // ← 生产环境实际 scope，之前被写死的 "global" 过滤掉
      trigger_description: queryText,
      pattern_description: queryText,
      confidence: 0.9,
      current_tier: "canonical",
    });
    await seedRule(projectDb, rule);
    projectDb.close();

    const result = await retrieveRulesForPrompt({
      userMessage: queryText,
      cwd: process.cwd(),
      projectDbPath,                              // 含 personal-scope 规则
      globalDbPath: join(tmpDir, "no-global.db"), // 无 global DB
      sessionSeenIds: new Set(),
      isFirstPrompt: false,
      embedder: stubEmbedder as any,
    });

    // 修复前：0 命中（global scope filter 把 personal rules 全过滤掉）
    // 修复后：personal-scope-rule 出现在 tier2Rules
    expect(result.tier2Rules.map((r) => r.id)).toContain("personal-scope-rule");
  });

  it("global-scope 规则通过 globalDbPath 被检索到（原有行为不退化）", async () => {
    const queryText = "global scope still works after fix";
    const globalDb = openDb(globalDbPath);
    const rule = mkRule({
      id: "global-scope-rule",
      scope: { level: "global" },
      trigger_description: queryText,
      pattern_description: queryText,
      confidence: 0.9,
      current_tier: "canonical",
    });
    await seedRule(globalDb, rule);
    globalDb.close();

    const result = await retrieveRulesForPrompt({
      userMessage: queryText,
      cwd: process.cwd(),
      projectDbPath: join(tmpDir, "no-project.db"),
      globalDbPath,
      sessionSeenIds: new Set(),
      isFirstPrompt: false,
      embedder: stubEmbedder as any,
    });

    expect(result.tier2Rules.map((r) => r.id)).toContain("global-scope-rule");
  });

  it("team-scope 规则通过 projectDbPath 被检索到", async () => {
    const queryText = "team scope prompt retrieval works";
    const projectDb = openDb(projectDbPath);
    const rule = mkRule({
      id: "team-scope-rule",
      scope: { level: "team" },
      trigger_description: queryText,
      pattern_description: queryText,
      confidence: 0.9,
      current_tier: "canonical",
    });
    await seedRule(projectDb, rule);
    projectDb.close();

    const result = await retrieveRulesForPrompt({
      userMessage: queryText,
      cwd: process.cwd(),
      projectDbPath,
      globalDbPath: join(tmpDir, "no-global.db"),
      sessionSeenIds: new Set(),
      isFirstPrompt: false,
      embedder: stubEmbedder as any,
    });

    expect(result.tier2Rules.map((r) => r.id)).toContain("team-scope-rule");
  });
});
