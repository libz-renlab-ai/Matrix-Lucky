import type {
  SecretScanResult,
  ScopeClassification,
} from "@teamagent/ports";

/**
 * 自动分享管线决策。纯函数。
 *
 * 输入：闸门 1 + 闸门 2 的输出 + 用户显式作用域请求（如有）
 * 输出：决定把规则放在哪一层，以及为什么
 */

export type ShareAction =
  | { kind: "seal_in_l1"; reason: string }
  | { kind: "keep_in_l1"; reason: string }
  | { kind: "promote_to_l2"; reason: string };

export interface DecideShareInput {
  /** 闸门 1 输出 */
  scan: SecretScanResult;
  /** 闸门 2 输出 */
  classification: ScopeClassification;
  /** 用户显式标记（如有）：personal | team；undefined 表示没标 */
  userOverride?: "personal" | "team";
}

/**
 * 决定一条新规则的归宿。
 *
 * 优先级：
 * 1. 闸门 1 命中 → 永封 L1（最强；override 不可绕）
 * 2. userOverride === "personal" → 留 L1（用户主动）
 * 3. userOverride === "team" → 推 L2（用户主动；闸门 1 已过）
 * 4. classification.scope === "shareable" → 自动 promote
 * 5. 其他（personal / uncertain）→ 留 L1
 */
export function decideShareAction(input: DecideShareInput): ShareAction {
  if (input.scan.hit) {
    const kinds = Array.from(
      new Set(input.scan.matches.map((m) => m.kind))
    ).join(", ");
    return {
      kind: "seal_in_l1",
      reason: `闸门 1 命中（${kinds}），永封 L1，不可推 L2`,
    };
  }

  if (input.userOverride === "personal") {
    return {
      kind: "keep_in_l1",
      reason: "用户显式标记 personal",
    };
  }

  if (input.userOverride === "team") {
    return {
      kind: "promote_to_l2",
      reason: "用户显式标记 team（闸门 1 已通过）",
    };
  }

  if (input.classification.scope === "shareable") {
    return {
      kind: "promote_to_l2",
      reason: `自动分类: ${input.classification.reason}`,
    };
  }

  return {
    kind: "keep_in_l1",
    reason: `自动分类 ${input.classification.scope}: ${input.classification.reason}`,
  };
}
