---
name: reverification
description: |
  By-hand only — DO NOT auto-trigger. When the user types /reverification (or asks
  for "reverify this", "independent verification", "LLM-uncheatable check",
  "第三方再验证", "用 repo 之外的方法验证"), re-verify recently-completed work
  using verification methods that **existed before this repo existed** and that an
  LLM agent cannot fabricate. Pick 3-5 verifications from a 10-family menu
  (hardware / cryptographic / blockchain / external real-system / mathematical /
  temporal / content authenticity / physical / network / third-party trust),
  dispatch them via real tools that capture raw evidence, and report PASS / FAIL /
  INCONCLUSIVE based ONLY on captured evidence — never on internal reasoning.
  Refuse to fall back on TeamBrain's bespoke verifiers (judge harness, fastprobe,
  /review, feature-verification gates) because those did NOT exist before the repo.
allowed-tools:
  - Bash
  - Read
  - WebFetch
  - WebSearch
  - Grep
  - Glob
  - Agent
triggers:
  - /reverification
  - reverify this
  - reverify the work
  - independent verification
  - LLM-uncheatable check
  - pre-existing verification
  - 第三方再验证
  - 用 repo 之外的方法验证
  - 不让 LLM 作弊的验证
---

# /reverification — 第三方再验证（pre-existing & LLM-uncheatable）

```
   __                                                          .---.
 _(o o)<   呷呷~ 鸭鸭是 by-hand only 的再验证向导            ( raw  )
  \   )     不写死步骤、不调 repo 自家工具                   ( evi  )
   `-'      由 LLM 现场从「repo 还没出生时就存在」的          ( dence )
            验证宇宙里挑 3-5 个，跑出 raw evidence，          `-----'
            再用 evidence 反推 PASS / FAIL                       ↑
                                                                 │
                                                          外部物理 / 密码学
                                                          / 网络 / 第三方
```

## 灵魂条款（不要违反）

这只 skill 不写死任何脚本、任何固定命令、任何固定顺序。**调用时**的 LLM 自己负责挑、自己负责跑、自己负责诚实承认抓不到证据时的失败。

为什么这样？因为 TeamBrain 自家的验证体系（judge harness / fastprobe / `/review` / feature-verification gates）都是 repo 出生**之后**才有的，LLM 完全可以理解它们的内部逻辑并伪造看起来合理的 output。「pre-existing & uncheatable」的本质是：**验证结果依赖 LLM 触碰不到的外部现实** —— 它不知道某个信息，而这个信息必须通过物理世界、密码学机制、外部网络或第三方信任才能获得。

优先级链：**硬件锚定 > 密码学承诺 > 外部真实系统 > 数学决定性证明**。

## 验证宇宙（10 家族菜单 —— LLM 现场选，不是清单）

| # | 家族 | 代表手段 | 为什么 LLM 作弊不了 |
|---|------|---------|---------------------|
| 1 | Cryptographic / hash / signature | Merkle 证明、RSA/ECDSA、PKI 链、RFC 3161 时间戳、HMAC、ZKP、homomorphic hash | 私钥 / 共享密钥 / 真实数据 hash 链 LLM 拿不到 |
| 2 | Hardware-backed security | TPM EK、SGX/TrustZone enclave、HSM、Secure Boot、TEE remote attestation | 芯片级信任根，飞地内存不可读 |
| 3 | Blockchain / distributed consensus | PoW 链历史、智能合约状态、ENS、IPFS CID、Sigstore/Rekor 签名 commit | 共识 / 透明日志需多方算力，LLM 单方面改不动 |
| 4 | External real-system APIs | 天气、ADS-B 航班、交易所 order book、卫星图像、IoT 传感器、医疗 telemetry、SCADA | 真实物理信号 / 实时下行数据，LLM 接不到 |
| 5 | Mathematical decidable proofs | SAT/SMT solver、Coq/Lean、DH/ECDH、KZG commitment、SNARK | 机器证明 + kernel 校验，LLM 绕不过 |
| 6 | Temporal / ordering | NTP、Lamport 向量、FIFO 队列、VDF（verifiable delay function）、可验证延迟编码 | 真实时间流逝，LLM 在推理时压缩不了 |
| 7 | Content / media authenticity | EXIF、相机 RAW、视频关键帧 hash、音频声纹、FASTQ DNA reads、质谱原始数据 | 仪器硬件签名 / 物理传感器原始噪声分布 |
| 8 | Physical / geographic | GPS+原子钟、RFID/NFC PUF 标签、邮政追踪、SWIFT 电文、公证档案、法院案号 | 卫星定位 / 物理不可克隆函数 / 政府登记 |
| 9 | Network / transport | TCP seq number、TLS handshake 机密、DNSSEC、mTLS 双向证书 | 三次握手随机数 / pre-master secret LLM 预测不到 |
| 10 | Third-party trust anchors | Sigstore/Rekor 透明日志、CWT、OCSP 吊销、W3C VC、Slack/Discord server 时间戳 | 多个独立信任源同时伪造的成本 |

