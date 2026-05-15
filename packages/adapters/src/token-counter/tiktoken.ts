import { getEncoding } from "js-tiktoken";

let cached: ReturnType<typeof getEncoding> | null = null;

/**
 * 懒加载 cl100k_base encoder，返回一个 countTokens(s) 函数。
 * 线程安全由 Node.js single-thread 保证。
 */
export function createTiktokenCounter(): (s: string) => number {
  return (s: string) => {
    if (!cached) cached = getEncoding("cl100k_base");
    return cached.encode(s).length;
  };
}
