/**
 * ScopeClassifierPort：闸门 2。判断规则是否适合团队共享。
 * 仅 "shareable" 走自动 promote，其他停 L1。
 *
 * 实现约束：
 * - 必须保守：不确定就 personal（默认私密）
 * - 不抛错；分类信息走返回值
 * - reason 字段必须可解释（用于事件流给用户看为什么）
 */
export interface ScopeClassifierPort {
  classify(text: string): Promise<ScopeClassification>;
}

export interface ScopeClassification {
  scope: "personal" | "shareable" | "uncertain";
  /** 给用户看的解释（中文） */
  reason: string;
}
