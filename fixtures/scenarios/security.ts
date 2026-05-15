import type { Scenario } from "../../packages/core/src/index.js";

/**
 * 场景 4: security
 *
 * AI 把 API key 硬编码到代码里，用户严正纠正"必须用 env var"。
 * 系统学到，下次 Write 含 hardcoded key 时拦截。
 */
export const securityScenario: Scenario = {
  id: "security",
  description: "AI 把 sk- 开头的 API key 硬编码到 .ts 文件，用户纠正用 env var；下次拦截",
  meta: { category: "code" },
  phaseA: {
    session: {
      sessionId: "scenario-security",
      startTime: "2026-04-15T00:00:00Z",
      endTime: "2026-04-15T00:10:00Z",
      turns: [
        {
          turnIndex: 0,
          userMessage: "加上 OpenAI 客户端调用",
          assistantText: "好，初始化 client 的时候加 API key",
          toolCalls: [
            {
              id: "t1",
              name: "Write",
              input: {
                file_path: "src/openai-client.ts",
                content:
                  "import OpenAI from 'openai';\nexport const client = new OpenAI({ apiKey: 'sk-proj-FAKE12345' });\n",
              },
              succeeded: true,
            },
          ],
          timestamp: "2026-04-15T00:01:00Z",
        },
        {
          turnIndex: 1,
          userMessage: "不对，secret 不能写代码里，用 process.env.OPENAI_API_KEY",
          assistantText: "对，我应该用 env var",
          toolCalls: [
            {
              id: "t2",
              name: "Edit",
              input: {
                file_path: "src/openai-client.ts",
                old_string: "apiKey: 'sk-proj-FAKE12345'",
                new_string: "apiKey: process.env.OPENAI_API_KEY",
              },
              succeeded: true,
            },
          ],
          timestamp: "2026-04-15T00:02:00Z",
        },
      ],
    },
    expectedCorrections: [
      { signal: "explicit_denial", minWeight: 0.9, turnIndex: 1 },
    ],
  },
  phaseB: {
    mockLLMResponse: JSON.stringify({
      category: "S",
      tags: ["security", "secret", "env-var"],
      type: "avoidance",
      nature: "objective",
      trigger: "在源代码里配置外部服务的认证密钥",
      wrong_pattern: "apiKey: 'sk-|apiKey: \"sk-",
      correct_pattern: "apiKey: process.env.<NAME>",
      reasoning: "硬编码 secret 会进 git history 永久泄漏；必须从环境变量读取",
    }),
    expectedRule: {
      categoryEquals: "S",
      typeEquals: "avoidance",
      natureEquals: "objective",
      wrongPatternContains: "sk-",
      correctPatternContains: "process.env",
    },
  },
  phaseC: {
    toolCall: {
      toolName: "Write",
      input: {
        file_path: "src/anthropic-client.ts",
        content:
          "import Anthropic from '@anthropic-ai/sdk';\nexport const c = new Anthropic({ apiKey: 'sk-ant-OTHER999' });\n",
      },
    },
    // objective + 0.95 → block
    expectedBehavior: "block",
  },
};
