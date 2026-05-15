import type { Scenario } from "../../packages/core/src/index.js";

/**
 * 场景 1: python-version
 *
 * Phase A：用户用 python 命令时被拦（系统应该用 python3）
 * Phase B：LLM 提取一条 "用 python3 而非 python" 的规则
 * Phase C：模拟一个新的 Bash 含 "python script.py" → matcher 应触发 warn
 */
export const pythonVersionScenario: Scenario = {
  id: "python-version",
  description: "AI 写 'python script.py' 被纠正用 python3，系统学到，下次拦截",
  meta: {
    category: "code",
  },
  phaseA: {
    session: {
      sessionId: "scenario-python-version",
      startTime: "2026-04-15T00:00:00Z",
      endTime: "2026-04-15T00:10:00Z",
      turns: [
        {
          turnIndex: 0,
          userMessage: "跑一下 python script.py",
          assistantText: "好，我用 python script.py 来跑",
          toolCalls: [
            {
              id: "tool-1",
              name: "Bash",
              input: { command: "python script.py" },
              succeeded: false,
              result: "command not found: python",
            },
          ],
          timestamp: "2026-04-15T00:01:00Z",
        },
        {
          turnIndex: 1,
          userMessage: "不对，本机的 python 是 python3，要用 python3 命令",
          assistantText: "好，改用 python3",
          toolCalls: [
            {
              id: "tool-2",
              name: "Bash",
              input: { command: "python3 script.py" },
              succeeded: true,
            },
          ],
          timestamp: "2026-04-15T00:02:00Z",
        },
      ],
    },
    expectedCorrections: [{ signal: "explicit_denial", minWeight: 0.9, turnIndex: 1 }],
  },
  phaseB: {
    mockLLMResponse: JSON.stringify({
      category: "C",
      tags: ["python", "command"],
      type: "avoidance",
      nature: "objective",
      trigger: "在本机执行 Python 脚本",
      wrong_pattern: "python ",
      correct_pattern: "python3",
      reasoning: "本机的 python 别名指向 python3；直接用 python 会找不到命令",
    }),
    expectedRule: {
      categoryEquals: "C",
      typeEquals: "avoidance",
      natureEquals: "objective",
      wrongPatternContains: "python",
      correctPatternContains: "python3",
    },
  },
  phaseC: {
    toolCall: {
      toolName: "Bash",
      input: { command: "python script.py" },
    },
    expectedBehavior: "block", // confidence=0.95 (signal weight) + objective → block
  },
};