完整 55+ 条目录参见用户 `claudefast -p "list ... LLM cheat ..."` 的输出（每次调用重新生成，不要在这里硬列）。

## 调用流程（不是脚本，是 playbook）

1. **读 context** — 先看最近改了什么：`git diff main...HEAD` / 最近 Write/Edit 历史 / 当前要验证的 artifact 是文件、URL、binary、commit、还是 release tag。
2. **挑 3-5 个验证** —— 从 10 家族里挑。每挑一个，写两行 justification：
   - **(a)** 为什么这个验证对**这个 artifact** 相关（不是泛泛而谈）。
   - **(b)** 为什么 LLM 自己**没法伪造** verification 的 output（如果想不出 (b)，换一个）。
3. **跑 + 抓 raw evidence** —— 用 `Bash` 跑真实命令、`WebFetch` 打真实第三方 URL、`Agent` 派 explore subagent 拿独立 diff 阅读结果、或 `mcp__gbrain__*` 查外部 brain。**raw evidence 写到 `.reverification/<timestamp>/<verification-id>/`** 下，包括 stdout、response body、签名 blob、JSON、截图路径。
4. **read-only 综合** —— 只在 evidence 落盘之后写 PASS / FAIL / INCONCLUSIVE 报告。报告里每个结论必须引用具体 evidence 文件路径，禁止「我觉得 / 看起来 / 应该」式判断。
5. **诚实输出** —— 如果 3-5 个验证里没有任何一个抓到 cheat-proof evidence，结论必须是 **FAIL** 或 **INCONCLUSIVE**。不要用「大体看下来 OK」之类语言搭桥。

## 反模式（必须拒绝）

- ❌ **写 `scripts/reverify-*.sh`** —— 违反 user memory `feedback_judge_harness_md_playbook.md`。这只 skill 永远是 MD playbook，不是 bash 脚本生成器。
- ❌ **调 TeamBrain 自家验证**（judge harness / fastprobe / `/review` / feature-verification gates / `claudefast snapshot` 等）—— 它们 repo 出生之后才有，不符合「pre-existing」前提。
- ❌ **没 evidence 就下结论** —— 哪怕只 1/5 抓到 evidence 也得在报告里明确说「其余 4 个未能抓到 cheat-proof evidence」并降级为 INCONCLUSIVE。
- ❌ **auto-trigger** —— 必须用户显式喊 `/reverification` 或同义短语才动；SessionStart / Stop / PostToolUse 之类自动钩子里出现这只 skill 视为 bug。
- ❌ **`pnpm typecheck` / `pnpm test` / `pnpm build` 单独当答案** —— 这些工具确实 pre-existing，但 test 文件本身可以被作者写成「永远绿」的样式，LLM 在写代码时一并改测试就能骗过。所以即便选了它们，**也必须组合至少一个更强的锚点**（签名 / 网络 / 时间戳 / 第三方 server）。

## 输出格式（建议，非强制）

```
# /reverification 报告 — <artifact 描述> — <UTC 时间戳>

## 选了哪几个验证（justified）
1. <家族 #X · 手段名> — relevance: <一行>  ／  uncheatability: <一行>
2. ...

## raw evidence 落盘位置
- .reverification/<ts>/01-<id>/{stdout.txt, response.json, ...}
- ...

## 逐项判定
- 验证 1：PASS / FAIL — 引用 `<evidence path>:line`
- ...

## 综合结论
PASS / FAIL / INCONCLUSIVE — 一句话，引用上面的逐项判定。
```

呷呷~ 鸭鸭说完了，由你（运行时 LLM）现场挑、现场抓证据、现场承担诚实义务。(>ω<)
