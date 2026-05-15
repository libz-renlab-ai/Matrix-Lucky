import fs from "node:fs";
import { executeCalibrate } from "../../../packages/cli/src/commands/calibrate.js";

const projectDbPath = process.env.PROJECT_DB!;
const globalDbPath  = process.env.GLOBAL_DB!;
const eventsDbPath  = process.env.EVENTS_DB!;
const outPath       = process.env.CAL_OUT!;

const result = await executeCalibrate({
  projectDbPath,
  userGlobalDbPath: globalDbPath,
  eventsDbPath,
  now: () => new Date("2026-04-15T02:00:00Z"),
});

fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
process.stdout.write(`calibrate done: totalAdjusted=${result.totalAdjusted} totalArchived=${result.totalArchived}\n`);
