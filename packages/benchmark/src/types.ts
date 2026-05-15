export type Verdict = "correct" | "wrong" | "neither" | "error";

export interface PatternEvaluator {
  type: "pattern";
  wrong_patterns: string[];
  correct_patterns: string[];
}

export interface Task {
  id: string;
  name: string;
  category: string;
  prompt: string;
  evaluator: PatternEvaluator;
}

export interface CompiledTask extends Task {
  compiledWrongRegex: RegExp[];
  compiledCorrectRegex: RegExp[];
}

export interface GroupConfig {
  name: string;
  fixtureDir: string;
}

export interface TaskResult {
  group: string;
  taskId: string;
  run: number;
  verdict: Verdict;
  reason?: string;
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  durationMs: number;
  output: string;
  errorMsg?: string;
}

export interface GroupSummary {
  group: string;
  wrongCount: number;
  correctCount: number;
  neitherCount: number;
  errorCount: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  avgDurationMs: number;
}

export interface BenchmarkConfig {
  groups: string[];
  tasks: string;
  runs: number;
  outputJson: string;
  outputMarkdown: string;
}

export interface Report {
  generatedAt: string;
  config: BenchmarkConfig;
  groups: GroupSummary[];
  comparison: {
    prr: number;
    tokenDeltaPercent: number;
    durationDeltaPercent: number;
  };
  rawResults: TaskResult[];
}
