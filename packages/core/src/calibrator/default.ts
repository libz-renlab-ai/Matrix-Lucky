import type {
  AppliedSignal,
  CalibrationResult,
  Calibrator,
} from "@teamagent/ports";
import type { KnowledgeEntry, PersistedEvent } from "@teamagent/types";

/**
 * 默认（rule-based）Calibrator。纯函数。
 *
 * 信号 → 权重表（参考 spec v5.2 "置信度校准"）：
 *
 *   hook-pre.blocked            +0.05  规则成功阻拦（intervention applied）
 *   hook-pre.warned             +0.02  规则给了温和提示
 *   post.success after pre-fire +0.03  规则触发后工具仍成功 → 规则没造成破坏
 *   post.fail after pre.blocked -0.10  规则拦住后用户走的另一条路也失败 → 规则可能错了
 *   5+ 连续成功无失败 bonus     +0.05  proven track record
 *
 * 重要：每类信号的"次数"会被 log2 归一化（见 normalize() 函数）。
 * 这样 100 次 fire 不会给 +5.00 的离谱涨幅，而是 ~+0.33。
 * 防止噪声规则靠刷数堆 confidence。
 *
 * 自反检测：当 fire 发生在文档/测试/fixture 上下文（file_path 是
 * .md/.txt/.rst 或路径含 docs/__tests__/fixtures）时，**反转权重**——
 * 这种 fire 大概率是文本提及 ≠ 真用法，应当扣分而非加分。
 *
 * 不实现：
 *   - "用户 override" 信号（要求 protocol 升级，Phase 2）
 *   - 时间衰减（Phase 2 知识衰减引擎再做）
 *
 * 自动归档：confidence 跌破 0.3 时 status: active → archived。
 * archived / conflict 状态不会被 calibrator 改回 active。
 */

const W_PRE_BLOCKED = 0.05;
const W_PRE_WARNED = 0.02;
const W_POST_SUCCESS_AFTER_FIRE = 0.03;
const W_POST_FAIL_AFTER_BLOCK = -0.1;
const W_STREAK_BONUS = 0.05;
const STREAK_THRESHOLD = 5;
const ARCHIVE_THRESHOLD = 0.3;

/** 把次数 log2(1+n) 归一化。1 次 → 1.0；5 次 → 2.58；100 次 → 6.66 */
function normalize(n: number): number {
  if (n <= 0) return 0;
  return Math.log2(1 + n);
}

/**
 * 自反检测：判断这个事件是否发生在"文本提及"上下文里
 * （文档 / 测试 fixture / system 自身数据），而不是真正的代码用法。
 */
function isDocOrTestContext(event: PersistedEvent): boolean {
  const fp = event.tool?.input?.file_path;
  if (typeof fp !== "string" || fp.length === 0) return false;
  // 文档类后缀
  if (/\.(md|mdx|txt|rst|adoc)$/i.test(fp)) return true;
  // 路径段命中文档/测试目录
  if (
    /(?:^|[/\\])(docs?|__tests__|tests?|spec|specs|fixtures?|examples?)(?:[/\\]|$)/i.test(
      fp,
    )
  ) {
    return true;
  }
  // teamagent 自身数据 / 配置文件
  if (fp.includes("/.teamagent/") || fp.includes("\\.teamagent\\")) return true;
  return false;
}

