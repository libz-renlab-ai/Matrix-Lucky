#!/usr/bin/env tsx
import { DualLayerStore } from "../packages/adapters/src/index.js";
import os from "node:os";
import path from "node:path";

const s = new DualLayerStore({
  projectDbPath: path.join(process.cwd(), ".teamagent", "knowledge.db"),
  userGlobalDbPath: path.join(os.homedir(), ".teamagent", "global.db"),
});

const BAD_ID = "glob-20260414080446-jkguoj";
const projectStore = s.getProjectStore();
const globalStore = s.getGlobalStore();
const e = projectStore.getById(BAD_ID) ?? globalStore.getById(BAD_ID);
if (!e) {
  console.log("rule not found:", BAD_ID);
} else {
  const target = projectStore.getById(BAD_ID) ? projectStore : globalStore;
  target.update(BAD_ID, {
    status: "archived" as const,
    reasoning:
      (e.reasoning ?? "") +
      " [REFUTED 2026-04-22: empirical test shows hooks DO fire under --dangerously-skip-permissions; flag only skips interactive permission prompts, not hook execution]",
  });
  console.log("archived:", BAD_ID);
  console.log("original trigger:", e.trigger);
  console.log("original wrong_pattern:", e.wrong_pattern);
}
s.close();
