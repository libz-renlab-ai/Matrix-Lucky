import type { Validator } from "@teamagent/ports";
import { validateLevel0 } from "./l0.js";
import { validateLevel1 } from "./l1.js";
import { validateLevel2 } from "./l2.js";

/**
 * 默认 Validator 实现——把 L0/L1/L2 合成单接口对象。
 * 通过 Validator 契约测试（见 packages/ports/contracts）。
 */
export const defaultValidator: Validator = {
  validateLevel0,
  validateLevel1,
  validateLevel2,
};

export { validateLevel0, validateLevel1, validateLevel2 };
