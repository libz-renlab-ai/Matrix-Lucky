/**
 * 纯函数：从 CLAUDE.md 的原文中抽取"可以作为规则的 bullet 文本"。
 *
 * 规则：
 * - 跳过 <!-- TEAMAGENT:START --> ... <!-- TEAMAGENT:END --> 区块内所有内容
 *   （那是系统自己维护的，导入它相当于循环）
 * - 识别 bullet：以 `- ` / `* ` / `+ ` 开头的行，以及 `1. ` `2.` 等编号列表
 * - 支持连续行：bullet 下方紧跟的缩进行会被拼进同一条 bullet
 * - 空 bullet、纯标题行、代码块内的内容都跳过
 *
 * 返回每条 bullet 的纯文本（去掉 bullet 标记和首尾空白）。
 * 不调 LLM、不做结构化——那是 rule-structurer 的责任。
 */
export function extractRuleBullets(md: string): string[] {
  const lines = md.split("\n");
  const out: string[] = [];
  let inTeamagentBlock = false;
  let inCodeFence = false;
  let currentBullet: string[] | null = null;
  let currentIndent = 0;

  const flush = (): void => {
    if (currentBullet && currentBullet.length > 0) {
      const joined = currentBullet.join(" ").trim();
      if (joined) out.push(joined);
    }
    currentBullet = null;
  };

  for (const rawLine of lines) {
    // 代码栅栏开合——栅栏内内容忽略（规则文本很少写进代码块）
    if (/^\s*```/.test(rawLine)) {
      inCodeFence = !inCodeFence;
      flush();
      continue;
    }
    if (inCodeFence) continue;

    // TEAMAGENT 区块识别
    if (/<!--\s*TEAMAGENT:START/.test(rawLine)) {
      inTeamagentBlock = true;
      flush();
      continue;
    }
    if (/<!--\s*TEAMAGENT:END/.test(rawLine)) {
      inTeamagentBlock = false;
      continue;
    }
    if (inTeamagentBlock) continue;

    // Bullet 识别
    const bulletMatch = rawLine.match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/);
    if (bulletMatch) {
      const indent = bulletMatch[1]!.length;
      const text = bulletMatch[3]!;
      // 嵌套子 bullet：缩进大于父 bullet → 并入父，不开新条
      if (currentBullet !== null && indent > currentIndent) {
        currentBullet.push(text);
        continue;
      }
      flush();
      currentBullet = [text];
      currentIndent = indent;
      continue;
    }

    // 续行：属于当前 bullet 吗？
    // 条件：有缩进且当前有打开的 bullet，且当前行不为空
    if (currentBullet !== null) {
      const trimmed = rawLine.trim();
      if (!trimmed) {
        flush();
        continue;
      }
      // 续行必须缩进比 bullet 自身多
      const leadingSpace = rawLine.match(/^(\s*)/)![1]!.length;
      if (leadingSpace > currentIndent) {
        currentBullet.push(trimmed);
        continue;
      }
      // 非续行 → flush 当前 bullet
      flush();
    }
  }

  flush();
  return out;
}
