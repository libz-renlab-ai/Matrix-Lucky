import { describe, it, expect } from "vitest";
import { detectStack, type FilePresence } from "../index.js";

/** Build a FilePresence from a simple map of path → content. */
function mkFs(files: Record<string, string | true>): FilePresence {
  return {
    exists: (p) => p in files,
    read: (p) => {
      const v = files[p];
      return typeof v === "string" ? v : undefined;
    },
  };
}

describe("detectStack", () => {
  it("empty project → all empty arrays", () => {
    const r = detectStack(mkFs({}));
    expect(r.languages).toEqual([]);
    expect(r.frameworks).toEqual([]);
    expect(r.packageManagers).toEqual([]);
    expect(r.testRunners).toEqual([]);
    expect(r.otherSignals).toEqual([]);
  });

  it("detects TypeScript + pnpm + React + vitest", () => {
    const r = detectStack(
      mkFs({
        "package.json": JSON.stringify({
          name: "app",
          dependencies: { react: "^18.0.0" },
          devDependencies: { vitest: "^1.0.0", typescript: "^5.0.0" },
        }),
        "tsconfig.json": true,
        "pnpm-lock.yaml": true,
      }),
    );
    expect(r.languages).toContain("typescript");
    expect(r.languages).toContain("javascript");
    expect(r.frameworks).toContain("react");
    expect(r.testRunners).toContain("vitest");
    expect(r.packageManagers).toContain("pnpm");
  });

  it("detects monorepo via pnpm-workspace.yaml", () => {
    const r = detectStack(
      mkFs({
        "package.json": "{}",
        "pnpm-workspace.yaml": true,
      }),
    );
    expect(r.otherSignals).toContain("monorepo");
  });

  it("detects monorepo via package.json workspaces", () => {
    const r = detectStack(
      mkFs({
        "package.json": JSON.stringify({ name: "r", workspaces: ["packages/*"] }),
      }),
    );
    expect(r.otherSignals).toContain("monorepo");
  });

  it("detects Python + FastAPI + pytest", () => {
    const r = detectStack(
      mkFs({
        "pyproject.toml": `[tool.poetry]
name = "x"

[tool.poetry.dependencies]
fastapi = "^0.100"
pytest = "^7"`,
      }),
    );
    expect(r.languages).toContain("python");
    expect(r.frameworks).toContain("fastapi");
    expect(r.testRunners).toContain("pytest");
    expect(r.packageManagers).toContain("poetry");
  });

  it("detects Go", () => {
    const r = detectStack(mkFs({ "go.mod": "module x" }));
    expect(r.languages).toEqual(["go"]);
  });

  it("detects Rust + cargo", () => {
    const r = detectStack(mkFs({ "Cargo.toml": "[package]\nname = \"x\"" }));
    expect(r.languages).toEqual(["rust"]);
    expect(r.packageManagers).toContain("cargo");
  });

  it("detects Java (maven)", () => {
    const r = detectStack(mkFs({ "pom.xml": "<project/>" }));
    expect(r.languages).toEqual(["java"]);
    expect(r.packageManagers).toContain("maven");
  });

  it("detects Kotlin via build.gradle.kts", () => {
    const r = detectStack(mkFs({ "build.gradle.kts": "plugins {}" }));
    expect(r.languages).toContain("kotlin");
    expect(r.languages).toContain("java");
    expect(r.packageManagers).toContain("gradle");
  });

  it("detects docker + github-actions + claude-code + cursor", () => {
    const r = detectStack(
      mkFs({
        Dockerfile: true,
        ".github/workflows": true,
        "CLAUDE.md": true,
        ".cursorrules": true,
      }),
    );
    expect(r.otherSignals.sort()).toEqual(
      ["claude-code", "cursor", "docker", "github-actions"].sort(),
    );
  });

  it("polyglot: TS + Python + Go all coexist", () => {
    const r = detectStack(
      mkFs({
        "package.json": "{}",
        "tsconfig.json": true,
        "pyproject.toml": "name = 'x'",
        "go.mod": "module m",
      }),
    );
    expect(r.languages.sort()).toEqual(["go", "javascript", "python", "typescript"]);
  });

  it("malformed package.json → no framework detection, still marks js", () => {
    const r = detectStack(
      mkFs({
        "package.json": "{ not json",
      }),
    );
    expect(r.languages).toContain("javascript");
    expect(r.frameworks).toEqual([]);
  });

  it("raw field records provenance signals", () => {
    const r = detectStack(mkFs({ "go.mod": "m" }));
    expect(r.raw.languages).toContain("go.mod");
  });
});
