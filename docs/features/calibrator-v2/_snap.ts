import fs from "node:fs";
import { DualLayerStore } from "../../../packages/adapters/src/index.js";

const projectDbPath = process.env.PROJECT_DB!;
const globalDbPath  = process.env.GLOBAL_DB!;
const outPath       = process.env.SNAP_OUT!;

const store = new DualLayerStore({ projectDbPath, userGlobalDbPath: globalDbPath });
const all = store.getAll();
store.close();

const snap: Record<string, { confidence: number; demerit: number; tier: string }> = {};
for (const e of all) {
  snap[e.id] = { confidence: e.confidence, demerit: e.demerit, tier: e.current_tier };
}

fs.writeFileSync(outPath, JSON.stringify(snap, null, 2));
process.stdout.write(`snapshot: ${all.length} entries → ${outPath}\n`);
