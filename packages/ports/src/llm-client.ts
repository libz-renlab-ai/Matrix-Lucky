/**
 * LLM 调用接口。Phase 1 默认实现是 ClaudeCodeLLMClient（spawn `claude -p`），
 * Phase 2 可选 AnthropicLLMClient。
 *
 * 接口故意极简：仅 prompt → completion。不暴露模型选择、参数调整——
 * 那些是 adapter 的内部关切。
 */
export interface LLMClient {
  /**
   * 发 prompt，返回文本响应。
   * @throws LLMClientError 当进程失败/超时/不可执行时
   */
  complete(prompt: string): Promise<string>;
}

/** LLM 调用错误分类。 */
export type LLMClientErrorKind =
  | "not-installed"
  | "timeout"
  | "non-zero-exit"
  | "unparseable-output"
  | "unknown";

export class LLMClientError extends Error {
  constructor(
    public kind: LLMClientErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "LLMClientError";
  }
}
