import { describe, it, expect } from "vitest";
import { decideShareAction } from "../auto-share-pipeline.js";

describe("decideShareAction", () => {
  it("scan hit → seal_in_l1 (override 不可绕)", () => {
    const a = decideShareAction({
      scan: {
        hit: true,
        matches: [
          { kind: "api_token", snippet: "sk-X[redacted]", start: 0, end: 10 },
        ],
      },
      classification: { scope: "shareable", reason: "..." },
      userOverride: "team",
    });
    expect(a.kind).toBe("seal_in_l1");
    expect(a.reason).toContain("api_token");
  });

  it("user override personal → keep_in_l1", () => {
    const a = decideShareAction({
      scan: { hit: false, matches: [] },
      classification: { scope: "shareable", reason: "..." },
      userOverride: "personal",
    });
    expect(a.kind).toBe("keep_in_l1");
    expect(a.reason).toContain("personal");
  });

  it("user override team → promote_to_l2 (闸门 1 通过)", () => {
    const a = decideShareAction({
      scan: { hit: false, matches: [] },
      classification: { scope: "personal", reason: "..." },
      userOverride: "team",
    });
    expect(a.kind).toBe("promote_to_l2");
    expect(a.reason).toContain("team");
  });

  it("classifier shareable + 无 override → promote_to_l2", () => {
    const a = decideShareAction({
      scan: { hit: false, matches: [] },
      classification: { scope: "shareable", reason: "工程流程" },
      userOverride: undefined,
    });
    expect(a.kind).toBe("promote_to_l2");
    expect(a.reason).toContain("工程流程");
  });

  it("classifier personal + 无 override → keep_in_l1", () => {
    const a = decideShareAction({
      scan: { hit: false, matches: [] },
      classification: { scope: "personal", reason: "本机路径" },
      userOverride: undefined,
    });
    expect(a.kind).toBe("keep_in_l1");
    expect(a.reason).toContain("personal");
  });

  it("classifier uncertain + 无 override → keep_in_l1（默认私密）", () => {
    const a = decideShareAction({
      scan: { hit: false, matches: [] },
      classification: { scope: "uncertain", reason: "太短" },
      userOverride: undefined,
    });
    expect(a.kind).toBe("keep_in_l1");
    expect(a.reason).toContain("uncertain");
  });
});
