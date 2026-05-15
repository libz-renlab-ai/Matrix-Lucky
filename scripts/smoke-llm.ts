/**
 * LLM Smoke Test：验证 `claude -p` 的 JSON 输出 shape 仍然符合 adapter 预期。
 *
 * 用法：
 *   pnpm tsx scripts/smoke-llm.ts
 *
 * 退出码：
 *   0 = 通过
 *   1 = Shape 不符（Anthropic 改了协议）
 *   2 = 进程启动/超时等环境问题（非协议变更）
 *
 * 为什么存在：单元测试用 fake spawner，不验证真实 claude CLI。如果 Anthropic
 * 改了 --output-format=json 的字段名，单元测试不会挂，但用户端会静默坏掉。
 * 本脚本每次 release 前手跑一次；nightly workflow 在 CI 里也跑一次（见
 * .github/workflows/nightly-llm-smoke.yml）。
 */
import { spawn } from "node:child_process";

interface ShapeExpectation {
  path: string;
  check: (value: unknown) => boolean;
}

const EXPECTED_SHAPE: ShapeExpectation[] = [
  { path: "type", check: (v) => v === "result" },
  { path: "is_error", check: (v) => v === false },
  { path: "result", check: (v) => typeof v === "string" && v.length > 0 },
  {
    path: "usage",
    check: (v) => typeof v === "object" && v !== null,
  },
  {
    path: "usage.input_tokens",
    check: (v) => typeof v === "number" && v >= 0,
  },
  {
    path: "usage.output_tokens",
    check: (v) => typeof v === "number" && v >= 0,
  },
];

async function runClaude(prompt: string, timeoutMs = 60000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      ["-p", "--output-format", "json", "--no-session-persistence"],
      { stdio: ["pipe", "pipe", "pipe"], shell: false },
    );
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      reject(new Error(`TIMEOUT after ${timeoutMs}ms`));
    }, timeoutMs);
    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (err.code === "ENOENT") {
        reject(new Error("ENOENT: claude CLI not found in PATH"));
      } else {
        reject(err);
      }
    });
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Exit ${code}. stderr: ${stderr.slice(0, 500)}`));
      } else {
        resolve(stdout.trim());
      }
    });
    child.stdin?.write(prompt);
    child.stdin?.end();
  });
}

function getAtPath(obj: unknown, dotPath: string): unknown {
  let cur: unknown = obj;
  for (const key of dotPath.split(".")) {
    if (cur && typeof cur === "object" && key in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return cur;
}

async function main(): Promise<number> {
  console.log("🔬 TeamAgent LLM smoke test");
  console.log("  Backend: claude -p --output-format json");
  console.log("  Prompt:  'Say exactly OK'");
  console.log("");

  let raw: string;
  try {
    raw = await runClaude("Say exactly OK");
  } catch (err) {
    console.error(`❌ 环境问题（非协议错误）: ${String(err)}`);
    return 2;
  }

  console.log(`Raw response (${raw.length} chars):`);
  console.log(raw.slice(0, 200) + (raw.length > 200 ? "…" : ""));
  console.log("");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`❌ JSON parse failed: ${String(err)}`);
    return 1;
  }

  const failures: string[] = [];
  for (const { path, check } of EXPECTED_SHAPE) {
    const value = getAtPath(parsed, path);
    if (!check(value)) {
      failures.push(`  ✗ ${path} = ${JSON.stringify(value)}`);
    } else {
      console.log(`  ✓ ${path}`);
    }
  }

  if (failures.length > 0) {
    console.error("");
    console.error("❌ Shape mismatch — Anthropic 可能改了 JSON 输出格式");
    console.error(failures.join("\n"));
    return 1;
  }

  // 额外健全性：.result 应真的含有 "OK"
  const result = getAtPath(parsed, "result");
  if (typeof result === "string" && !/OK/i.test(result)) {
    console.warn(`⚠️  .result 不含 'OK'（可能是模型响应漂移，非协议问题）: ${result}`);
  }

  console.log("");
  console.log("✅ All shape checks passed");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`💥 Uncaught: ${String(err)}`);
    process.exit(2);
  });
