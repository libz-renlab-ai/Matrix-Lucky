/**
 * RuleEmbedder — M4-B 语义匹配引擎用。
 */
export interface RuleEmbedder {
  /** 返回归一化后的向量；每次一定是同一模型同一维度。 */
  embed(texts: string[]): Promise<number[][]>;
  /** 维度——调用方可查询以匹配 schema。 */
  readonly dim: number;
  /** 模型指纹——更换模型时用来判断是否要全量重 embed。 */
  readonly modelId: string;
}