export const defaultCalibrator: Calibrator = {
  calibrate(
    entry: KnowledgeEntry,
    events: PersistedEvent[],
  ): CalibrationResult {
    // 只考虑与本 entry 相关的事件
    const ourEvents = events.filter((e) => e.knowledge_id === entry.id);

    const signals: AppliedSignal[] = [];

    // 把所有 pre 事件分桶：真实代码 vs 文档/测试上下文
    const blockedAll = ourEvents.filter((e) => e.kind === "hook-pre.blocked");
    const warnedAll = ourEvents.filter((e) => e.kind === "hook-pre.warned");
    const blockedReal = blockedAll.filter((e) => !isDocOrTestContext(e));
    const blockedDoc = blockedAll.filter((e) => isDocOrTestContext(e));
    const warnedReal = warnedAll.filter((e) => !isDocOrTestContext(e));
    const warnedDoc = warnedAll.filter((e) => isDocOrTestContext(e));

    // 1a. hook-pre.blocked 真实命中：log 归一化加分
    if (blockedReal.length > 0) {
      signals.push({
        kind: "hook-pre.blocked",
        weight: W_PRE_BLOCKED * normalize(blockedReal.length),
        event_ids: blockedReal.map((e) => e.id),
      });
    }
    // 1b. hook-pre.blocked 文档/测试上下文：反转，作为 false-positive 信号扣分
    if (blockedDoc.length > 0) {
      signals.push({
        kind: "hook-pre.blocked.doc_context",
        weight: -W_PRE_BLOCKED * normalize(blockedDoc.length),
        event_ids: blockedDoc.map((e) => e.id),
      });
    }

    // 2a. hook-pre.warned 真实命中
    if (warnedReal.length > 0) {
      signals.push({
        kind: "hook-pre.warned",
        weight: W_PRE_WARNED * normalize(warnedReal.length),
        event_ids: warnedReal.map((e) => e.id),
      });
    }
    // 2b. hook-pre.warned 文档/测试上下文
    if (warnedDoc.length > 0) {
      signals.push({
        kind: "hook-pre.warned.doc_context",
        weight: -W_PRE_WARNED * normalize(warnedDoc.length),
        event_ids: warnedDoc.map((e) => e.id),
      });
    }

    // 3. post.success / post.fail 关联到 pre 事件
    const postEvents = ourEvents.filter((e) => e.kind === "hook-post.result");
    const preFireByToolUseId = new Map<string, PersistedEvent>();
    for (const e of ourEvents) {
      if (
        (e.kind === "hook-pre.matched" ||
          e.kind === "hook-pre.warned" ||
          e.kind === "hook-pre.blocked") &&
        e.tool_use_id
      ) {
        // 取最后一条覆盖（同一 tool_use_id 应只有一组 pre）
        preFireByToolUseId.set(e.tool_use_id, e);
      }
    }

    const successAfterFire: PersistedEvent[] = [];
    const failAfterBlock: PersistedEvent[] = [];
    for (const post of postEvents) {
      if (!post.tool_use_id) continue;
      const pre = preFireByToolUseId.get(post.tool_use_id);
      if (!pre) continue;
      if (post.result?.succeeded === true) {
        successAfterFire.push(post);
      } else if (post.result?.succeeded === false && pre.kind === "hook-pre.blocked") {
        failAfterBlock.push(post);
      }
    }

    if (successAfterFire.length > 0) {
      signals.push({
        kind: "post.success_after_fire",
        weight: W_POST_SUCCESS_AFTER_FIRE * normalize(successAfterFire.length),
        event_ids: successAfterFire.map((e) => e.id),
      });
    }
    if (failAfterBlock.length > 0) {
      // failure 是更强的反对信号，直接 log 归一化但保留 -0.10 系数
      signals.push({
        kind: "post.fail_after_block",
        weight: W_POST_FAIL_AFTER_BLOCK * normalize(failAfterBlock.length),
        event_ids: failAfterBlock.map((e) => e.id),
      });
    }

    // 4. streak bonus：连续 STREAK_THRESHOLD+ 次 post.success_after_fire 且无 fail
    if (
      successAfterFire.length >= STREAK_THRESHOLD &&
      failAfterBlock.length === 0
    ) {
      signals.push({
        kind: "streak_bonus",
        weight: W_STREAK_BONUS,
      });
    }

    const totalDelta = signals.reduce((s, sig) => s + sig.weight, 0);
    const rawNewConf = entry.confidence + totalDelta;
    const newConfidence = Math.max(0, Math.min(1, rawNewConf));

    // 自动归档：active + 跌破阈值 → archived
    let newStatus: KnowledgeEntry["status"] = entry.status;
    if (entry.status === "active" && newConfidence < ARCHIVE_THRESHOLD) {
      newStatus = "archived";
    }
    // archived / conflict / stale 状态保持

    return {
      confidence: newConfidence,
      status: newStatus,
      delta: newConfidence - entry.confidence,
      applied_signals: signals,
    };
  },
};
