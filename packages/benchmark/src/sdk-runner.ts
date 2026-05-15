import { query } from "@anthropic-ai/claude-agent-sdk";

export interface SdkRunResult {
  output: string;
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface SdkRunner {
  run(prompt: string, workdir: string): Promise<SdkRunResult>;
}

const USE_COLOR = process.env.BENCH_NO_COLOR !== "1" && process.stdout.isTTY !== false;
const c = {
  red: (s: string) => USE_COLOR ? `\x1b[31m${s}\x1b[0m` : s,
  green: (s: string) => USE_COLOR ? `\x1b[32m${s}\x1b[0m` : s,
  yellow: (s: string) => USE_COLOR ? `\x1b[33m${s}\x1b[0m` : s,
  cyan: (s: string) => USE_COLOR ? `\x1b[36m${s}\x1b[0m` : s,
  gray: (s: string) => USE_COLOR ? `\x1b[90m${s}\x1b[0m` : s,
  bold: (s: string) => USE_COLOR ? `\x1b[1m${s}\x1b[0m` : s,
};

export class ClaudeSdkRunner implements SdkRunner {
  constructor(
    private timeoutMs: number = 180_000,
    private model: string = "claude-haiku-4-5-20251001",
    private maxTurns: number = 20,
    private verbose: boolean = process.env.BENCH_QUIET !== "1",
  ) {}

  async run(prompt: string, workdir: string): Promise<SdkRunResult> {
    const abortController = new AbortController();
    const session = query({
      prompt,
      options: {
        cwd: workdir,
        settingSources: ["local"],
        permissionMode: "acceptEdits",
        maxTurns: this.maxTurns,
        abortController,
        model: this.model,
      },
    });

    let output = "";
    let tokensIn = 0;
    let tokensOut = 0;
    let cacheReadTokens = 0;
    let cacheCreationTokens = 0;
    let timeoutHandle: NodeJS.Timeout | undefined;

    const work = (async () => {
      try {
        for await (const msg of session) {
          if (this.verbose && msg.type === "assistant") {
            for (const block of msg.message.content) {
              if (block.type === "tool_use") {
                const input = block.input as Record<string, unknown>;
                let preview = "";
                if (block.name === "Bash") preview = String(input.command ?? "").slice(0, 80);
                else if (block.name === "Write" || block.name === "Edit") {
                  const p = String(input.file_path ?? "");
                  preview = p.split(/[\\/]/).pop() ?? p;
                }
                else if (block.name === "Read") {
                  const p = String(input.file_path ?? "");
                  preview = p.split(/[\\/]/).pop() ?? p;
                }
                else preview = JSON.stringify(input).slice(0, 60);
                process.stdout.write(`  ${c.cyan("▶ " + block.name.padEnd(5))} ${c.gray(preview)}\n`);
              }
            }
          }
          if (this.verbose && msg.type === "user") {
            const content = (msg as any).message?.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type !== "tool_result") continue;
                const text = typeof block.content === "string"
                  ? block.content
                  : Array.isArray(block.content)
                    ? block.content.map((c: any) => c.text ?? "").join("")
                    : "";
                if (block.is_error && /TeamAgent 阻止|deny|blocked|permissionDecision/i.test(text)) {
                  const confMatch = text.match(/置信度\s*([\d.]+)/);
                  const hitMatch = text.match(/已触发\s*(\d+)\s*次/);
                  const ageMatch = text.match(/·\s*([^·\]]+?)学到/);
                  const wrongMatch = text.match(/✗\s*避免:\s*(.+)/);
                  const correctMatch = text.match(/✓\s*使用:\s*(.+)/);
                  const reasonMatch = text.match(/·\s*理由:\s*(.+)/);
                  const conf = confMatch ? confMatch[1] : "?";
                  const hit = hitMatch ? hitMatch[1] : "?";
                  const age = ageMatch ? ageMatch[1].trim() : "?";
                  process.stdout.write(`     ${c.red(c.bold("✖ DENY"))} ${c.yellow(`[置信度 ${conf} · 已触发 ${hit} 次 · ${age}学到]`)}\n`);
                  if (wrongMatch) process.stdout.write(`         ${c.red("✗ 避免:")} ${wrongMatch[1].trim()}\n`);
                  if (correctMatch) process.stdout.write(`         ${c.green("✓ 使用:")} ${c.bold(correctMatch[1].trim())}\n`);
                  if (reasonMatch) process.stdout.write(`         ${c.gray("· 理由: " + reasonMatch[1].trim().slice(0, 120))}\n`);
                } else if (!block.is_error) {
                  const len = text.length;
                  const summary = len > 0 ? `${len}B` : "ok";
                  process.stdout.write(`     ${c.green("✓ ALLOW")} ${c.gray(`→ executed (${summary})`)}\n`);
                } else {
                  const firstLine = text.split(/\r?\n/)[0]?.slice(0, 100) ?? "error";
                  process.stdout.write(`     ${c.yellow("⚠ ERROR")} ${c.gray(firstLine)}\n`);
                }
              }
            }
          }
          if (msg.type === "assistant") {
            for (const block of msg.message.content) {
              if (block.type === "text") output += block.text;
            }
          }
          if (msg.type === "result") {
            const u = msg.usage as {
              input_tokens?: number;
              output_tokens?: number;
              cache_read_input_tokens?: number;
              cache_creation_input_tokens?: number;
            };
            tokensIn = u.input_tokens ?? 0;
            tokensOut = u.output_tokens ?? 0;
            cacheReadTokens = u.cache_read_input_tokens ?? 0;
            cacheCreationTokens = u.cache_creation_input_tokens ?? 0;
            if (this.verbose) {
              const denials = (msg as any).permission_denials as Array<{ tool_name: string; tool_input: Record<string, unknown> }> | undefined;
              if (denials && denials.length > 0) {
                process.stdout.write(`  ${c.yellow(`⚑ ${denials.length} rule${denials.length > 1 ? "s" : ""} triggered`)}\n`);
              } else {
                process.stdout.write(`  ${c.gray("⚑ 0 rules triggered (no pitfall hit)")}\n`);
              }
            }
          }
        }
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
    })();

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        abortController.abort();
        session.close();
        reject(new Error("SDK timeout"));
      }, this.timeoutMs);
    });

    try {
      await Promise.race([work, timeoutPromise]);
    } catch (e) {
      work.catch(() => {}); // swallow post-abort rejection so it never surfaces unhandled
      throw e;
    }
    return { output, tokensIn, tokensOut, cacheReadTokens, cacheCreationTokens };
  }
}

export class FakeSdkRunner implements SdkRunner {
  constructor(private responses: Map<string, SdkRunResult> = new Map()) {}

  setResponse(promptKey: string, result: Partial<SdkRunResult> & Pick<SdkRunResult, "output">): void {
    this.responses.set(promptKey, {
      tokensIn: 0,
      tokensOut: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      ...result,
    });
  }

  async run(prompt: string, _workdir: string): Promise<SdkRunResult> {
    for (const [key, result] of this.responses) {
      if (prompt.includes(key)) return result;
    }
    return { output: "", tokensIn: 0, tokensOut: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
  }
}
