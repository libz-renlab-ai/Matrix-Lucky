/** 供 detectIgnoredSignals / detectCompliedSignals 使用的最小事件结构。
 *  不依赖 PersistedEvent，让 core 保持无类型耦合。
 */
export interface OverrideSignalEvent {
  kind: string;
  tool_use_id?: string;
  knowledge_id?: string;
  timestamp: string;
  /** 存在于 hook-pre.warned 事件的 payload 里（M2.5 新增）。 */
  tool_name?: string;
}

/**
 * PostToolUse 用：当同一 tool_use_id 有 hook-pre.warned 事件时，
 * 说明 AI 被警告后仍执行了原始工具调用 → "ignored"。
 */
export function detectIgnoredSignals(
  currentToolUseId: string,
  recentEvents: OverrideSignalEvent[],
): Array<{ knowledge_id: string }> {
  return recentEvents
    .filter(
      (e) =>
        e.kind === "hook-pre.warned" &&
        e.tool_use_id === currentToolUseId &&
        Boolean(e.knowledge_id),
    )
    .map((e) => ({ knowledge_id: e.knowledge_id! }));
}

/**
 * PostToolUse 用（tool 成功执行完后调用）：在近期 blocked 事件里找同 tool_name 的，
 * 推断 AI 被 block 后绕路完成了等价操作 → "blocked_circumvented"。
 *
 * 与 detectIgnoredSignals 区别：
 * - ignored 靠 tool_use_id 精确匹配（warn 允许 tool 跑，可直接配对）
 * - circumvented 靠 tool_name + 时间窗口近似匹配（block 后 tool 没跑，不同 tool_use_id，
 *   只能用"同类工具在时间窗口内又跑了一次"作为绕路启发）
 *
 * 去重：已被先前 ai.override.blocked_circumvented 事件消费过的 knowledge_id 跳过，
 * 同一个 blocked 规则只扣一次分。
 *
 * @param currentToolName  当前刚成功执行完的工具名
 * @param recentEvents     事件日志最近 N 条
 * @param now              当前时间（纯函数）
 * @param windowMs         时间窗口，默认 5 分钟（与 complied 对称）
 */
export function detectBlockedCircumventedSignals(
  currentToolName: string,
  recentEvents: OverrideSignalEvent[],
  now: Date,
  windowMs = 300_000,
): Array<{ knowledge_id: string }> {
  const cutoff = now.getTime() - windowMs;

  const alreadyEmitted = new Set<string>();
  for (const e of recentEvents) {
    if (e.kind === "ai.override.blocked_circumvented" && e.knowledge_id) {
      alreadyEmitted.add(e.knowledge_id);
    }
  }

  const seen = new Set<string>();
  const result: Array<{ knowledge_id: string }> = [];

  for (const e of recentEvents) {
    if (
      e.kind === "hook-pre.blocked" &&
      e.knowledge_id &&
      e.tool_name === currentToolName &&
      new Date(e.timestamp).getTime() > cutoff &&
      !alreadyEmitted.has(e.knowledge_id) &&
      !seen.has(e.knowledge_id)
    ) {
      seen.add(e.knowledge_id);
      result.push({ knowledge_id: e.knowledge_id });
    }
  }

  return result;
}

/**
 * PreToolUse 用（clean pass 时调用）：在近期 warned 事件里找同 tool_name 的，
 * 推断 AI 在下次调用同类工具时改掉了之前触发警告的内容 → "complied"。
 *
 * @param currentToolName  当前 clean pass 的工具名
 * @param recentEvents     事件日志最近 N 条（调用方传入，通常 50）
 * @param now              当前时间（纯函数，不内部 new Date()）
 * @param windowMs         时间窗口，默认 5 分钟
 */
export function detectCompliedSignals(
  currentToolName: string,
  recentEvents: OverrideSignalEvent[],
  now: Date,
  windowMs = 300_000,
): Array<{ knowledge_id: string }> {
  const cutoff = now.getTime() - windowMs;
  const seen = new Set<string>();
  const result: Array<{ knowledge_id: string }> = [];

  for (const e of recentEvents) {
    if (
      e.kind === "hook-pre.warned" &&
      e.knowledge_id &&
      e.tool_name === currentToolName &&
      new Date(e.timestamp).getTime() > cutoff &&
      !seen.has(e.knowledge_id)
    ) {
      seen.add(e.knowledge_id);
      result.push({ knowledge_id: e.knowledge_id });
    }
  }

  return result;
}
