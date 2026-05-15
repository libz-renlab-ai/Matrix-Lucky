import type { Scenario } from "../../packages/core/src/index.js";

/**
 * 场景 2: tech-choice
 *
 * AI 建议 Redux，用户更想要轻量的 Zustand。系统学到偏好。
 * 后续 AI 想 npm install @reduxjs/toolkit → 拦截。
 */
export const techChoiceScenario: Scenario = {
  id: "tech-choice",
  description: "AI 推荐 Redux，用户偏好 Zustand；系统学到，下次 npm install Redux 时拦截",
  meta: { category: "engineering" },
  phaseA: {
    session: {
      sessionId: "scenario-tech-choice",
      startTime: "2026-04-15T00:00:00Z",
      endTime: "2026-04-15T00:10:00Z",
      turns: [
        {
          turnIndex: 0,
          userMessage: "给这个 React app 加一个状态管理库",
          assistantText: "我推荐用 Redux Toolkit，比较成熟",
          toolCalls: [],
          timestamp: "2026-04-15T00:01:00Z",
        },
        {
          turnIndex: 1,
          userMessage: "不对，用 Zustand，我们要轻量",
          assistantText: "好，改用 Zustand",
          toolCalls: [
            { id: "t1", name: "Bash", input: { command: "pnpm add zustand" }, succeeded: true },
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
      category: "E",
      tags: ["state-management", "react", "tech-choice"],
      type: "avoidance",
      nature: "subjective",
      trigger: "前端项目需要选择状态管理库",
      wrong_pattern: "redux|@reduxjs/toolkit",
      correct_pattern: "Zustand",
      reasoning: "用户偏好轻量方案；Redux Toolkit 样板代码多，Zustand API 极简",
    }),
    expectedRule: {
      categoryEquals: "E",
      typeEquals: "avoidance",
      natureEquals: "subjective",
      wrongPatternContains: "redux",
      correctPatternContains: "Zustand",
    },
  },
  phaseC: {
    toolCall: {
      toolName: "Bash",
      input: { command: "npm install @reduxjs/toolkit" },
    },
    // subjective + 0.95 → warn (subjective caps at warn)
    expectedBehavior: "warn",
  },
};
