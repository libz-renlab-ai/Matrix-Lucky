<!-- TEAMAGENT:START - 自动管理，请勿手动编辑 -->
## TeamAgent 经验（17条活跃知识）
- 使用 process.chdir then path.resolve, or C:/bzli/... format 而非 DatabaseSync('/c/bzli/...')——node:sqlite uses Win32 API, does not recognize Git Bash /c/ mountpoint [0.70]
- 使用 use pnpm teamagent <cmd>, or build first then node dist/bin-stop.cjs 而非 node --input-type=module importing packages that re-export .ts source files——adapters/dist/index.js re-exports from .ts source, fails without tsx. Only the bundled bin-stop.cjs / bin.js are runnable standalone [0.70]
<!-- TEAMAGENT:END -->
