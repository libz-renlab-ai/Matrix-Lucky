import type { AttributionEvent, VisibilityMode } from "@teamagent/types";

/**
 * 归因事件渲染器。把事件列表渲染成用户可见文本。
 * 按 VisibilityMode 决定显示粒度（silent/smart/verbose）。
 */
export interface Renderer {
  /**
   * 把事件列表渲染成单一字符串（可能含换行）。
   * silent 模式返回空串。
   */
  render(events: AttributionEvent[], mode: VisibilityMode): string;
}
