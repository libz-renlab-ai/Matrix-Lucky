import { describe, it, expect } from "vitest";
import {
  parseManifest,
  serializeManifest,
  validateManifest,
} from "../manifest.js";
import type { Manifest } from "@teamagent/types";

const valid: Manifest = {
  schema_version: 1,
  teamagent_version: "0.9.4",
  required_plugins: ["playground"],
  required_project_skills: [".claude/skills/canary"],
  required_hooks: ["UserPromptSubmit", "Stop"],
  created_by: "alice",
  created_at: "2026-05-06T10:00:00Z",
};

describe("manifest parse/validate/serialize", () => {
  it("parseManifest accepts a valid JSON string", () => {
    const json = JSON.stringify(valid);
    const m = parseManifest(json);
    expect(m).toEqual(valid);
  });

  it("parseManifest throws on invalid JSON", () => {
    expect(() => parseManifest("{not-json")).toThrow(/JSON/);
  });

  it("validateManifest rejects unsupported schema_version", () => {
    const bad = { ...valid, schema_version: 99 } as unknown as Manifest;
    expect(() => validateManifest(bad)).toThrow(/schema_version/);
  });

  it("validateManifest rejects missing required_plugins", () => {
    const bad = { ...valid } as Partial<Manifest>;
    delete bad.required_plugins;
    expect(() => validateManifest(bad as Manifest)).toThrow(/required_plugins/);
  });

  it("validateManifest rejects empty created_by", () => {
    const bad = { ...valid, created_by: "" };
    expect(() => validateManifest(bad)).toThrow(/created_by/);
  });

  it("serializeManifest produces canonical JSON (key-sorted, 2-space indent)", () => {
    const out = serializeManifest(valid);
    const reparsed = JSON.parse(out);
    expect(Object.keys(reparsed)).toEqual([...Object.keys(reparsed)].sort());
    expect(out).toMatch(/^\{\n  /);
  });

  it("serializeManifest round-trips through parseManifest", () => {
    const out = serializeManifest(valid);
    expect(parseManifest(out)).toEqual(valid);
  });
});
