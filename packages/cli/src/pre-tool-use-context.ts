/**
 * 将工具调用 (toolName + toolInput) 转换为自然语言摘要，用于 PreToolUse 语义检索。
 * 纯函数，无 IO，无副作用。
 */
export function buildToolActionSummary(toolName: string, toolInput: unknown): string {
  const inp = (
    typeof toolInput === "object" && toolInput !== null ? toolInput : {}
  ) as Record<string, unknown>;

  if (toolName === "Bash") {
    const cmd = String(inp["command"] ?? "").trim();
    if (!cmd) return "执行终端命令";
    return `执行终端命令: ${cmd.slice(0, 200)}`;
  }

  if (toolName === "Edit") {
    const fp = String(inp["file_path"] ?? "");
    const content = String(inp["new_string"] ?? "").slice(0, 120);
    return `编辑文件 ${fp}: ${content}`;
  }

  if (toolName === "Write") {
    const fp = String(inp["file_path"] ?? "");
    const content = String(inp["content"] ?? "").slice(0, 120);
    return `写入文件 ${fp}: ${content}`;
  }

  if (toolName === "Read") {
    const fp = String(inp["file_path"] ?? "");
    return `读取文件 ${fp}`;
  }

  if (toolName === "Grep") {
    const pattern = String(inp["pattern"] ?? "");
    const path = String(inp["path"] ?? "");
    return `在 ${path || "项目"} 中搜索 ${pattern}`;
  }

  if (toolName === "Glob") {
    const pattern = String(inp["pattern"] ?? "");
    return `查找文件 ${pattern}`;
  }

  // 通用兜底 — JSON.stringify(undefined) 返回 JS undefined（非字符串），需先转 null 再序列化
  return `${toolName ?? "unknown"}: ${JSON.stringify(toolInput ?? null).slice(0, 200)}`;
}
