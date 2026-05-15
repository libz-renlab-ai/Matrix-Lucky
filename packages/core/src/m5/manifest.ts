import type { Manifest } from "@teamagent/types";

/**
 * 解析 manifest JSON 字符串。无效 JSON 或字段不合法均抛错。
 */
export function parseManifest(json: string): Manifest {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new Error(`manifest: invalid JSON: ${(e as Error).message}`);
  }
  validateManifest(raw as Manifest);
  return raw as Manifest;
}

/**
 * 校验 manifest 字段合法性。
 */
export function validateManifest(m: Manifest): void {
  if (m === null || typeof m !== "object") {
    throw new Error("manifest: must be an object");
  }
  if (m.schema_version !== 1) {
    throw new Error(
      `manifest: unsupported schema_version ${m.schema_version}; expected 1`
    );
  }
  if (typeof m.teamagent_version !== "string") {
    throw new Error("manifest: teamagent_version must be a string");
  }
  if (!Array.isArray(m.required_plugins)) {
    throw new Error("manifest: required_plugins must be an array");
  }
  if (!Array.isArray(m.required_project_skills)) {
    throw new Error("manifest: required_project_skills must be an array");
  }
  if (!Array.isArray(m.required_hooks)) {
    throw new Error("manifest: required_hooks must be an array");
  }
  if (typeof m.created_by !== "string" || m.created_by.length === 0) {
    throw new Error("manifest: created_by must be non-empty string");
  }
  if (typeof m.created_at !== "string") {
    throw new Error("manifest: created_at must be ISO 8601 string");
  }
}

/**
 * 把 manifest 序列化成稳定的 JSON：top-level keys 字典序、2-space indent。
 * 团队成员 commit 同一个 manifest 时 diff 友好。
 */
export function serializeManifest(m: Manifest): string {
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(m).sort()) {
    sorted[k] = (m as unknown as Record<string, unknown>)[k];
  }
  return JSON.stringify(sorted, null, 2);
}
