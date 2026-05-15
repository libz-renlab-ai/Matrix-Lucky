import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nodeFs from "node:fs";
import path from "node:path";
import os from "node:os";
import { executeReview, parseReviewArgs } from "../commands/review.js";
import { DualLayerStore, openDb } from "@teamagent/adapters";
import type { KnowledgeEntry } from "@teamagent/types";

function mkTmp() {
  const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), "review-"));
  return {
    dir,
    cleanup: () => nodeFs.rmSync(dir, { recursive: true, force: true }),
  };
}

function makeEntry(over: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    id: "x",
    scope: { level: "personal" },
    category: "E",
    tags: ["test"],
    type: "avoidance",
    nature: "subjective",
    trigger: "t",
    wrong_pattern: "",
    correct_pattern: "c",
    reasoning: "r",
    confidence: 0.7,
    enforcement: "warn",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-04-14T00:00:00Z",
    last_hit_at: "",
    last_validated_at: "2026-04-14T00:00:00Z",
    source: "accumulated",
    conflict_with: [],
    current_tier: "experimental" as const,
    max_tier_ever: "experimental" as const,
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    ...over,
  };
}

function openStore(dir: string) {
  const projectDbPath = path.join(dir, ".teamagent", "knowledge.db");
  const userGlobalDbPath = path.join(dir, ".teamagent", "global.db");
  nodeFs.mkdirSync(path.dirname(projectDbPath), { recursive: true });
  nodeFs.mkdirSync(path.dirname(userGlobalDbPath), { recursive: true });
  return new DualLayerStore({ projectDbPath, userGlobalDbPath });
}

describe("executeReview", () => {
  let tmp: ReturnType<typeof mkTmp>;
  beforeEach(() => {
    tmp = mkTmp();
  });
  afterEach(() => tmp.cleanup());

  it("empty state → helpful message", () => {
    const out = executeReview({
      homeDir: tmp.dir,
      cwd: tmp.dir,
    });
    expect(out).toContain("(知识库为空)");
  });

  it("sorts by created_at desc across all scopes", () => {
    const store = openStore(tmp.dir);
    store.add(makeEntry({ id: "t-old", trigger: "old-personal", created_at: "2026-04-10T00:00:00Z" }));
    store.add(makeEntry({ id: "t-new", trigger: "new-personal", created_at: "2026-04-14T10:00:00Z" }));
    store.add(makeEntry({ id: "g-mid", scope: { level: "global" }, trigger: "mid-global", created_at: "2026-04-12T00:00:00Z" }));
    store.close();

    const out = executeReview({
      homeDir: tmp.dir,
      cwd: tmp.dir,
      limit: 10,
    });

    const idxNew = out.indexOf("new-personal");
    const idxMid = out.indexOf("mid-global");
    const idxOld = out.indexOf("old-personal");
    expect(idxNew).toBeGreaterThan(-1);
    expect(idxMid).toBeGreaterThan(idxNew);
    expect(idxOld).toBeGreaterThan(idxMid);
  });

  it("honors --limit", () => {
    const store = openStore(tmp.dir);
    for (let i = 0; i < 5; i++) {
      store.add(makeEntry({
        id: `x-${i}`,
        trigger: `trig-${i}`,
        created_at: `2026-04-14T0${i}:00:00Z`,
      }));
    }
    store.close();

    const out = executeReview({
      homeDir: tmp.dir,
      cwd: tmp.dir,
      limit: 2,
    });
    expect(out).toContain("展示最近 2");
    const hits = ["trig-4", "trig-3", "trig-2", "trig-1", "trig-0"].filter(
      (t) => out.includes(t),
    );
    expect(hits).toHaveLength(2);
  });

  it("honors --scope=personal filter", () => {
    const store = openStore(tmp.dir);
    store.add(makeEntry({ id: "p1", trigger: "only-in-personal", scope: { level: "personal" } }));
    store.add(makeEntry({ id: "g1", scope: { level: "global" }, trigger: "only-in-global" }));
    store.close();

    const out = executeReview({
      homeDir: tmp.dir,
      cwd: tmp.dir,
      scope: "personal",
    });
    expect(out).toContain("only-in-personal");
    expect(out).not.toContain("only-in-global");
  });

  it("honors --scope=global filter", () => {
    const store = openStore(tmp.dir);
    store.add(makeEntry({ id: "p1", trigger: "only-in-personal" }));
    store.add(makeEntry({ id: "g1", scope: { level: "global" }, trigger: "only-in-global" }));
    store.close();

    const out = executeReview({
      homeDir: tmp.dir,
      cwd: tmp.dir,
      scope: "global",
    });
    expect(out).not.toContain("only-in-personal");
    expect(out).toContain("only-in-global");
  });

  it("honors --scope=team filter without mixing personal entries", () => {
    const store = openStore(tmp.dir);
    store.add(makeEntry({ id: "p1", trigger: "only-in-personal", scope: { level: "personal" } }));
    store.add(makeEntry({ id: "t1", trigger: "only-in-team", scope: { level: "team" } }));
    store.add(makeEntry({ id: "g1", trigger: "only-in-global", scope: { level: "global" } }));
    store.close();

    const out = executeReview({
      homeDir: tmp.dir,
      cwd: tmp.dir,
      scope: "team",
    });
    expect(out).toContain("only-in-team");
    expect(out).toContain("team/E/test");
    expect(out).not.toContain("only-in-personal");
    expect(out).not.toContain("only-in-global");
  });

  it("renders category/tags/confidence/enforcement", () => {
    const store = openStore(tmp.dir);
    store.add(makeEntry({
      id: "t1",
      category: "K",
      tags: ["cognition"],
      confidence: 0.82,
      enforcement: "warn",
      trigger: "t",
      correct_pattern: "c",
    }));
    store.close();

    const out = executeReview({
      homeDir: tmp.dir,
      cwd: tmp.dir,
    });
    expect(out).toMatch(/personal\/K\/cognition/);
    expect(out).toContain("conf=0.82");
    expect(out).toContain("warn");
  });
});

describe("parseReviewArgs", () => {
  it("empty args", () => {
    expect(parseReviewArgs([])).toEqual({});
  });

  it("positional number → limit", () => {
    expect(parseReviewArgs(["20"])).toEqual({ limit: 20 });
  });

  it("--limit forms", () => {
    expect(parseReviewArgs(["--limit", "5"])).toEqual({ limit: 5 });
    expect(parseReviewArgs(["--limit=5"])).toEqual({ limit: 5 });
  });

  it("--scope forms", () => {
    expect(parseReviewArgs(["--scope", "team"])).toEqual({ scope: "team" });
    expect(parseReviewArgs(["--scope=personal"])).toEqual({ scope: "personal" });
  });

  it("ignores invalid scope", () => {
    expect(parseReviewArgs(["--scope=foobar"])).toEqual({});
  });
});
