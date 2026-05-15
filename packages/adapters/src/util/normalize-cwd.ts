/**
 * Windows + Git Bash 路径规范化：把 `/c/path/...` 转成 `C:/path/...`。
 * Claude Code 在 Windows 下传给 hook 的 cwd 是 Git Bash 风格（`/c/...`），
 * 但 Node on Windows 的 path/fs API 会把它当成根目录下的 `c` 文件夹。
 */
export function normalizeCwd(p: string): string {
  const m = p.match(/^\/([a-zA-Z])\/(.*)$/);
  if (m) return `${m[1]!.toUpperCase()}:/${m[2]}`;
  return p;
}
