/**
 * 识别项目的技术栈指纹。纯函数——IO 调用方负责（读 package.json 等文件）。
 *
 * 用途：仅在 init 日志里列出"我识别到你用的是 X + Y"，**不影响规则加载**。
 * 不是闸门，只是归因展示。
 *
 * 设计：输入是 `FilePresence`（一个"这个文件在不在、内容是什么"的抽象），
 * 输出是 `StackFingerprint`。调用方（CLI adapter）把 cwd 下的一组候选文件
 * 预读进来 map，然后喂给这个函数——避免 core 里写 IO。
 */

export interface FilePresence {
  /** 项目根下该相对路径是否存在 */
  exists(relPath: string): boolean;
  /** 读取内容（仅少量关键文件），不存在返回 undefined */
  read(relPath: string): string | undefined;
}

export interface StackFingerprint {
  languages: string[];
  frameworks: string[];
  packageManagers: string[];
  testRunners: string[];
  /** 其他有用信号：docker / ci / monorepo 等 */
  otherSignals: string[];
  /** 原始命中详情（方便日志） */
  raw: Record<string, string[]>;
}

/**
 * 从 FilePresence 识别 stack。顺序不保证（但结果稳定：去重+排序）。
 */
export function detectStack(fs: FilePresence): StackFingerprint {
  const languages = new Set<string>();
  const frameworks = new Set<string>();
  const pms = new Set<string>();
  const testRunners = new Set<string>();
  const other = new Set<string>();
  const raw: Record<string, string[]> = {};

  const note = (bucket: string, signal: string) => {
    if (!raw[bucket]) raw[bucket] = [];
    raw[bucket].push(signal);
  };

  // ---- 包管理器 ----
  if (fs.exists("pnpm-lock.yaml")) {
    pms.add("pnpm");
    note("packageManagers", "pnpm-lock.yaml");
  }
  if (fs.exists("yarn.lock")) {
    pms.add("yarn");
    note("packageManagers", "yarn.lock");
  }
  if (fs.exists("package-lock.json")) {
    pms.add("npm");
    note("packageManagers", "package-lock.json");
  }
  if (fs.exists("bun.lockb") || fs.exists("bun.lock")) {
    pms.add("bun");
    note("packageManagers", "bun.lock*");
  }

  // ---- JS/TS 家族 ----
  const pkgJson = fs.read("package.json");
  if (fs.exists("package.json")) {
    languages.add("javascript");
    note("languages", "package.json");
    if (fs.exists("tsconfig.json") || fs.exists("tsconfig.base.json")) {
      languages.add("typescript");
      note("languages", "tsconfig.json");
    }

    if (pkgJson) {
      const deps = extractDeps(pkgJson);
      const has = (name: string) => deps.includes(name);
      if (has("react")) frameworks.add("react");
      if (has("vue")) frameworks.add("vue");
      if (has("svelte")) frameworks.add("svelte");
      if (has("next")) frameworks.add("next");
      if (has("nuxt")) frameworks.add("nuxt");
      if (has("astro")) frameworks.add("astro");
      if (has("express")) frameworks.add("express");
      if (has("fastify")) frameworks.add("fastify");
      if (has("@nestjs/core")) frameworks.add("nestjs");
      if (has("vitest")) testRunners.add("vitest");
      if (has("jest")) testRunners.add("jest");
      if (has("mocha")) testRunners.add("mocha");
      if (has("playwright") || has("@playwright/test")) testRunners.add("playwright");
      if (has("cypress")) testRunners.add("cypress");
      for (const f of frameworks) note("frameworks", `package.json → ${f}`);
      for (const t of testRunners) note("testRunners", `package.json → ${t}`);
    }
  }

  // monorepo
  if (fs.exists("pnpm-workspace.yaml")) {
    other.add("monorepo");
    note("otherSignals", "pnpm-workspace.yaml");
  } else if (pkgJson && /"workspaces"\s*:/.test(pkgJson)) {
    other.add("monorepo");
    note("otherSignals", 'package.json workspaces');
  }

  // ---- Python ----
  if (fs.exists("pyproject.toml")) {
    languages.add("python");
    note("languages", "pyproject.toml");
    const py = fs.read("pyproject.toml") ?? "";
    if (/poetry/.test(py)) pms.add("poetry");
    if (/\[tool\.uv\]/.test(py) || fs.exists("uv.lock")) pms.add("uv");
    if (/pytest/.test(py)) testRunners.add("pytest");
    if (/django/.test(py)) frameworks.add("django");
    if (/fastapi/.test(py)) frameworks.add("fastapi");
    if (/flask/.test(py)) frameworks.add("flask");
  }
  if (fs.exists("requirements.txt")) {
    languages.add("python");
    note("languages", "requirements.txt");
  }
  if (fs.exists("Pipfile")) {
    languages.add("python");
    pms.add("pipenv");
    note("languages", "Pipfile");
  }

  // ---- Go ----
  if (fs.exists("go.mod")) {
    languages.add("go");
    note("languages", "go.mod");
  }

  // ---- Rust ----
  if (fs.exists("Cargo.toml")) {
    languages.add("rust");
    pms.add("cargo");
    note("languages", "Cargo.toml");
  }

  // ---- Java/Kotlin ----
  if (fs.exists("pom.xml")) {
    languages.add("java");
    pms.add("maven");
    note("languages", "pom.xml");
  }
  if (fs.exists("build.gradle") || fs.exists("build.gradle.kts")) {
    languages.add("java");
    if (fs.exists("build.gradle.kts")) languages.add("kotlin");
    pms.add("gradle");
    note("languages", "build.gradle");
  }

  // ---- CI / Docker ----
  if (fs.exists("Dockerfile") || fs.exists("docker-compose.yml")) {
    other.add("docker");
    note("otherSignals", "Dockerfile/compose");
  }
  if (fs.exists(".github/workflows")) {
    other.add("github-actions");
    note("otherSignals", ".github/workflows");
  }

  // ---- AI 工具约定 ----
  if (fs.exists("CLAUDE.md")) {
    other.add("claude-code");
    note("otherSignals", "CLAUDE.md");
  }
  if (fs.exists(".cursorrules") || fs.exists(".cursor/rules")) {
    other.add("cursor");
    note("otherSignals", ".cursorrules");
  }

  return {
    languages: [...languages].sort(),
    frameworks: [...frameworks].sort(),
    packageManagers: [...pms].sort(),
    testRunners: [...testRunners].sort(),
    otherSignals: [...other].sort(),
    raw,
  };
}

/** 从 package.json 文本里 crude 地抽出 dependencies + devDependencies 的包名列表。 */
function extractDeps(pkgJson: string): string[] {
  try {
    const obj = JSON.parse(pkgJson);
    const names = new Set<string>();
    for (const key of ["dependencies", "devDependencies", "peerDependencies"]) {
      const section = obj[key];
      if (section && typeof section === "object") {
        for (const name of Object.keys(section)) names.add(name);
      }
    }
    return [...names];
  } catch {
    return [];
  }
}
