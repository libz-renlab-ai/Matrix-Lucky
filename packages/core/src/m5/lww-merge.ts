import type { TeamRuleFile, TeamRuleState } from "./team-rule.js";

/**
 * LWW（last-writer-wins）+ tombstone 合并。纯函数。
 *
 * 输入：同一 rule_id 跨多个 author 目录的所有 claim
 * 输出：单一 winning state（可能是 alive，也可能是 tombstone）
 *
 * 决胜规则（spec §5.2/5.3）：
 * 1. 比较所有 claim 的"effective ts"（alive 用 modified_ts，tomb 用 deleted_ts）
 * 2. ts 最大者赢
 * 3. ts 相同 → 按 claim author 字典序（确定性，不依赖人协调）
 *
 * 注意：tombstone 不"自动赢"——也是按 ts 比较。Alice 删了，Bob 之后又改回来
 * （ts 更晚），那 Bob 的版本赢。这给了"撤销删除"的能力，符合"任意人都可改任意规则"。
 */

export interface ClaimWithSource {
  /** 哪个 author 目录下的 claim（= 该 claim 的写入者） */
  claim_author: string;
  file: TeamRuleFile;
}

export interface MergeResult {
  /** 同一 rule_id 的赢家 state；undefined 表示输入为空 */
  winner: TeamRuleState | undefined;
  /** 赢家 claim 来自哪个 author 目录 */
  winner_claim_author: string | undefined;
  /** 赢家的原作者（lineage） */
  original_author: string | undefined;
}

export function mergeLww(claims: readonly ClaimWithSource[]): MergeResult {
  if (claims.length === 0) {
    return {
      winner: undefined,
      winner_claim_author: undefined,
      original_author: undefined,
    };
  }

  let best: ClaimWithSource = claims[0]!;
  let bestTs = effectiveTs(best.file.current);

  for (let i = 1; i < claims.length; i++) {
    const c = claims[i]!;
    const ts = effectiveTs(c.file.current);
    if (ts > bestTs) {
      best = c;
      bestTs = ts;
    } else if (ts === bestTs) {
      // tie-break: claim_author 字典序（确定性）
      if (c.claim_author < best.claim_author) {
        best = c;
      }
    }
  }

  return {
    winner: best.file.current,
    winner_claim_author: best.claim_author,
    original_author: best.file.author,
  };
}

function effectiveTs(s: TeamRuleState): string {
  return s.deleted ? s.deleted_ts : s.modified_ts;
}

/**
 * 把多个 rule_id 的 claims 一次性合并。返回 rule_id → MergeResult 映射。
 * 用于 sync inbound 时的批量应用。
 */
export function mergeLwwBatch(
  allClaims: readonly ClaimWithSource[]
): Map<string, MergeResult> {
  const byId = new Map<string, ClaimWithSource[]>();
  for (const c of allClaims) {
    const arr = byId.get(c.file.rule_id) ?? [];
    arr.push(c);
    byId.set(c.file.rule_id, arr);
  }
  const out = new Map<string, MergeResult>();
  for (const [id, arr] of byId) {
    out.set(id, mergeLww(arr));
  }
  return out;
}
