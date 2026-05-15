import type {
  Manifest,
  LocalState,
  BootstrapDiff,
  HookKind,
} from "@teamagent/types";

/**
 * 比较 manifest 与本机状态，输出引导差异。纯函数。
 */
export function computeBootstrapDiff(
  m: Manifest,
  s: LocalState
): BootstrapDiff {
  const installVer = needsTeamagentVersion(m.teamagent_version, s.teamagent_version);
  const missingPlugins = diffMissing(m.required_plugins, s.installed_plugins);
  const missingSkills = diffMissing(
    m.required_project_skills,
    s.installed_project_skills
  );
  const missingHooks = diffMissing(
    m.required_hooks,
    s.installed_hooks
  ) as HookKind[];

  const needs =
    installVer !== null ||
    missingPlugins.length > 0 ||
    missingSkills.length > 0 ||
    missingHooks.length > 0;

  return {
    needs_bootstrap: needs,
    install_teamagent_version: installVer,
    install_plugins: missingPlugins,
    install_project_skills: missingSkills,
    install_hooks: missingHooks,
  };
}

function needsTeamagentVersion(
  required: string,
  installed: string | null
): string | null {
  if (required === "") return null;
  if (installed === null) return required;
  if (compareSemver(installed, required) >= 0) return null;
  return required;
}

function diffMissing<T extends string>(
  required: readonly T[],
  installed: readonly T[]
): T[] {
  const have = new Set(installed);
  return required.filter((x) => !have.has(x));
}

/**
 * 三段 semver 比较。不支持 pre-release tag。返回 -1 / 0 / 1。
 */
function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) | 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) | 0);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}
