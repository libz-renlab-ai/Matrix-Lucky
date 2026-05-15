export {};

const { pipeline, env } = await (Function("s", "return import(s)")(
  "@xenova/transformers",
) as Promise<any>);

// Use HuggingFace mirror for regions where huggingface.co is blocked
env.remoteHost = "https://hf-mirror.com/";

const MODELS = [
  "Xenova/all-MiniLM-L6-v2",         // 现有 wiki embedder 用的，英文 only
  "Xenova/multilingual-e5-small",    // 多语言 baseline
  "Xenova/bge-m3",                    // 可选高端
];

const SAMPLES = [
  "Bash command: rm -rf node_modules",
  "在 packages/core/ 目录下的代码里需要复用 adapter 层的逻辑",
  "需要发起 HTTP 请求",
  "Write tool, file_path=/tmp/test.md, content='# Hello\\n\\nWorld'",
  "Edit tool 在 packages/adapters/src/storage/sqlite/schema.ts 改 INIT_SQL",
];

async function bench(modelId: string): Promise<{ p50: number; p99: number }> {
  const extractor = await pipeline("feature-extraction", modelId);
  // warm up
  for (let i = 0; i < 3; i++) await extractor(SAMPLES[0], { pooling: "mean", normalize: true });
  const latencies: number[] = [];
  for (let i = 0; i < 20; i++) {
    for (const s of SAMPLES) {
      const t0 = performance.now();
      await extractor(s, { pooling: "mean", normalize: true });
      latencies.push(performance.now() - t0);
    }
  }
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] ?? 0;
  return { p50, p99 };
}

for (const m of MODELS) {
  try {
    const { p50, p99 } = await bench(m);
    console.log(`${m}: p50=${p50.toFixed(1)}ms p99=${p99.toFixed(1)}ms`);
  } catch (e) {
    console.log(`${m}: FAILED — ${(e as Error).message}`);
  }
}
