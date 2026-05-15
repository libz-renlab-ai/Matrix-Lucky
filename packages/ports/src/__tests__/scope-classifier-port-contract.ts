import { describe, it, expect } from "vitest";
import type { ScopeClassifierPort } from "../scope-classifier-port.js";

/**
 * ScopeClassifierPort 契约。保守倾向：宁可 personal 不 shareable。
 */
export function runScopeClassifierPortContract(
  factory: () => ScopeClassifierPort
): void {
  describe("ScopeClassifierPort contract", () => {
    const port = factory();

    it("纯流程经验 → shareable", async () => {
      const r = await port.classify(
        "PR 合并后必须跑 codex review 直到 silent，不能假定 CI green = ship"
      );
      expect(r.scope).toBe("shareable");
    });

    it("代码模式建议 → shareable", async () => {
      const r = await port.classify(
        "新增 Port 必须先写契约测试再写实现，避免实现欺骗测试"
      );
      expect(r.scope).toBe("shareable");
    });

    it("含本机绝对路径 → personal（兜底；正式拦截在闸门 1）", async () => {
      const r = await port.classify(
        "我电脑的 db 密码在 /Users/alice/.config/db.json"
      );
      expect(r.scope).toBe("personal");
    });

    it("含具体人名 + 上下文 → personal", async () => {
      const r = await port.classify(
        "李四之前在 ACME 公司用过这个方法，他说不行"
      );
      expect(r.scope).toBe("personal");
    });

    it("空字符串或极短 → uncertain（默认按 personal）", async () => {
      const r = await port.classify("");
      expect(r.scope === "uncertain" || r.scope === "personal").toBe(true);
    });

    it("reason 字段非空", async () => {
      const r = await port.classify("PR 后必须 fetch codex review");
      expect(r.reason.length).toBeGreaterThan(0);
    });
  });
}
