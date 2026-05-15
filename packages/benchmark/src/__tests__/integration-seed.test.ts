import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { createGroupWorkdir, cleanupGroupWorkdir } from "../isolator.js";
import { openDb, SqliteKnowledgeStore } from "@teamagent/adapters";
import { matchRules } from "@teamagent/core";

const fixturesDir = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "fixtures",
  "groups",
  "teamagent",
);

let workdir: string;

beforeEach(async () => {
  workdir = await createGroupWorkdir(
    { name: "teamagent", fixtureDir: fixturesDir },
    "/tmp/hooks",
  );
});

afterEach(() => cleanupGroupWorkdir(workdir));

describe("teamagent seed integration", () => {
  it("seeded moment rule matches Write call with import moment", () => {
    const db = openDb(path.join(workdir, ".teamagent", "knowledge.db"));
    try {
      const store = new SqliteKnowledgeStore(db);
      const rules = store.findActive();
      expect(rules.length).toBeGreaterThan(0);

      const matches = matchRules(
        {
          toolName: "Write",
          input: {
            file_path: "date.ts",
            content: "import moment from 'moment';",
          },
        },
        rules,
      );
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some((r) => r.id === "rule-moment-to-dayjs")).toBe(true);
    } finally {
      db.close();
    }
  });

});
