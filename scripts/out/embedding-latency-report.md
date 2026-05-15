# Embedding Latency Baseline Report
Date: 2026-04-24

## Results

| Model | p50 (ms) | p99 (ms) |
|-------|---------|---------|
| Xenova/all-MiniLM-L6-v2 | 5.9 | 8.2 |
| Xenova/multilingual-e5-small | 8.2 | 12.4 |
| Xenova/bge-m3 | 55.0 | 119.3 |

## Notes

- Models downloaded via `hf-mirror.com` (huggingface.co is not reachable from this environment)
- Bench script: 3 warm-up runs + 20 × 5 samples = 100 latency measurements per model
- Platform: Windows 11 x64, Node.js v22.14.0, CPU-only inference (ONNX Runtime)

## Decision

根据下列规则：
- multilingual-e5-small p99 <60ms → 选它
- multilingual-e5-small p99 60-120ms → 仍选它，接受
- multilingual-e5-small p99 >120ms → 降级到 all-MiniLM-L6

**选定模型**: `Xenova/multilingual-e5-small`

**理由**: p99=12.4ms 远低于 60ms 阈值，多语言支持覆盖中英文混合场景（项目中规则文本常为中文），性能充裕。bge-m3 虽然质量最高（p50=55ms），但 p99=119.3ms 接近上限且模型体积大，成本收益比不如 multilingual-e5-small。all-MiniLM-L6-v2 英文 only，不适合本项目的中英文混合规则文本。
