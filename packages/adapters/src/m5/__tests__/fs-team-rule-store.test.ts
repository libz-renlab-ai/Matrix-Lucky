import { describe } from "vitest";
import { runTeamRuleStorePortContract } from "@teamagent/ports/contracts";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { FsTeamRuleStore } from "../fs-team-rule-store.js";

describe("FsTeamRuleStore", () => {
  runTeamRuleStorePortContract(async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "m5-fs-team-store-")
    );
    return {
      port: new FsTeamRuleStore(),
      projectRoot,
      cleanup: async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
      },
    };
  });
});
